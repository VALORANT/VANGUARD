import { GuildSavedMessages } from "../../data/GuildSavedMessages";
import { guildPlugin } from "knub";
import { GuildArchives } from "../../data/GuildArchives";
import { GuildCases } from "../../data/GuildCases";
import { GuildLogs } from "../../data/GuildLogs";
import { makePublicFn } from "../../pluginUtils";
import { InternalPosterPlugin } from "../InternalPoster/InternalPosterPlugin";
import { TimeAndDatePlugin } from "../TimeAndDate/TimeAndDatePlugin";
import { createCase } from "./functions/createCase";
import { createCaseNote } from "./functions/createCaseNote";
import { getCaseEmbed } from "./functions/getCaseEmbed";
import { getCaseSummary } from "./functions/getCaseSummary";
import { getCaseTypeAmountForUserId } from "./functions/getCaseTypeAmountForUserId";
import { getRecentCasesByMod } from "./functions/getRecentCasesByMod";
import { getTotalCasesByMod } from "./functions/getTotalCasesByMod";
import { postCaseToCaseLogChannel } from "./functions/postToCaseLogChannel";
import { CasesPluginType, zCasesConfig } from "./types";

// The `any` cast here is to prevent TypeScript from locking up from the circular dependency
function getLogsPlugin(): Promise<any> {
  return import("../Logs/LogsPlugin.js") as Promise<any>;
}

const defaultOptions = {
  config: {
    log_automatic_actions: true,
    case_log_channel: null,
    show_relative_times: true,
    relative_time_cutoff: "7d",
    guild_aliases: null,
    case_colors: null,
    case_icons: null,
    log_each_massban_case: false,
    log_each_massunban_case: false,
    embed_colour: 0x2b2d31,
    embed_color: 0x2b2d31,
  },
};

export const CasesPlugin = guildPlugin<CasesPluginType>()({
  name: "cases",

  dependencies: async () => [TimeAndDatePlugin, InternalPosterPlugin, (await getLogsPlugin()).LogsPlugin],
  configParser: (input) => zCasesConfig.parse(input),
  defaultOptions,

  public(pluginData) {
    return {
      createCase: makePublicFn(pluginData, createCase),
      createCaseNote: makePublicFn(pluginData, createCaseNote),
      postCaseToCaseLogChannel: makePublicFn(pluginData, postCaseToCaseLogChannel),
      getCaseTypeAmountForUserId: makePublicFn(pluginData, getCaseTypeAmountForUserId),
      getTotalCasesByMod: makePublicFn(pluginData, getTotalCasesByMod),
      getRecentCasesByMod: makePublicFn(pluginData, getRecentCasesByMod),
      getCaseEmbed: makePublicFn(pluginData, getCaseEmbed),
      getCaseSummary: makePublicFn(pluginData, getCaseSummary),
      shouldLogEachMassBanCase: () => {
        return !!pluginData.config.get().log_each_massban_case;
      },
      shouldLogEachMassUnbanCase: () => {
        return !!pluginData.config.get().log_each_massunban_case;
      },
    };
  },

  afterLoad(pluginData) {
    const { state, guild } = pluginData;

    state.logs = new GuildLogs(guild.id);
    state.archives = GuildArchives.getGuildInstance(guild.id);
    state.cases = GuildCases.getGuildInstance(guild.id);
    state.savedMessages = GuildSavedMessages.getGuildInstance(guild.id);
  },
});
