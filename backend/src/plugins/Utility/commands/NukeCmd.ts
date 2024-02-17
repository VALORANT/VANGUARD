import { Message, TextChannel } from "discord.js";
import { GuildPluginData } from "knub";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { humanizeDurationShort } from "../../../humanizeDurationShort";
import { canActOn } from "../../../pluginUtils";
import { DAYS, HOURS, SECONDS, noop, resolveMember } from "../../../utils";
import { cleanMessages } from "../functions/cleanMessages";
import { UtilityPluginType, utilityCmd } from "../types";
import { CommonPlugin } from "../../Common/CommonPlugin";

const MAX_NUKE_TIME = 1 * DAYS;
const DEFAULT_NUKE_TIME = 2 * HOURS;
const NUKE_COMMAND_DELETE_DELAY = 10 * SECONDS;

async function canNukeChannel(pluginData: GuildPluginData<UtilityPluginType>, channel: TextChannel, msg: Message) {
  const configForTargetChannel = await pluginData.config.getMatchingConfig({
    userId: msg.author.id,
    member: msg.member,
    channelId: channel.id,
    categoryId: channel.parentId,
  });

  return configForTargetChannel.can_nuke;
}

async function cleanup(nukingMessage: Promise<Message>, msg: Message, responseMsg?: Message) {
  await (await nukingMessage).delete();

  setTimeout(() => {
    msg.delete().catch(noop);
    responseMsg?.delete().catch(noop);
  }, NUKE_COMMAND_DELETE_DELAY);
}

export const NukeCmd = utilityCmd({
  trigger: ["nuke", "purgeuser", "purge-user", "purgemessages", "purge-messages"],
  description: "Remove a number of recent messages",
  usage: "!nuke 141288766760288256",
  permission: "can_nuke",

  signature: [
    {
      user: ct.string(),
    },
    {
      user: ct.string(),
      time: ct.delay(),
    },
  ],

  async run({ message: msg, args, pluginData }) {
    if (args.time && args.time > MAX_NUKE_TIME) {
      pluginData
        .getPlugin(CommonPlugin)
        .sendErrorMessage(msg, `Maximum nuke time is ${humanizeDurationShort(MAX_NUKE_TIME)}`);
      return;
    }

    if (args.user === pluginData.client.user?.id) {
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, `I don't want to nuke my own messages!`);
      return;
    }

    const memberToNuke = await resolveMember(pluginData.client, pluginData.guild, args.user);

    if (memberToNuke && !canActOn(pluginData, msg.member, memberToNuke)) {
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, `You cannot nuke this member's messages.`);
      return;
    }

    const nukeTime = args.time || DEFAULT_NUKE_TIME;
    const nukingMessage = msg.channel.send("Nuking...");
    const responseText: string[] = ["Nuking complete.", ""];
    const messagesToNuke = await pluginData.state.savedMessages.getRecentFromUserByChannel(args.user, nukeTime);

    if (messagesToNuke.length < 1) {
      await cleanup(
        nukingMessage,
        msg,
        await pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, `Found no messages to nuke!`),
      );

      return;
    }

    for (const { channelId, messages } of messagesToNuke) {
      const targetChannel = (await pluginData.guild.channels.fetch(channelId)) as TextChannel;

      if (!targetChannel?.isTextBased()) {
        continue;
      }

      if (!(await canNukeChannel(pluginData, targetChannel, msg))) {
        responseText.push(`No permission to nuke <#${channelId}>, skipping...`);

        continue;
      }

      const cleanResult = await cleanMessages(pluginData, targetChannel, messages, msg.author);

      responseText.push(
        `Cleaned ${messages.length} ${messages.length === 1 ? "message" : "messages"} in <#${channelId}>: ${
          cleanResult.archiveUrl
        }`,
      );
    }

    await cleanup(
      nukingMessage,
      msg,
      await pluginData.getPlugin(CommonPlugin).sendSuccessMessage(msg, responseText.join("\n")),
    );
  },
});
