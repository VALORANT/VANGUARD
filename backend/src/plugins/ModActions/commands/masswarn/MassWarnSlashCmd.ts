import { slashOptions } from "knub";
import { actualMassWarnCmd } from "../../functions/actualCommands/actualMassWarnCmd";

export const MassWarnSlashCmd = {
  name: "masswarn",
  configPermission: "can_masswarn",
  description: "Mass-warn a list of user IDs",
  allowDms: false,

  signature: [slashOptions.string({ name: "user-ids", description: "The list of user IDs to kick", required: true })],

  async run({ interaction, options, pluginData }) {
    actualMassWarnCmd(pluginData, interaction, options["user-ids"].split(/[\s,\r\n]+/), interaction.member);
  },
};
