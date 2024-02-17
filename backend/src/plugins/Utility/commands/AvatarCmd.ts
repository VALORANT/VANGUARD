import { AttachmentBuilder } from "discord.js";
import { commandTypeHelpers as ct } from "../../../commandTypes";
import { UnknownUser, renderUsername } from "../../../utils";
import { CommonPlugin } from "../../Common/CommonPlugin";
import { utilityCmd } from "../types";

export const AvatarCmd = utilityCmd({
  trigger: ["avatar", "av"],
  description: "Retrieves a user's profile picture",
  permission: "can_avatar",

  signature: {
    user: ct.resolvedMember({ required: false }) || ct.resolvedUserLoose({ required: false }),
  },

  async run({ message: msg, args, pluginData }) {
    const user = args.user ?? msg.member ?? msg.author;

    if (user instanceof UnknownUser) {
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, "Invalid user ID");

      return;
    }

    const config = pluginData.config.get();
    const member = await pluginData.guild.members.fetch(user.id).catch(() => null);
    const url = (member ?? user).displayAvatarURL({ size: 2048 });
    const title = `Avatar of ${renderUsername(user)}:`;

    await msg.channel.send(
      config.avatar_spoilered
        ? { content: title, files: [new AttachmentBuilder(url, { name: "SPOILER_avatar.png" })] }
        : { embeds: [{ image: { url }, title, color: config.embed_colour ?? config.embed_color }] },
    );
  },
});
