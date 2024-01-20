import { GuildPluginData } from "knub";
import { Case } from "../../../data/entities/Case";
import { CasesPluginType } from "../types";

export function getRecentCasesByMod(
  pluginData: GuildPluginData<CasesPluginType>,
  modId: string,
  count: number,
  areCasesGlobal: boolean,
  skip = 0,
): Promise<Case[]> {
  return pluginData.state.cases.getRecentByModId(modId, count, areCasesGlobal, skip);
}
