import { GuildPluginData } from "knub";
import { CasesPluginType } from "../types";

export function getTotalCasesByMod(
  pluginData: GuildPluginData<CasesPluginType>,
  modId: string,
  areCasesGlobal: boolean,
): Promise<number> {
  return pluginData.state.cases.getTotalCasesByModId(modId, areCasesGlobal);
}
