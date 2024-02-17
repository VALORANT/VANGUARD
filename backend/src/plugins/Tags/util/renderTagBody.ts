import { GuildPluginData, ExtendedMatchParams } from "knub";
import { renderTemplate, TemplateSafeValue, TemplateSafeValueContainer } from "../../../templateFormatter";
import { renderRecursively, resolveUser, StrictMessageContent, UnknownUser } from "../../../utils";
import { CountersPlugin } from "../../Counters/CountersPlugin";
import { TTag, TagsPluginType } from "../types";
import { findTagByName } from "./findTagByName";
import { counterValueToTemplateSafeCounterValue, userToTemplateSafeUser } from "../../../utils/templateSafeObjects";

const MAX_TAG_FN_CALLS = 25;

// This is used to disallow setting/getting default object properties (such as __proto__) in dynamicVars
const emptyObject = {};

export async function renderTagBody(
  pluginData: GuildPluginData<TagsPluginType>,
  body: TTag,
  args: TemplateSafeValue[] = [],
  extraData = {},
  subTagPermissionMatchParams?: ExtendedMatchParams,
  tagFnCallsObj = { calls: 0 },
): Promise<StrictMessageContent> {
  const dynamicVars = {};
  const client = pluginData.client;
  let countersPlugin: any;
  try {
    countersPlugin = pluginData.getPlugin(CountersPlugin);
  } catch (_) {
    // no counters plugin
  }

  const data = new TemplateSafeValueContainer({
    args,
    ...extraData,
    ...pluginData.state.tagFunctions,
    set(name, val) {
      if (typeof name !== "string") return;
      if (emptyObject[name]) return;
      dynamicVars[name] = val;
    },
    setr(name, val) {
      if (typeof name !== "string") return "";
      if (emptyObject[name]) return;
      dynamicVars[name] = val;
      return val;
    },
    get(name) {
      if (typeof name !== "string") return "";
      if (emptyObject[name]) return;
      return !Object.hasOwn(dynamicVars, name) || dynamicVars[name] == null ? "" : dynamicVars[name];
    },
    async get_counter_value(counter, userId?, channelId?) {
      if (!countersPlugin) return "";
      if (!userId && !channelId) return "";
      const cData = await countersPlugin.getCounterValue(counter, channelId, userId);
      return cData?.toString() ?? "";
    },
    async get_all_counter_values(counter, field?, limit?, userId?) {
      if (!countersPlugin || !countersPlugin.counterExists(counter)) return "";

      const cData = (
        field
          ? await countersPlugin.getRankedCounterValues(counter, field, limit, userId)
          : await countersPlugin.getAllCounterValues(counter)
      )?.map((cd) => counterValueToTemplateSafeCounterValue(cd));

      if (Array.isArray(cData) && cData.length === 1 && limit === 1) return cData[0];
      return cData ?? [];
    },
    async get_user(str) {
      if (!str || typeof str !== "string") return "";
      const resolved = await resolveUser(client, str);
      if (resolved instanceof UnknownUser) return "";
      return userToTemplateSafeUser(resolved);
    },
    tag: async (name, ...subTagArgs) => {
      if (++tagFnCallsObj.calls > MAX_TAG_FN_CALLS) return "";
      if (typeof name !== "string") return "";
      if (name === "") return "";

      const subTagBody = await findTagByName(pluginData, name, subTagPermissionMatchParams);

      if (!subTagBody) {
        return "";
      }

      if (typeof subTagBody !== "string") {
        return "<embed>";
      }

      const rendered = await renderTagBody(
        pluginData,
        subTagBody,
        subTagArgs,
        extraData,
        subTagPermissionMatchParams,
        tagFnCallsObj,
      );
      return rendered.content!;
    },
  });

  if (typeof body === "string") {
    // Plain text tag
    return { content: await renderTemplate(body, data) };
  } else {
    // Embed
    return renderRecursively(body, (str) => renderTemplate(str, data));
  }
}
