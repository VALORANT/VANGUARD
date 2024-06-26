import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { modActionsMsgCmd } from "../../types";
import { actualCaseCmd } from "./actualCaseCmd";

const opts = {
  show: ct.switchOption({ def: false, shortcut: "sh" }),
};

export const CaseMsgCmd = modActionsMsgCmd({
  trigger: "case",
  permission: "can_view",
  description: "Show information about a specific case",

  signature: [
    {
      caseNumber: ct.number(),

      ...opts,
    },
  ],

  async run({ pluginData, message: msg, args }) {
    actualCaseCmd(pluginData, msg, msg.author.id, args.caseNumber, args.show);
  },
});
