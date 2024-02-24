import { Attachment, ChatInputCommandInteraction, GuildMember, Message, Snowflake } from "discord.js";
import { GuildPluginData } from "knub";
import { CaseTypes } from "../../../../data/CaseTypes";
import { LogType } from "../../../../data/LogType";
import { humanizeDurationShort } from "../../../../humanizeDurationShort";
import { canActOn, isContextInteraction, sendContextResponse } from "../../../../pluginUtils";
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
  reason: string,
  attachments: Attachment[],
) {
  // Limit to 100 users at once (arbitrary?)
  if (userIds.length > 100) {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, `Can only masskick max 100 users at once`);
    return;
  }

  if (await handleAttachmentLinkDetectionAndGetRestriction(pluginData, context, reason)) {
    return;
  }

  const parsedReason = parseReason(pluginData.config.get(), reason);
  const kickReason = await formatReasonWithMessageLinkForAttachments(pluginData, parsedReason, context, attachments);
  const kickReasonWithAttachments = formatReasonWithAttachments(parsedReason, attachments);

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
  const loadingMsg = await sendContextResponse(context, { content: initialLoadingText, ephemeral: true });

  const waitTimeStart = performance.now();
  const waitingInterval = setInterval(() => {
    const waitTime = humanizeDurationShort(performance.now() - waitTimeStart, { round: true });
    const waitMessageContent = `Masskick queued. Still waiting for previous masskick to finish (waited ${waitTime}).`;

    if (isContextInteraction(context)) {
      context.editReply(waitMessageContent).catch(() => clearInterval(waitingInterval));
    } else {
      loadingMsg.edit(waitMessageContent).catch(() => clearInterval(waitingInterval));
    }
  }, 1 * MINUTES);

  pluginData.state.masskickQueue.add(async () => {
    clearInterval(waitingInterval);

    if (pluginData.state.unloaded) {
      if (isContextInteraction(context)) {
        void context.deleteReply().catch(noop);
      } else {
        void loadingMsg.delete().catch(noop);
      }

      return;
    }

    if (isContextInteraction(context)) {
      void context.editReply("Kicking...").catch(noop);
    } else {
      void loadingMsg.edit("Kicking...").catch(noop);
    }

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
        const newLoadingMessageContent = `Kicking... ${i + 1}/${userIds.length}`;

        if (isContextInteraction(context)) {
          void context.editReply(newLoadingMessageContent).catch(noop);
        } else {
          loadingMsg.edit(newLoadingMessageContent).catch(noop);
        }
      }
    }

    const totalTime = performance.now() - startTime;
    const formattedTimeTaken = humanizeDurationShort(totalTime, { round: true });

    if (!isContextInteraction(context)) {
      // Clear loading indicator
      loadingMsg.delete().catch(noop);
    }

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
