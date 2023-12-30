import { Snowflake, User } from "discord.js";
import { waitForReply } from "knub/helpers";
import { performance } from "perf_hooks";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { CaseTypes } from "../../../data/CaseTypes";
import { LogType } from "../../../data/LogType";
import { humanizeDurationShort } from "../../../humanizeDurationShort";
import { canActOn, sendErrorMessage, sendSuccessMessage } from "../../../pluginUtils";
import { TemplateSafeValueContainer, renderTemplate } from "../../../templateFormatter";
import { DAYS, MINUTES, SECONDS, noop, notifyUser, resolveUser } from "../../../utils";
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

export const MassbanCmd = modActionsCmd({
  trigger: "massban",
  permission: "can_massban",
  description: "Mass-ban a list of user IDs",

  signature: [
    {
      userIds: ct.string({ rest: true }),
    },
  ],

  async run({ pluginData, message: msg, args }) {
    // Limit to 100 users at once (arbitrary?)
    if (args.userIds.length > 100) {
      sendErrorMessage(pluginData, msg.channel, `Can only massban max 100 users at once`);
      return;
    }

    // Ask for ban reason (cleaner this way instead of trying to cram it into the args)
    msg.channel.send("Ban reason? `cancel` to cancel");
    const banReasonReply = await waitForReply(pluginData.client, msg.channel, msg.author.id);
    if (!banReasonReply || !banReasonReply.content || banReasonReply.content.toLowerCase().trim() === "cancel") {
      sendErrorMessage(pluginData, msg.channel, "Cancelled");
      return;
    }

    if (handleAttachmentLinkDetectionAndGetRestriction(pluginData, msg.channel, banReasonReply.content)) {
      return;
    }

    const config = pluginData.config.get();
    const casesConfig = pluginData.fullConfig.plugins.cases.config;
    const banReason = parseReason(config, formatReasonWithMessageLinkForAttachments(banReasonReply.content, msg));
    const banReasonWithAttachments = parseReason(
      config,
      formatReasonWithAttachments(banReasonReply.content, [...msg.attachments.values()]),
    );

    // Verify we can act on each of the users specified
    for (const userId of args.userIds) {
      const member = pluginData.guild.members.cache.get(userId as Snowflake); // TODO: Get members on demand?
      if (member && !canActOn(pluginData, msg.member, member)) {
        sendErrorMessage(pluginData, msg.channel, "Cannot massban one or more users: insufficient permissions");
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
    const loadingMsg = await msg.channel.send(initialLoadingText);

    const waitTimeStart = performance.now();
    const waitingInterval = setInterval(() => {
      const waitTime = humanizeDurationShort(performance.now() - waitTimeStart, { round: true });
      loadingMsg
        .edit(`Massban queued. Still waiting for previous massban to finish (waited ${waitTime}).`)
        .catch(() => clearInterval(waitingInterval));
    }, 1 * MINUTES);

    pluginData.state.massbanQueue.add(async () => {
      clearInterval(waitingInterval);

      if (pluginData.state.unloaded) {
        void loadingMsg.delete().catch(noop);
        return;
      }

      void loadingMsg.edit("Banning...").catch(noop);

      // Ban each user and count failed bans (if any)
      const startTime = performance.now();
      const failedBans: string[] = [];
      const casesPlugin = pluginData.getPlugin(CasesPlugin);
      const deleteDays = (await pluginData.config.getForMessage(msg)).ban_delete_message_days;

      for (const [i, userId] of args.userIds.entries()) {
        if (pluginData.state.unloaded) {
          break;
        }

        try {
          // Ignore automatic ban cases and logs
          // We create our own cases below and post a single "mass banned" log instead
          ignoreEvent(pluginData, IgnoredEventType.Ban, userId, 30 * MINUTES);

          if (!casesConfig.log_each_massban_case) {
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
                  moderator: userToTemplateSafeUser(msg.author),
                }),
              );

              await notifyUser(user, banMessage, [{ type: "dm" }]);
            }
          }

          await pluginData.guild.bans.create(userId as Snowflake, {
            deleteMessageSeconds: (deleteDays * DAYS) / SECONDS,
            reason: banReason,
          });

          const createdCase = await casesPlugin.createCase({
            userId,
            modId: msg.author.id,
            type: CaseTypes.Ban,
            reason: `Mass ban: ${banReason}`,
            postInCaseLogOverride: casesConfig.log_each_massban_case ?? false,
          });

          if (casesConfig.log_each_massban_case) {
            const mod = await resolveUser(pluginData.client, msg.author.id);
            const user = await resolveUser(pluginData.client, userId);

            pluginData.getPlugin(LogsPlugin).logMemberBan({
              mod,
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
          loadingMsg.edit(`Banning... ${i + 1}/${args.userIds.length}`).catch(noop);
        }
      }

      const totalTime = performance.now() - startTime;
      const formattedTimeTaken = humanizeDurationShort(totalTime, { round: true });

      // Clear loading indicator
      loadingMsg.delete().catch(noop);

      const successfulBanCount = args.userIds.length - failedBans.length;
      if (successfulBanCount === 0) {
        // All bans failed - don't create a log entry and notify the user
        sendErrorMessage(pluginData, msg.channel, "All bans failed. Make sure the IDs are valid.");
      } else {
        // Some or all bans were successful. Create a log entry for the mass ban and notify the user.
        pluginData.getPlugin(LogsPlugin).logMassBan({
          mod: msg.author,
          count: successfulBanCount,
          reason: banReason,
        });

        if (failedBans.length) {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Banned ${successfulBanCount} users in ${formattedTimeTaken}, ${
              failedBans.length
            } failed: ${failedBans.join(" ")}`,
          );
        } else {
          sendSuccessMessage(
            pluginData,
            msg.channel,
            `Banned ${successfulBanCount} users successfully in ${formattedTimeTaken}`,
          );
        }
      }
    });
  },
});
