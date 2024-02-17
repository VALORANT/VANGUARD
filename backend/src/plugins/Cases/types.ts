import { BasePluginType } from "knub";
import { U } from "ts-toolbelt";
import z from "zod";
import { CaseNameToType, CaseTypes } from "../../data/CaseTypes";
import { GuildArchives } from "../../data/GuildArchives";
import { GuildCases } from "../../data/GuildCases";
import { GuildLogs } from "../../data/GuildLogs";
import { GuildSavedMessages } from "../../data/GuildSavedMessages";
import { keys, zBoundedCharacters, zDelayString, zSnowflake } from "../../utils";
import { zColor } from "../../utils/zColor";

const caseKeys = keys(CaseNameToType) as U.ListOf<keyof typeof CaseNameToType>;

export const zCasesConfig = z.strictObject({
  log_automatic_actions: z.boolean(),
  case_log_channel: zSnowflake.nullable(),
  show_relative_times: z.boolean(),
  relative_time_cutoff: zDelayString.default("1w"),
  guild_aliases: z.nullable(z.record(z.string(), z.string())),
  case_colors: z.record(z.enum(caseKeys), zColor).nullable(),
  case_icons: z.record(z.enum(caseKeys), zBoundedCharacters(0, 100)).nullable(),
  log_each_massban_case: z.boolean(),
  log_each_massunban_case: z.boolean(),
  embed_colour: z.number(),
  embed_color: z.number(),
});

export interface CasesPluginType extends BasePluginType {
  config: z.infer<typeof zCasesConfig>;
  state: {
    logs: GuildLogs;
    cases: GuildCases;
    archives: GuildArchives;
    savedMessages: GuildSavedMessages;
  };
}

/**
 * Can also be used as a config object for functions that create cases
 */
export type CaseArgs = {
  userId: string;
  modId: string;
  ppId?: string;
  type: CaseTypes;
  auditLogId?: string;
  reason?: string;
  automatic?: boolean;
  postInCaseLogOverride?: boolean;
  noteDetails?: string[];
  extraNotes?: string[];
  hide?: boolean;
};

export type CaseNoteArgs = {
  caseId: number;
  modId: string;
  body: string;
  automatic?: boolean;
  postInCaseLogOverride?: boolean;
  noteDetails?: string[];
};
