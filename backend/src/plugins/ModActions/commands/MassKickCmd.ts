import { GuildMember, Snowflake } from "discord.js";
import { waitForReply } from "knub/helpers";
import { performance } from "perf_hooks";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { CaseTypes } from "../../../data/CaseTypes";
import { LogType } from "../../../data/LogType";
import { humanizeDurationShort } from "../../../humanizeDurationShort";
import { canActOn, sendErrorMessage, sendSuccessMessage } from "../../../pluginUtils";
import { TemplateSafeValueContainer, renderTemplate } from "../../../templateFormatter";
import { MINUTES, noop, notifyUser, resolveMember } from "../../../utils";
import { userToTemplateSafeUser } from "../../../utils/templateSafeObjects";
import { CasesPlugin } from "../../Cases/CasesPlugin";
import { LogsPlugin } from "../../Logs/LogsPlugin";
import { handleAttachmentLinkDetectionAndGetRestriction } from "../functions/detectAttachmentLink";
import {
  formatReasonWithAttachments,
  formatReasonWithMessageLinkForAttachments,
} from "../functions/formatReasonForAttachments";
import { ignoreEvent } from "../functions/ignoreEvent";
import { parseReason } from "../functions/parseReason";
import { IgnoredEventType, modActionsCmd } from "../types";

export const MasskickCmd = modActionsCmd({
  trigger: "masskick",
  permission: "can_masskick",
  description: "Mass-kick a list of user IDs",

  signature: [
    {
      userIds: ct.string({ rest: true }),
    },
  ],

  async run({ pluginData, message: msg, args }) {
    // Limit to 100 users at once (arbitrary?)
    if (args.userIds.length > 100) {
      sendErrorMessage(pluginData, msg.channel, `Can only masskick max 100 users at once`);
      return;
    }

    // Ask for kick reason (cleaner this way instead of trying to cram it into the args)
    msg.channel.send("Kick reason? `cancel` to cancel");
    const kickReasonReply = await waitForReply(pluginData.client, msg.channel, msg.author.id);
    if (!kickReasonReply || !kickReasonReply.content || kickReasonReply.content.toLowerCase().trim() === "cancel") {
      sendErrorMessage(pluginData, msg.channel, "Cancelled");
      return;
    }

    if (handleAttachmentLinkDetectionAndGetRestriction(pluginData, msg.channel, kickReasonReply.content)) {
      return;
    }

    const kickReason = parseReason(
      pluginData.config.get(),
      formatReasonWithMessageLinkForAttachments(kickReasonReply.content, msg),
    );
    const kickReasonWithAttachments = parseReason(
      pluginData.config.get(),
      formatReasonWithAttachments(kickReasonReply.content, [...msg.attachments.values()]),
    );

    // Verify we can act on each of the users specified
    for (const userId of args.userIds) {
      const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
      if (member && !canActOn(pluginData, msg.member, member)) {
        sendErrorMessage(pluginData, msg.channel, "Cannot masskick one or more users: insufficient permissions");
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
    const loadingMsg = await msg.channel.send(initialLoadingText);

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

      for (const [i, userId] of args.userIds.entries()) {
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
                  moderator: userToTemplateSafeUser(msg.author),
                }),
              );

              await notifyUser(member.user, kickMessage, [{ type: "dm" }]);
            }
          }

          await member.kick(kickReason);

          await casesPlugin.createCase({
            userId,
            modId: msg.author.id,
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
          loadingMsg.edit(`Kicking... ${i + 1}/${args.userIds.length}`).catch(noop);
        }
      }

      const totalTime = performance.now() - startTime;
      const formattedTimeTaken = humanizeDurationShort(totalTime, { round: true });

      // Clear loading indicator
      loadingMsg.delete().catch(noop);

      const successfulKickCount = args.userIds.length - failedKicks.length;
      if (successfulKickCount === 0) {
        // All kicks failed - don't create a log entry and notify the user
        sendErrorMessage(pluginData, msg.channel, "All kicks failed. Make sure the IDs are valid.");
      } else {
        // Some or all kicks were successful. Create a log entry for the mass kick and notify the user.
        pluginData.getPlugin(LogsPlugin).logMassKick({
          mod: msg.author,
          count: successfulKickCount,
          reason: kickReason,
        });

        if (failedKicks.length) {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Kicked ${successfulKickCount} users in ${formattedTimeTaken}, ${
              failedKicks.length
            } failed: ${failedKicks.join(" ")}`,
          );
        } else {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Kicked ${successfulKickCount} users successfully in ${formattedTimeTaken}`,
          );
        }
      }
    });
  },
});
