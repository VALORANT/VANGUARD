import { commandTypeHelpers as ct } from "../../../../commandTypes";
import { canActOn, hasPermission } from "../../../../pluginUtils";
import { resolveMember, resolveUser } from "../../../../utils";
import { modActionsMsgCmd } from "../../types";
import { actualUnmuteCmd } from "../unmute/actualUnmuteCmd";

const opts = {
  mod: ct.member({ option: true }),
};

export const ForceUnmuteMsgCmd = modActionsMsgCmd({
  trigger: "forceunmute",
  permission: "can_mute",
  description: "Force-unmute the specified user, even if they're not on the server",

  signature: [
    {
      user: ct.string(),
      time: ct.delay(),
      reason: ct.string({ required: false, catchAll: true }),

      ...opts,
    },
    {
      user: ct.string(),
      reason: ct.string({ required: false, catchAll: true }),

      ...opts,
    },
  ],

  async run({ pluginData, message: msg, args }) {
    const user = await resolveUser(pluginData.client, args.user);
    if (!user.id) {
      pluginData.state.common.sendErrorMessage(msg, `User not found`);
      return;
    }

    // Check if they're muted in the first place
    if (!(await pluginData.state.mutes.isMuted(user.id))) {
      pluginData.state.common.sendErrorMessage(msg, "Cannot unmute: member is not muted");
      return;
    }

    // Find the server member to unmute
    const memberToUnmute = await resolveMember(pluginData.client, pluginData.guild, user.id);

    // Make sure we're allowed to unmute this member
    if (memberToUnmute && !canActOn(pluginData, msg.member, memberToUnmute)) {
      pluginData.state.common.sendErrorMessage(msg, "Cannot unmute: insufficient permissions");
      return;
    }

    // The moderator who did the action is the message author or, if used, the specified -mod
    let mod = msg.member;
    let ppId: string | undefined;

    if (args.mod) {
      if (!(await hasPermission(pluginData, "can_act_as_other", { message: msg }))) {
        pluginData.state.common.sendErrorMessage(msg, "You don't have permission to use -mod");
        return;
      }

      mod = args.mod;
      ppId = msg.author.id;
    }

    actualUnmuteCmd(
      pluginData,
      msg,
      user,
      [...msg.attachments.values()],
      mod,
      ppId,
      "time" in args ? args.time ?? undefined : undefined,
      args.reason,
    );
  },
});
