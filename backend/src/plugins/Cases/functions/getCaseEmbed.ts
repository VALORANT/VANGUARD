import { escapeCodeBlock, MessageCreateOptions, MessageEditOptions } from "discord.js";
import { GuildPluginData } from "knub";
import moment from "moment-timezone";
import { CaseTypes } from "../../../data/CaseTypes";
import { Case } from "../../../data/entities/Case";
import { areCasesGlobal } from "../../../pluginUtils";
import { chunkMessageLines, emptyEmbedValue, messageLink } from "../../../utils";
import { TimeAndDatePlugin } from "../../TimeAndDate/TimeAndDatePlugin";
import { CasesPluginType } from "../types";
import { getCaseColor } from "./getCaseColor";
import { getCaseIcon } from "./getCaseIcon";
import { resolveCaseId } from "./resolveCaseId";

export async function getCaseEmbed(
  pluginData: GuildPluginData<CasesPluginType>,
  caseOrCaseId: Case | number,
  requestMemberId?: string,
  noOriginalCaseLink?: boolean,
): Promise<MessageCreateOptions & MessageEditOptions> {
  const theCase = await pluginData.state.cases
    .with("notes")
    .find(resolveCaseId(caseOrCaseId), areCasesGlobal(pluginData));

  if (!theCase) {
    throw new Error("Unknown case");
  }

  const timeAndDate = pluginData.getPlugin(TimeAndDatePlugin);

  const createdAt = moment.utc(theCase.created_at);
  const actionTypeStr = CaseTypes[theCase.type].toUpperCase();

  let userName = theCase.user_name;
  if (theCase.user_id && theCase.user_id !== "0") userName += `\n<@!${theCase.user_id}>`;

  let modName = theCase.mod_name;
  if (theCase.mod_id) modName += `\n<@!${theCase.mod_id}>`;

  const createdAtWithTz = requestMemberId
    ? await timeAndDate.inMemberTz(requestMemberId, createdAt)
    : timeAndDate.inGuildTz(createdAt);

  const config = pluginData.config.get();
  const icon = getCaseIcon(pluginData, theCase.type);
  const embedColour = config.embed_colour ?? config.embed_color ?? 0x2b2d31;
  const guildName =
    config.guild_aliases && theCase.guild_id in config.guild_aliases
      ? config.guild_aliases[theCase.guild_id]
      : pluginData.client.guilds.cache.get(theCase.guild_id)?.name ?? theCase.guild_id;

  const embed: any = {
    title: `${icon} ${actionTypeStr} - Case #${theCase.case_number}`.trim(),
    color: embedColour,
    footer: {
      text: `Case created on ${createdAtWithTz.format(timeAndDate.getDateFormat("pretty_datetime"))}`,
    },
    fields: [
      {
        name: "User",
        value: userName,
        inline: true,
      },
      {
        name: "Moderator",
        value: modName,
        inline: true,
      },
      {
        name: "Server",
        value: `**${guildName}**`,
        inline: true,
      },
    ],
  };

  if (theCase.pp_id) {
    embed.fields[1].value += `\np.p. ${theCase.pp_name}\n<@!${theCase.pp_id}>`;
  }

  if (theCase.is_hidden) {
    embed.title += " (hidden)";
  }

  embed.color = getCaseColor(pluginData, theCase.type);

  if (theCase.notes.length) {
    for (const note of theCase.notes) {
      const noteDate = moment.utc(note.created_at);
      let noteBody = escapeCodeBlock(note.body.trim());
      if (noteBody === "") {
        noteBody = emptyEmbedValue;
      }

      const chunks = chunkMessageLines(noteBody, 1014);

      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          const noteDateWithTz = requestMemberId
            ? await timeAndDate.inMemberTz(requestMemberId, noteDate)
            : timeAndDate.inGuildTz(noteDate);
          const prettyNoteDate = noteDateWithTz.format(timeAndDate.getDateFormat("pretty_datetime"));
          embed.fields.push({
            name: `${note.mod_name} at ${prettyNoteDate}:`,
            value: chunks[i],
          });
        } else {
          embed.fields.push({
            name: emptyEmbedValue,
            value: chunks[i],
          });
        }
      }
    }
  } else {
    embed.fields.push({
      name: "!!! THIS CASE HAS NO NOTES !!!",
      value: "\u200B",
    });
  }

  if (theCase.log_message_id && noOriginalCaseLink !== false) {
    const [channelId, messageId] = theCase.log_message_id.split("-");
    const link = messageLink(pluginData.guild.id, channelId, messageId);
    embed.fields.push({
      name: emptyEmbedValue,
      value: `[Go to original case in case log channel](${link})`,
    });
  }

  return { embeds: [embed] };
}
