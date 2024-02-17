import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { actualMassKickCmd } from "../../functions/actualCommands/actualMassKickCmd";
import { modActionsMsgCmd } from "../../types";

export const MassKickMsgCmd = modActionsMsgCmd({
  trigger: "masskick",
  permission: "can_masskick",
  description: "Mass-kick a list of user IDs",

  signature: [
    {
      userIds: ct.string({ rest: true }),
    },
  ],

  async run({ pluginData, message: msg, args }) {
    actualMassKickCmd(pluginData, msg, args.userIds, msg.member);
  },
});
