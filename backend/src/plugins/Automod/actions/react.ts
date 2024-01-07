import { GuildTextBasedChannel, PermissionsBitField, Snowflake } from "discord.js";
import * as t from "io-ts";
import { isEmoji, verboseChannelMention } from "../../../utils";
import { hasDiscordPermissions } from "../../../utils/hasDiscordPermissions";
import { LogsPlugin } from "../../Logs/LogsPlugin";
import { automodAction } from "../helpers";
import { AutomodContext } from "../types";

export const ReactAction = automodAction({
  configType: t.union([t.string, t.array(t.string)]),

  defaultConfig: "",

  async apply({ pluginData, contexts, actionConfig, ruleName }) {
    const contextsWithTextChannels = contexts
      .filter((c) => c.message?.channel_id)
      .filter((c) => {
        const channel = pluginData.guild.channels.cache.get(c.message!.channel_id as Snowflake);
        return channel?.isTextBased();
      });

    const contextsByChannelId = contextsWithTextChannels.reduce((map: Map<string, AutomodContext[]>, context) => {
      if (!map.has(context.message!.channel_id)) {
        map.set(context.message!.channel_id, []);
      }

      map.get(context.message!.channel_id)!.push(context);
      return map;
    }, new Map());

    for (const [channelId, _contexts] of contextsByChannelId.entries()) {
      const messageIds = [...new Set(_contexts.filter((c) => c.message?.id).map((c) => c.message?.id))] as string[];
      const emojis =
        typeof actionConfig === "string"
          ? isEmoji(actionConfig)
            ? [actionConfig]
            : []
          : actionConfig.filter((emoji) => isEmoji(emoji));

      if (messageIds.length < 1 || emojis.length < 1) {
        return;
      }

      const channel = pluginData.guild.channels.cache.get(channelId as Snowflake) as GuildTextBasedChannel;
      const messages = (await Promise.all(messageIds.map((id) => channel.messages.fetch(id)))).filter((m) => m);

      if (messages.length < 1) {
        return;
      }

      // Check for basic Add Reactions and View Channel permissions
      if (
        !hasDiscordPermissions(
          channel.permissionsFor(pluginData.client.user!.id),
          PermissionsBitField.Flags.AddReactions | PermissionsBitField.Flags.ViewChannel,
        )
      ) {
        pluginData.getPlugin(LogsPlugin).logBotAlert({
          body: `Missing permissions to reply in ${verboseChannelMention(channel)} in Automod rule \`${ruleName}\``,
        });

        continue;
      }

      for (const message of messages) {
        for (const emoji of emojis) {
          await message.react(emoji);
        }
      }
    }
  },
});
