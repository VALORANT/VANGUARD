import { CaseTypes } from "../../data/CaseTypes";
import { GuildArchives } from "../../data/GuildArchives";
import { GuildCases } from "../../data/GuildCases";
import { GuildLogs } from "../../data/GuildLogs";
import { GuildSavedMessages } from "../../data/GuildSavedMessages";
import { Case } from "../../data/entities/Case";
import { mapToPublicFn } from "../../pluginUtils";
import { trimPluginDescription } from "../../utils";
import { InternalPosterPlugin } from "../InternalPoster/InternalPosterPlugin";
import { TimeAndDatePlugin } from "../TimeAndDate/TimeAndDatePlugin";
import { zeppelinGuildPlugin } from "../ZeppelinPluginBlueprint";
import { createCase } from "./functions/createCase";
import { createCaseNote } from "./functions/createCaseNote";
import { getCaseEmbed } from "./functions/getCaseEmbed";
import { getCaseSummary } from "./functions/getCaseSummary";
import { getCaseTypeAmountForUserId } from "./functions/getCaseTypeAmountForUserId";
import { getRecentCasesByMod } from "./functions/getRecentCasesByMod";
import { getTotalCasesByMod } from "./functions/getTotalCasesByMod";
import { postCaseToCaseLogChannel } from "./functions/postToCaseLogChannel";
import { CaseArgs, CaseNoteArgs, CasesPluginType, zCasesConfig } from "./types";

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

export const CasesPlugin = zeppelinGuildPlugin<CasesPluginType>()({
  name: "cases",
  showInDocs: true,
  info: {
    prettyName: "Cases",
    description: trimPluginDescription(`
      This plugin contains basic configuration for cases created by other plugins
    `),
    configSchema: zCasesConfig,
  },

  dependencies: async () => [TimeAndDatePlugin, InternalPosterPlugin, (await getLogsPlugin()).LogsPlugin],
  configParser: (input) => zCasesConfig.parse(input),
  defaultOptions,

  public: {
    createCase(pluginData) {
      return (args: CaseArgs) => {
        return createCase(pluginData, args);
      };
    },

    createCaseNote(pluginData) {
      return (args: CaseNoteArgs) => {
        return createCaseNote(pluginData, args);
      };
    },

    postCaseToCaseLogChannel(pluginData) {
      return (caseOrCaseId: Case | number) => {
        return postCaseToCaseLogChannel(pluginData, caseOrCaseId);
      };
    },

    getCaseTypeAmountForUserId(pluginData) {
      return (userID: string, type: CaseTypes) => {
        return getCaseTypeAmountForUserId(pluginData, userID, type);
      };
    },

    getTotalCasesByMod: mapToPublicFn(getTotalCasesByMod),
    getRecentCasesByMod: mapToPublicFn(getRecentCasesByMod),

    getCaseEmbed: mapToPublicFn(getCaseEmbed),
    getCaseSummary: mapToPublicFn(getCaseSummary),

    shouldLogEachMassBanCase(pluginData) {
      return () => {
        return !!pluginData.config.get().log_each_massban_case;
      };
    },

    shouldLogEachMassUnbanCase(pluginData) {
      return () => {
        return !!pluginData.config.get().log_each_massunban_case;
      };
    },
  },

  afterLoad(pluginData) {
    const { state, guild } = pluginData;

    state.logs = new GuildLogs(guild.id);
    state.archives = GuildArchives.getGuildInstance(guild.id);
    state.cases = GuildCases.getGuildInstance(guild.id);
    state.savedMessages = GuildSavedMessages.getGuildInstance(guild.id);
  },
});
