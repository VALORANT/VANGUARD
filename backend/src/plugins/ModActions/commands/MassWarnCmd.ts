import { Snowflake, TextChannel, User } from "discord.js";
import { waitForReply } from "knub/helpers";
import { performance } from "perf_hooks";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { humanizeDurationShort } from "../../../humanizeDurationShort";
import { canActOn, sendErrorMessage, sendSuccessMessage } from "../../../pluginUtils";
import { MINUTES, noop, resolveMember, resolveUser } from "../../../utils";
import { LogsPlugin } from "../../Logs/LogsPlugin";
import { handleAttachmentLinkDetectionAndGetRestriction } from "../functions/detectAttachmentLink";
import {
  formatReasonWithAttachments,
  formatReasonWithMessageLinkForAttachments,
} from "../functions/formatReasonForAttachments";
import { parseReason } from "../functions/parseReason";
import { warnMember } from "../functions/warnMember";
import { modActionsCmd } from "../types";

export const MassWarnCmd = modActionsCmd({
  trigger: "masswarn",
  permission: "can_masswarn",
  description: "Mass-warn a list of user IDs",

  signature: [
    {
      userIds: ct.string({ rest: true }),
    },
  ],

  async run({ pluginData, message: msg, args }) {
    // Limit to 100 users at once (arbitrary?)
    if (args.userIds.length > 100) {
      sendErrorMessage(pluginData, msg.channel, `Can only masswarn max 100 users at once`);
      return;
    }

    // Ask for warn reason (cleaner this way instead of trying to cram it into the args)
    msg.channel.send("Warn reason? `cancel` to cancel");
    const warnReasonReply = await waitForReply(pluginData.client, msg.channel as TextChannel, msg.author.id);
    if (!warnReasonReply || !warnReasonReply.content || warnReasonReply.content.toLowerCase().trim() === "cancel") {
      sendErrorMessage(pluginData, msg.channel, "Cancelled");
      return;
    }

    if (handleAttachmentLinkDetectionAndGetRestriction(pluginData, msg.channel, warnReasonReply.content)) {
      return;
    }

    const config = pluginData.config.get();
    const warnReason = parseReason(
      config,
      formatReasonWithMessageLinkForAttachments(warnReasonReply.content, warnReasonReply),
    );
    const warnReasonWithAttachments = parseReason(
      config,
      formatReasonWithAttachments(warnReasonReply.content, [...warnReasonReply.attachments.values()]),
    );

    // Verify we can act on each of the users specified
    for (const userId of args.userIds) {
      const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
      if (member && !canActOn(pluginData, msg.member, member)) {
        sendErrorMessage(pluginData, msg.channel, "Cannot masswarn one or more users: insufficient permissions");
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
    const loadingMsg = await msg.channel.send(initialLoadingText);

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
      for (const [i, userId] of args.userIds.entries()) {
        // Send a status update every 10 warns
        if ((i + 1) % 10 === 0) {
          loadingMsg.edit(`Warning... ${i + 1}/${args.userIds.length}`).catch(noop);
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
          const warnResult = await warnMember(pluginData, warnReason, warnReasonWithAttachments, memberToWarn, user, {
            contactMethods: [{ type: "dm" }],
            caseArgs: {
              modId: msg.member.id,
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

      const successfulWarnCount = args.userIds.length - failedWarns.length;
      if (successfulWarnCount === 0) {
        // All warns failed - don't create a log entry and notify the user
        sendErrorMessage(pluginData, msg.channel, "All warns failed. Make sure the IDs are valid.");
      } else {
        // Some or all warns were successful. Create a log entry for the mass warn and notify the user.
        pluginData.getPlugin(LogsPlugin).logMassWarn({
          mod: msg.author,
          count: successfulWarnCount,
          reason: `Mass warn: ${warnReason}`,
        });

        if (failedWarns.length) {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Warned ${successfulWarnCount} users in ${formattedTimeTaken}, ${
              failedWarns.length
            } failed: ${failedWarns.join(" ")}`,
          );
        } else {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Warned ${successfulWarnCount} users successfully in ${formattedTimeTaken}`,
          );
        }
      }
    });
  },
});
