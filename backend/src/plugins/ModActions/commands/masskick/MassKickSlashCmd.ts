import { slashOptions } from "knub";
import { actualMassKickCmd } from "../../functions/actualCommands/actualMassKickCmd";

export const MassKickSlashCmd = {
  name: "masskick",
  configPermission: "can_masskick",
  description: "Mass-kick a list of user IDs",
  allowDms: false,

  signature: [slashOptions.string({ name: "user-ids", description: "The list of user IDs to kick", required: true })],

  async run({ interaction, options, pluginData }) {
    actualMassKickCmd(pluginData, interaction, options["user-ids"].split(/[\s,\r\n]+/), interaction.member);
  },
};
