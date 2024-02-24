import { Attachment, ChatInputCommandInteraction, GuildMember, Message, Snowflake, User } from "discord.js";
import { GuildPluginData } from "knub";
import { CaseTypes } from "../../../../data/CaseTypes";
import { LogType } from "../../../../data/LogType";
import { humanizeDurationShort } from "../../../../humanizeDurationShort";
import { canActOn, getContextChannel, isContextInteraction, sendContextResponse } from "../../../../pluginUtils";
import { DAYS, MINUTES, SECONDS, noop, resolveUser, notifyUser } from "../../../../utils";
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

export async function actualMassBanCmd(
  pluginData: GuildPluginData<ModActionsPluginType>,
  context: Message | ChatInputCommandInteraction,
  userIds: string[],
  author: GuildMember,
  reason: string,
  attachments: Attachment[],
) {
  // Limit to 100 users at once (arbitrary?)
  if (userIds.length > 100) {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, `Can only massban max 100 users at once`);
    return;
  }

  if (await handleAttachmentLinkDetectionAndGetRestriction(pluginData, context, reason)) {
    return;
  }

  const config = pluginData.config.get();
  const shouldLogEachCase = pluginData.getPlugin(CasesPlugin).shouldLogEachMassBanCase();
  const parsedReason = parseReason(pluginData.config.get(), reason);
  const banReason = await formatReasonWithMessageLinkForAttachments(pluginData, parsedReason, context, attachments);
  const banReasonWithAttachments = formatReasonWithAttachments(parsedReason, attachments);

  // Verify we can act on each of the users specified
  for (const userId of userIds) {
    const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
    if (member && !canActOn(pluginData, author, member)) {
      pluginData
        .getPlugin(CommonPlugin)
        .sendErrorMessage(context, "Cannot massban one or more users: insufficient permissions");
      return;
    }
  }

  // Show a loading indicator since this can take a while
  const maxWaitTime = pluginData.state.massbanQueue.timeout * pluginData.state.massbanQueue.length;
  const maxWaitTimeFormatted = humanizeDurationShort(maxWaitTime, { round: true });
  const initialLoadingText =
    pluginData.state.massbanQueue.length === 0
      ? "Banning..."
      : `Massban queued. Waiting for previous massban to finish (max wait ${maxWaitTimeFormatted}).`;
  const loadingMsg = await sendContextResponse(context, { content: initialLoadingText, ephemeral: true });

  const waitTimeStart = performance.now();
  const waitingInterval = setInterval(() => {
    const waitTime = humanizeDurationShort(performance.now() - waitTimeStart, { round: true });
    const waitMessageContent = `Massban queued. Still waiting for previous massban to finish (waited ${waitTime}).`;

    if (isContextInteraction(context)) {
      context.editReply(waitMessageContent).catch(() => clearInterval(waitingInterval));
    } else {
      loadingMsg.edit(waitMessageContent).catch(() => clearInterval(waitingInterval));
    }
  }, 1 * MINUTES);

  pluginData.state.massbanQueue.add(async () => {
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
      void context.editReply("Banning...").catch(noop);
    } else {
      void loadingMsg.edit("Banning...").catch(noop);
    }

    // Ban each user and count failed bans (if any)
    const startTime = performance.now();
    const failedBans: string[] = [];
    const casesPlugin = pluginData.getPlugin(CasesPlugin);
    const messageConfig = isContextInteraction(context)
      ? await pluginData.config.getForInteraction(context)
      : await pluginData.config.getForChannel(await getContextChannel(context));
    const deleteDays = messageConfig.ban_delete_message_days;

    for (const [i, userId] of userIds.entries()) {
      if (pluginData.state.unloaded) {
        break;
      }

      try {
        // Ignore automatic ban cases and logs
        // We create our own cases below and post a single "mass banned" log instead
        ignoreEvent(pluginData, IgnoredEventType.Ban, userId, 30 * MINUTES);

        if (!shouldLogEachCase) {
          pluginData.state.serverLogs.ignoreLog(LogType.MEMBER_BAN, userId, 30 * MINUTES);
        }

        if (config.ban_message) {
          const user = (await resolveUser(pluginData.client, userId)) as User;

          if (user.id) {
            const banMessage = await renderTemplate(
              config.ban_message,
              new TemplateSafeValueContainer({
                guildName: pluginData.guild.name,
                reason: banReasonWithAttachments,
                moderator: userToTemplateSafeUser(author.user),
              }),
            );

            await notifyUser(user, banMessage, [{ type: "dm" }]);
          }
        }

        await pluginData.guild.bans.create(userId as Snowflake, {
          deleteMessageSeconds: (deleteDays * DAYS) / SECONDS,
          reason: banReasonWithAttachments,
        });

        const createdCase = await casesPlugin.createCase({
          userId,
          modId: author.id,
          type: CaseTypes.Ban,
          reason: `Mass ban: ${banReason}`,
          postInCaseLogOverride: shouldLogEachCase,
        });

        if (shouldLogEachCase) {
          const user = await resolveUser(pluginData.client, userId);

          pluginData.getPlugin(LogsPlugin).logMemberBan({
            mod: author.user,
            user,
            caseNumber: createdCase.case_number,
            reason: `Mass ban: ${banReason}`,
          });
        }

        pluginData.state.events.emit("ban", userId, banReason);
      } catch {
        failedBans.push(userId);
      }

      // Send a status update every 10 bans
      if ((i + 1) % 10 === 0) {
        const newLoadingMessageContent = `Banning... ${i + 1}/${userIds.length}`;

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

    const successfulBanCount = userIds.length - failedBans.length;
    if (successfulBanCount === 0) {
      // All bans failed - don't create a log entry and notify the user
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, "All bans failed. Make sure the IDs are valid.");
    } else {
      // Some or all bans were successful. Create a log entry for the mass ban and notify the user.
      pluginData.getPlugin(LogsPlugin).logMassBan({
        mod: author.user,
        count: successfulBanCount,
        reason: banReason,
      });

      if (failedBans.length) {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(
            context,
            `Banned ${successfulBanCount} users in ${formattedTimeTaken}, ${
              failedBans.length
            } failed: ${failedBans.join(" ")}`,
          );
      } else {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(context, `Banned ${successfulBanCount} users successfully in ${formattedTimeTaken}`);
      }
    }
  });
}
