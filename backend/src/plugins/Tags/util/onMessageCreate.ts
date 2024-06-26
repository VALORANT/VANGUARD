import { Snowflake, TextChannel } from "discord.js";
import { GuildPluginData } from "knub";
import { SavedMessage } from "../../../data/entities/SavedMessage";
import { convertDelayStringToMS, resolveMember, zStrictMessageContent } from "../../../utils";
import { erisAllowedMentionsToDjsMentionOptions } from "../../../utils/erisAllowedMentionsToDjsMentionOptions";
import { messageIsEmpty } from "../../../utils/messageIsEmpty";
import { LogsPlugin } from "../../Logs/LogsPlugin";
import { TagsPluginType } from "../types";
import { matchAndRenderTagFromString } from "./matchAndRenderTagFromString";

export async function onMessageCreate(pluginData: GuildPluginData<TagsPluginType>, msg: SavedMessage) {
  if (msg.is_bot) return;
  if (!msg.data.content) return;

  const member = await resolveMember(pluginData.client, pluginData.guild, msg.user_id);
  if (!member) return;

  const channel = pluginData.guild.channels.cache.get(msg.channel_id as Snowflake);
  if (!channel?.isTextBased()) return;

  const config = await pluginData.config.getMatchingConfig({
    member,
    channelId: msg.channel_id,
    categoryId: channel.parentId,
  });

  const tagResult = await matchAndRenderTagFromString(pluginData, msg.data.content, member, {
    channelId: msg.channel_id,
    categoryId: channel.parentId,
  });

  if (!tagResult) {
    return;
  }

  // Check for cooldowns
  const cooldowns: any[] = [];

  if (tagResult.category) {
    // Category-specific cooldowns
    if (tagResult.category.user_tag_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.user_tag_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-user-${msg.user_id}-tag-${tagResult.tagName}`, delay]);
    }
    if (tagResult.category.global_tag_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.global_tag_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-tag-${tagResult.tagName}`, delay]);
    }
    if (tagResult.category.user_category_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.user_category_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-user--${msg.user_id}`, delay]);
    }
    if (tagResult.category.global_category_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.global_category_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}`, delay]);
    }
  } else {
    // Dynamic tag cooldowns
    if (config.user_tag_cooldown) {
      const delay = convertDelayStringToMS(String(config.user_tag_cooldown), "s");
      cooldowns.push([`tags-user-${msg.user_id}-tag-${tagResult.tagName}`, delay]);
    }

    if (config.global_tag_cooldown) {
      const delay = convertDelayStringToMS(String(config.global_tag_cooldown), "s");
      cooldowns.push([`tags-tag-${tagResult.tagName}`, delay]);
    }

    if (config.user_cooldown) {
      const delay = convertDelayStringToMS(String(config.user_cooldown), "s");
      cooldowns.push([`tags-user-${msg.user_id}`, delay]);
    }

    if (config.global_cooldown) {
      const delay = convertDelayStringToMS(String(config.global_cooldown), "s");
      cooldowns.push([`tags`, delay]);
    }
  }

  const isOnCooldown = cooldowns.some((cd) => pluginData.cooldowns.isOnCooldown(cd[0]));
  if (isOnCooldown) return;

  for (const cd of cooldowns) {
    pluginData.cooldowns.setCooldown(cd[0], cd[1]);
  }

  const validated = zStrictMessageContent.safeParse(tagResult.renderedContent);
  if (!validated.success) {
    pluginData.getPlugin(LogsPlugin).logBotAlert({
      body: `Rendering tag ${tagResult.tagName} resulted in an invalid message: ${validated.error.message}`,
    });
    return;
  }

  if (messageIsEmpty(tagResult.renderedContent)) {
    pluginData.getPlugin(LogsPlugin).logBotAlert({
      body: `Tag \`${tagResult.tagName}\` resulted in an empty message, so it couldn't be sent`,
    });
    return;
  }

  const allowMentions = tagResult.category?.allow_mentions ?? config.allow_mentions;
  const needsReply = !!msg.data.reference?.messageId;
  const reply = needsReply
    ? {
        reply: {
          failIfNotExists: false,
          messageReference: msg.data.reference!.messageId!,
        },
      }
    : {};

  const responseMsg = await channel
    .send({
      ...tagResult.renderedContent,
      ...reply,
      allowedMentions: erisAllowedMentionsToDjsMentionOptions({ roles: allowMentions, users: allowMentions }),
    })
    .catch((error) => {
      console.error(error.toString());
      console.debug(tagResult.renderedContent);
      console.debug(error);
    });

  if (!responseMsg) {
    return;
  }

  // Save the command-response message pair once the message is in our database
  const deleteWithCommand = tagResult.category?.delete_with_command ?? config.delete_with_command;
  if (deleteWithCommand) {
    await pluginData.state.tags.addResponse(msg.id, responseMsg.id);
  }

  const deleteInvoke = needsReply
    ? tagResult.category?.auto_delete_command_on_reply ?? config.auto_delete_command_on_reply
    : tagResult.category?.auto_delete_command ?? config.auto_delete_command;

  if (!deleteWithCommand && deleteInvoke) {
    // Try deleting the invoking message, ignore errors silently
    (pluginData.guild.channels.resolve(msg.channel_id as Snowflake) as TextChannel).messages.delete(
      msg.id as Snowflake,
    );
  }
}
