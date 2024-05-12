import { Attachment, ChatInputCommandInteraction, GuildMember, Message, User } from "discord.js";
import { GuildPluginData } from "knub";
import { CaseTypes } from "../../../../data/CaseTypes";
import { UserNotificationMethod, renderUsername, UnknownUser } from "../../../../utils";
import { waitForButtonConfirm } from "../../../../utils/waitForInteraction";
import { CasesPlugin } from "../../../Cases/CasesPlugin";
import { handleAttachmentLinkDetectionAndGetRestriction } from "../../functions/attachmentLinkReaction";
import {
  formatReasonWithAttachments,
  formatReasonWithMessageLinkForAttachments,
} from "../../functions/formatReasonForAttachments";
import { warnMember } from "../../functions/warnMember";
import { parseReason } from "../../functions/parseReason";
import { ModActionsPluginType } from "../../types";

export async function actualWarnCmd(
  pluginData: GuildPluginData<ModActionsPluginType>,
  context: Message | ChatInputCommandInteraction,
  authorId: string,
  mod: GuildMember,
  reason: string,
  attachments: Attachment[],
  userToWarn: User | UnknownUser,
  memberToWarn?: GuildMember | null,
  contactMethods?: UserNotificationMethod[],
) {
  if (await handleAttachmentLinkDetectionAndGetRestriction(pluginData, context, reason)) {
    return;
  }

  const config = pluginData.config.get();
  const parsedReason = parseReason(pluginData.config.get(), reason);
  const formattedReason = await formatReasonWithMessageLinkForAttachments(
    pluginData,
    parsedReason,
    context,
    attachments,
  );
  const formattedReasonWithAttachments = formatReasonWithAttachments(parsedReason, attachments);

  const casesPlugin = pluginData.getPlugin(CasesPlugin);
  const priorWarnAmount = await casesPlugin.getCaseTypeAmountForUserId(userToWarn.id, CaseTypes.Warn);
  if (config.warn_notify_enabled && priorWarnAmount >= config.warn_notify_threshold) {
    const reply = await waitForButtonConfirm(
      context,
      { content: config.warn_notify_message.replace("{priorWarnings}", `${priorWarnAmount}`) },
      { confirmText: "Yes", cancelText: "No", restrictToId: authorId },
    );
    if (!reply) {
      await pluginData.state.common.sendErrorMessage(context, "Warn cancelled by moderator");
      return;
    }
  }

  const warnResult = await warnMember(
    pluginData,
    formattedReason,
    formattedReasonWithAttachments,
    userToWarn,
    memberToWarn,
    {
      contactMethods,
      caseArgs: {
        modId: mod.id,
        ppId: mod.id !== authorId ? authorId : undefined,
        reason: formattedReason,
      },
      retryPromptContext: context,
    },
  );

  if (warnResult.status === "failed") {
    const failReason = warnResult.error ? `: ${warnResult.error}` : "";

    await pluginData.state.common.sendErrorMessage(context, `Failed to warn user${failReason}`);

    return;
  }

  const messageResultText = warnResult.notifyResult.text ? ` (${warnResult.notifyResult.text})` : "";

  await pluginData.state.common.sendSuccessMessage(
    context,
    `Warned **${renderUsername(memberToWarn ?? userToWarn)}** (Case #${warnResult.case.case_number})${messageResultText}`,
  );
}
