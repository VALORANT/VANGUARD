import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { actualMassKickCmd } from "../../functions/actualCommands/actualMassKickCmd";
import { modActionsMsgCmd } from "../../types";
import { getContextChannel, sendContextResponse } from "../../../../pluginUtils";
import { waitForReply } from "knub/helpers";
import { CommonPlugin } from "../../../Common/CommonPlugin";

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
    // Ask for kick reason (cleaner this way instead of trying to cram it into the args)
    sendContextResponse(msg, "Kick reason? `cancel` to cancel");
    const kickReasonReply = await waitForReply(pluginData.client, await getContextChannel(msg), msg.author.id);
    if (!kickReasonReply || !kickReasonReply.content || kickReasonReply.content.toLowerCase().trim() === "cancel") {
      pluginData.getPlugin(CommonPlugin).sendErrorMessage(msg, "Cancelled");
      return;
    }

    actualMassKickCmd(pluginData, msg, args.userIds, msg.member, kickReasonReply.content, [
      ...kickReasonReply.attachments.values(),
    ]);
  },
});
