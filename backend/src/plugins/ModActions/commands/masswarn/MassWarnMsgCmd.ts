import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { actualMassWarnCmd } from "../../functions/actualCommands/actualMassWarnCmd";
import { modActionsMsgCmd } from "../../types";
import { getContextChannel, sendContextResponse } from "../../../../pluginUtils";
import { waitForReply } from "knub/helpers";
import { CommonPlugin } from "../../../Common/CommonPlugin";

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
    // Ask for warn reason (cleaner this way instead of trying to cram it into the args)
    sendContextResponse(msg, "Warn reason? `cancel` to cancel");
    const warnReasonReply = await waitForReply(pluginData.client, await getContextChannel(msg), msg.author.id);
    if (!warnReasonReply || !warnReasonReply.content || warnReasonReply.content.toLowerCase().trim() === "cancel") {
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, "Cancelled");
      return;
    }

    actualMassWarnCmd(pluginData, msg, args.userIds, msg.member, warnReasonReply.content, [
      ...warnReasonReply.attachments.values(),
    ]);
  },
});
