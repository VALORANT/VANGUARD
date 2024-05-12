import { slashOptions } from "knub";
import { generateAttachmentSlashOptions, retrieveMultipleOptions } from "../../../../utils/multipleSlashOptions";
import { modActionsSlashCmd } from "../../types";
import { NUMBER_ATTACHMENTS_CASE_CREATION } from "../constants";
import { slashCmdReasonAliasAutocomplete } from "../../functions/slashCmdReasonAliasAutocomplete";
import { actualNoteCmd } from "./actualNoteCmd";

const opts = [
  {
    ...slashOptions.string({ name: "note", description: "The note to add to the user", required: false }),
    getExtraAPIProps: () => ({
      autocomplete: true,
    }),
  },
  ...generateAttachmentSlashOptions(NUMBER_ATTACHMENTS_CASE_CREATION, {
    name: "attachment",
    description: "An attachment to add to the note",
  }),
];

export function NoteSlashCmdAutocomplete({ pluginData, interaction }) {
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name !== "note") {
    interaction.respond([]);
    return;
  }

  slashCmdReasonAliasAutocomplete({ pluginData, interaction });
}

export const NoteSlashCmd = modActionsSlashCmd({
  name: "note",
  configPermission: "can_note",
  description: "Add a note to the specified user",
  allowDms: false,

  signature: [slashOptions.user({ name: "user", description: "The user to add a note to", required: true }), ...opts],

  async run({ interaction, options, pluginData }) {
    await interaction.deferReply({ ephemeral: true });
    const attachments = retrieveMultipleOptions(NUMBER_ATTACHMENTS_CASE_CREATION, options, "attachment");

    if ((!options.note || options.note.trim() === "") && attachments.length < 1) {
      pluginData.state.common.sendErrorMessage(interaction, "Text or attachment required", undefined, undefined, true);

      return;
    }

    actualNoteCmd(pluginData, interaction, interaction.user, attachments, options.user, options.note || "");
  },
});
