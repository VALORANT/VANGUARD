import { ChatInputCommandInteraction, GuildMember, Message, Snowflake, User } from "discord.js";
import { GuildPluginData } from "knub";
import { waitForReply } from "knub/helpers";
import { humanizeDurationShort } from "../../../../humanizeDurationShort";
import { canActOn, getContextChannel, sendContextResponse } from "../../../../pluginUtils";
import { MINUTES, noop, resolveMember, resolveUser } from "../../../../utils";
import { CommonPlugin } from "../../../Common/CommonPlugin";
import { LogsPlugin } from "../../../Logs/LogsPlugin";
import { ModActionsPluginType } from "../../types";
import { handleAttachmentLinkDetectionAndGetRestriction } from "../attachmentLinkReaction";
import { formatReasonWithAttachments, formatReasonWithMessageLinkForAttachments } from "../formatReasonForAttachments";
import { parseReason } from "../parseReason";
import { performance } from "perf_hooks";
import { warnMember } from "../warnMember";

export async function actualMassWarnCmd(
  pluginData: GuildPluginData<ModActionsPluginType>,
  context: Message | ChatInputCommandInteraction,
  userIds: string[],
  author: GuildMember,
) {
  // Limit to 100 users at once (arbitrary?)
  if (userIds.length > 100) {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, `Can only masswarn max 100 users at once`);
    return;
  }

  // Ask for warn reason (cleaner this way instead of trying to cram it into the args)
  sendContextResponse(context, "Warn reason? `cancel` to cancel");
  const warnReasonReply = await waitForReply(pluginData.client, await getContextChannel(context), author.id);
  if (!warnReasonReply || !warnReasonReply.content || warnReasonReply.content.toLowerCase().trim() === "cancel") {
    pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, "Cancelled");
    return;
  }

  if (await handleAttachmentLinkDetectionAndGetRestriction(pluginData, context, warnReasonReply.content)) {
    return;
  }

  const parsedReason = parseReason(pluginData.config.get(), warnReasonReply.content);
  const warnReason = await formatReasonWithMessageLinkForAttachments(pluginData, parsedReason, warnReasonReply, [
    ...warnReasonReply.attachments.values(),
  ]);
  const warnReasonWithAttachments = formatReasonWithAttachments(parsedReason, [
    ...warnReasonReply.attachments.values(),
  ]);

  // Verify we can act on each of the users specified
  for (const userId of userIds) {
    const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
    if (member && !canActOn(pluginData, author, member)) {
      pluginData
        .getPlugin(CommonPlugin)
        .sendErrorMessage(context, "Cannot masswarn one or more users: insufficient permissions");
      return;
    }
  }

  // Show a loading indicator since this can take a while
  const maxWaitTime = pluginData.state.masswarnQueue.timeout * pluginData.state.masswarnQueue.length;
  const maxWaitTimeFormatted = humanizeDurationShort(maxWaitTime, { round: true });
  const initialLoadingText =
    pluginData.state.masswarnQueue.length === 0
      ? "Warning..."
      : `Masswarn queued. Waiting for previous masswarn to finish (max wait ${maxWaitTimeFormatted}).`;
  const loadingMsg = await sendContextResponse(context, initialLoadingText);

  const waitTimeStart = performance.now();
  const waitingInterval = setInterval(() => {
    const waitTime = humanizeDurationShort(performance.now() - waitTimeStart, { round: true });
    loadingMsg
      .edit(`Masswarn queued. Still waiting for previous masswarn to finish (waited ${waitTime}).`)
      .catch(() => clearInterval(waitingInterval));
  }, 1 * MINUTES);

  pluginData.state.masswarnQueue.add(async () => {
    clearInterval(waitingInterval);

    if (pluginData.state.unloaded) {
      void loadingMsg.delete().catch(noop);
      return;
    }

    void loadingMsg.edit("Warning...").catch(noop);

    // Warn each user and count failed warns (if any)
    const startTime = performance.now();
    const failedWarns: string[] = [];
    for (const [i, userId] of userIds.entries()) {
      // Send a status update every 10 warns
      if ((i + 1) % 10 === 0) {
        loadingMsg.edit(`Warning... ${i + 1}/${userIds.length}`).catch(noop);
      }

      if (pluginData.state.unloaded) {
        break;
      }

      const user = (await resolveUser(pluginData.client, userId)) as User;
      if (!user.id) {
        continue;
      }

      const memberToWarn = await resolveMember(pluginData.client, pluginData.guild, user.id);

      try {
        const warnResult = await warnMember(pluginData, warnReason, warnReasonWithAttachments, user, memberToWarn, {
          contactMethods: [{ type: "dm" }],
          caseArgs: {
            modId: author.id,
            ppId: undefined,
            reason: warnReason,
          },
          silentErrors: true,
        });

        if (warnResult.status === "failed") {
          failedWarns.push(userId);
        }
      } catch {
        failedWarns.push(userId);
      }
    }

    const totalTime = performance.now() - startTime;
    const formattedTimeTaken = humanizeDurationShort(totalTime, { round: true });

    // Clear loading indicator
    loadingMsg.delete().catch(noop);

    const successfulWarnCount = userIds.length - failedWarns.length;
    if (successfulWarnCount === 0) {
      // All warns failed - don't create a log entry and notify the user
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(context, "All warns failed. Make sure the IDs are valid.");
    } else {
      // Some or all warns were successful. Create a log entry for the mass warn and notify the user.
      pluginData.getPlugin(LogsPlugin).logMassWarn({
        mod: author.user,
        count: successfulWarnCount,
        reason: `Mass warn: ${warnReason}`,
      });

      if (failedWarns.length) {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(
            context,
            `Warned ${successfulWarnCount} users in ${formattedTimeTaken}, ${
              failedWarns.length
            } failed: ${failedWarns.join(" ")}`,
          );
      } else {
        pluginData
          .getPlugin(CommonPlugin)
          .sendSuccessMessage(context, `Warned ${successfulWarnCount} users successfully in ${formattedTimeTaken}`);
      }
    }
  });
}
