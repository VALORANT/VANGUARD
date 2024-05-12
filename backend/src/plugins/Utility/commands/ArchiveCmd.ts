import { GuildPluginData } from "knub";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { SavedMessage } from "../../../data/entities/SavedMessage";
import { getDashboardUrl } from "../../../pluginUtils";
import { utilityCmd, UtilityPluginType } from "../types";

const DEFAULT_COUNT = 50;
const MAX_COUNT = 1000;

export async function archiveMessages(
  pluginData: GuildPluginData<UtilityPluginType>,
  messagesToArchive: SavedMessage[],
) {
  messagesToArchive = Array.from(messagesToArchive).sort((a, b) => (a.posted_at > b.posted_at ? 1 : -1));

  const archiveId = await pluginData.state.archives.createFromSavedMessages(messagesToArchive, pluginData.guild);
  const baseUrl = getDashboardUrl(pluginData);

  return pluginData.state.archives.getUrl(baseUrl, archiveId);
}

const opts = {
  count: ct.number({ option: true, shortcut: "c" }),
};

export interface ArchiveArgs {
  userId: string;
  count?: number;
}

export async function archiveCmd(pluginData: GuildPluginData<UtilityPluginType>, args: ArchiveArgs | any, msg) {
  args.count = args.count ?? DEFAULT_COUNT;

  if (args.count > MAX_COUNT || args.count <= 0) {
    pluginData.state.common.sendErrorMessage(msg, `Archive count must be between 1 and ${MAX_COUNT}`);
    return;
  }

  const archivingMessage = msg.channel.send("Archiving...");
  const messagesToArchive = await pluginData.state.savedMessages.getUserMessages(args.userId, args.count);

  if (messagesToArchive.length > 0) {
    const archiveResult = await archiveMessages(pluginData, messagesToArchive);
    let responseText = `Archived ${messagesToArchive.length} message${messagesToArchive.length === 1 ? "" : "s"}`;

    responseText += `\n${archiveResult}`;
    await pluginData.state.common.sendSuccessMessage(msg, responseText);
  } else {
    const responseText = `Found no messages to archive!`;
    await pluginData.state.common.sendErrorMessage(msg, responseText);
  }

  await (await archivingMessage).delete();
}

export const ArchiveCmd = utilityCmd({
  trigger: ["archive"],
  description: "Archive a number of messages for a user",
  usage: "!archive 106391128718245888",
  permission: "can_archive",

  signature: [
    {
      userId: ct.userId(),
      ...opts,
    },
  ],

  async run({ message: msg, args, pluginData }) {
    archiveCmd(pluginData, args, msg);
  },
});
