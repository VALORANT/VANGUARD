import { GuildPluginData } from "knub";
import { CounterValue } from "../../../data/entities/CounterValue";
import { CountersPluginType } from "../types";

export interface RankedCounterValues extends CounterValue {
  rank?: number;
}

export async function getCounterValue(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
  channelId: string | null,
  userId: string | null,
): Promise<number | undefined> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  if (counter.per_channel && !channelId) {
    throw new Error(`Counter is per channel but no channel ID was supplied`);
  }

  if (counter.per_user && !userId) {
    throw new Error(`Counter is per user but no user ID was supplied`);
  }

  const counterId = pluginData.state.counterIds[counterName];

  const vl = await pluginData.state.counters.getCurrentValue(counterId, channelId, userId);

  return vl;
}

export async function getAllCounterValues(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
): Promise<CounterValue[] | undefined> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  const counterId = pluginData.state.counterIds[counterName];

  const vl = await pluginData.state.counters.getAllValues(counterId);

  return vl;
}

export async function getRankedCounterValues(
  pluginData: GuildPluginData<CountersPluginType>,
  counterName: string,
  limit?: number,
  userId?: string,
): Promise<RankedCounterValues[] | undefined> {
  const config = pluginData.config.get();
  const counter = config.counters[counterName];
  if (!counter) {
    throw new Error(`Unknown counter: ${counterName}`);
  }

  const counterId = pluginData.state.counterIds[counterName];

  let vl = await pluginData.state.counters.getCounterRank(counterId, limit, userId);
  if (Array.isArray(vl)) {
    vl = vl.map((v) => {
      v.rank &= parseInt(v.rank, 10);
      return v;
    });
  }
  return vl;
}
