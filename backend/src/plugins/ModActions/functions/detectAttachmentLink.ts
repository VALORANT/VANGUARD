import { TextBasedChannel } from "discord.js";
import { AnyPluginData, GuildPluginData } from "knub";
import { sendErrorMessage } from "../../../pluginUtils";
import { ModActionsPluginType } from "../types";

export function shouldReactToAttachmentLink(pluginData: GuildPluginData<ModActionsPluginType>) {
  const config = pluginData.config.get();

  return !config.attachment_link_reaction || config.attachment_link_reaction !== "none";
}

export function attachmentLinkShouldRestrict(pluginData: GuildPluginData<ModActionsPluginType>) {
  return pluginData.config.get().attachment_link_reaction === "restrict";
}

export function detectAttachmentLink(reason: string | null | undefined) {
  return reason && /https:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments/gu.test(reason);
}

export function sendAttachmentLinkDetectionErrorMessage(
  pluginData: AnyPluginData<any>,
  channel: TextBasedChannel,
  restricted = false,
) {
  const emoji = pluginData.fullConfig.plugins?.global?.config?.error_emoji ?? "";

  sendErrorMessage(
    pluginData,
    channel,
    "You manually added a Discord attachment link to the reason. This link will only work for one month.\n" +
      "You should instead **re-upload** the attachment with the command, in the same message.\n" +
      (restricted ? `\n${emoji} **Command canceled.** ${emoji}` : "").trim(),
  );
}

export function handleAttachmentLinkDetectionAndGetRestriction(
  pluginData: GuildPluginData<ModActionsPluginType>,
  channel: TextBasedChannel,
  reason: string | null | undefined,
) {
  if (!shouldReactToAttachmentLink(pluginData) || !detectAttachmentLink(reason)) {
    return false;
  }

  const restricted = attachmentLinkShouldRestrict(pluginData);

  sendAttachmentLinkDetectionErrorMessage(pluginData, channel, restricted);

  return restricted;
}
