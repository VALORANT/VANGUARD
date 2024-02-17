import { ChatInputCommandInteraction, GuildMember, Message, Snowflake } from "discord.js";
import { GuildPluginData } from "knub";
import { waitForReply } from "knub/helpers";
import { CaseTypes } from "../../../../data/CaseTypes";
import { LogType } from "../../../../data/LogType";
import { humanizeDurationShort } from "../../../../humanizeDurationShort";
import { canActOn, getContextChannel, sendContextResponse } from "../../../../pluginUtils";
import { MINUTES, noop, notifyUser, resolveMember } from "../../../../utils";
import { CasesPlugin } from "../../../Cases/CasesPlugin";
import { CommonPlugin } from "../../../Common/CommonPlugin";
import { LogsPlugin } from "../../../Logs/LogsPlugin";
import { IgnoredEventType, ModActionsPluginType } from "../../types";
import { handleAttachmentLinkDetectionAndGetRestriction } from "../attachmentLinkReaction";
import { formatReasonWithAttachments, formatReasonWithMessageLinkForAttachments } from "../formatReasonForAttachments";
import { ignoreEvent } from "../ignoreEvent";
import { renderTemplate, TemplateSafeValueContainer } from "../../../../templateFormatter";
import { userToTemplateSafeUser } from "../../../../utils/templateSafeObjects";
import { parseReason } from "../parseReason";
import { performance } from "perf_hooks";

export async function actualMassKickCmd(
  pluginData: GuildPluginData<ModActionsPluginType>,
  context: Message | ChatInputCommandInteraction,
  userIds: string[],
  author: GuildMember,
) {
  // Limit to 100 users at once (arbitrary?)
  if (userIds.length > 100) {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, `Can only masskick max 100 users at once`);
    return;
  }

  // Ask for kick reason (cleaner this way instead of trying to cram it into the args)
  sendContextResponse(context, "Kick reason? `cancel` to cancel");
  const kickReasonReply = await waitForReply(pluginData.client, await getContextChannel(context), author.id);
  if (!kickReasonReply || !kickReasonReply.content || kickReasonReply.content.toLowerCase().trim() === "cancel") {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, "Cancelled");
    return;
  }

  if (await handleAttachmentLinkDetectionAndGetRestriction(pluginData, context, kickReasonReply.content)) {
    return;
  }

  const parsedReason = parseReason(pluginData.config.get(), kickReasonReply.content);
  const kickReason = await formatReasonWithMessageLinkForAttachments(pluginData, parsedReason, kickReasonReply, [
    ...kickReasonReply.attachments.values(),
  ]);
  const kickReasonWithAttachments = formatReasonWithAttachments(parsedReason, [
    ...kickReasonReply.attachments.values(),
  ]);

  // Verify we can act on each of the users specified
  for (const userId of userIds) {
    const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
    if (member && !canActOn(pluginData, author, member)) {
      pluginData
        .getPlugin(CommonPlugin)
        .sendErrorMessage(context, "Cannot masskick one or more users: insufficient permissions");
      return;
    }
  }

  // Show a loading indicator since this can take a while
  const maxWaitTime = pluginData.state.masskickQueue.timeout * pluginData.state.masskickQueue.length;
  const maxWaitTimeFormatted = humanizeDurationShort(maxWaitTime, { round: true });
  const initialLoadingText =
    pluginData.state.masskickQueue.length === 0
      ? "Kicking..."
      : `Masskick queued. Waiting for previous masskick to finish (max wait ${maxWaitTimeFormatted}).`;
  const loadingMsg = await sendContextResponse(context, initialLoadingText);

  const waitTimeStart = performance.now();
  const waitingInterval = setInterval(() => {
    const waitTime = humanizeDurationShort(performance.now() - waitTimeStart, { round: true });
    loadingMsg
      .edit(`Masskick queued. Still waiting for previous masskick to finish (waited ${waitTime}).`)
      .catch(() => clearInterval(waitingInterval));
  }, 1 * MINUTES);

  pluginData.state.masskickQueue.add(async () => {
    clearInterval(waitingInterval);

    if (pluginData.state.unloaded) {
      void loadingMsg.delete().catch(noop);
      return;
    }

    void loadingMsg.edit("Kicking...").catch(noop);

    // Kick each user and count failed kicks (if any)
    const startTime = performance.now();
    const failedKicks: string[] = [];
    const casesPlugin = pluginData.getPlugin(CasesPlugin);
    const config = pluginData.config.get();

    for (const [i, userId] of userIds.entries()) {
      if (pluginData.state.unloaded) {
        break;
      }

      try {
        // Ignore automatic kick cases and logs
        // We create our own cases below and post a single "mass kicked" log instead
        ignoreEvent(pluginData, IgnoredEventType.Kick, userId, 30 * MINUTES);
        pluginData.state.serverLogs.ignoreLog(LogType.MEMBER_KICK, userId, 30 * MINUTES);

        const member = (await resolveMember(pluginData.client, pluginData.guild, userId)) as GuildMember;

        if (!member) {
          throw new Error(`Masskick: Unknown member ${userId}`);
        }

        if (config.kick_message) {
          if (member.user?.id) {
            const kickMessage = await renderTemplate(
              config.kick_message,
              new TemplateSafeValueContainer({
                guildName: pluginData.guild.name,
                reason: kickReasonWithAttachments,
                moderator: userToTemplateSafeUser(author.user),
              }),
            );

            await notifyUser(member.user, kickMessage, [{ type: "dm" }]);
          }
        }

        await member.kick(kickReason);

        await casesPlugin.createCase({
          userId,
          modId: author.id,
          type: CaseTypes.Kick,
          reason: `Mass kick: ${kickReason}`,
          postInCaseLogOverride: false,
        });

        pluginData.state.events.emit("kick", userId, kickReason);
      } catch {
        failedKicks.push(userId);
      }

      // Send a status update every 10 kicks
      if ((i + 1) % 10 === 0) {
        loadingMsg.edit(`Kicking... ${i + 1}/${userIds.length}`).catch(noop);
      }
    }

    const totalTime = performance.now() - startTime;
    const formattedTimeTaken = humanizeDurationShort(totalTime, { round: true });

    // Clear loading indicator
    loadingMsg.delete().catch(noop);

    const successfulKickCount = userIds.length - failedKicks.length;
    if (successfulKickCount === 0) {
      // All kicks failed - don't create a log entry and notify the user
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, "All kicks failed. Make sure the IDs are valid.");
    } else {
      // Some or all kicks were successful. Create a log entry for the mass kick and notify the user.
      pluginData.getPlugin(LogsPlugin).logMassKick({
        mod: author.user,
        count: successfulKickCount,
        reason: kickReason,
      });

      if (failedKicks.length) {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(
            context,
            `Kicked ${successfulKickCount} users in ${formattedTimeTaken}, ${
              failedKicks.length
            } failed: ${failedKicks.join(" ")}`,
          );
      } else {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(context, `Kicked ${successfulKickCount} users successfully in ${formattedTimeTaken}`);
      }
    }
  });
}
