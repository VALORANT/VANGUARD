import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { actualMassWarnCmd } from "../../functions/actualCommands/actualMassWarnCmd";
import { modActionsMsgCmd } from "../../types";

export const MassWarnMsgCmd = modActionsMsgCmd({
  trigger: "masswarn",
  permission: "can_masswarn",
  description: "Mass-warn a list of user IDs",

  signature: [
    {
      userIds: ct.string({ rest: true }),
    },
  ],

  async run({ pluginData, message: msg, args }) {
    actualMassWarnCmd(pluginData, msg, args.userIds, msg.member);
  },
});
