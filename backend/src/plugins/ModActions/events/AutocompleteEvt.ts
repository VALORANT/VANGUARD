import { modActionsEvt } from "../types";
import { BanSlashCmdAutocomplete } from "../commands/ban/BanSlashCmd";
import { AddCaseSlashCmdAutocomplete } from "../commands/addcase/AddCaseSlashCmd";
import { ForceBanSlashCmdAutocomplete } from "../commands/forceban/ForceBanSlashCmd";
import { ForceMuteSlashCmdAutocomplete } from "../commands/forcemute/ForceMuteSlashCmd";
import { ForceUnmuteSlashCmdAutocomplete } from "../commands/forceunmute/ForceUnmuteSlashCmd";
import { KickSlashCmdAutocomplete } from "../commands/kick/KickSlashCmd";
import { MuteSlashCmdAutocomplete } from "../commands/mute/MuteSlashCmd";
import { NoteSlashCmdAutocomplete } from "../commands/note/NoteSlashCmd";
import { UnbanSlashCmdAutocomplete } from "../commands/unban/UnbanSlashCmd";
import { UnmuteSlashCmdAutocomplete } from "../commands/unmute/UnmuteSlashCmd";
import { UpdateSlashCmdAutocomplete } from "../commands/update/UpdateSlashCmd";
import { WarnSlashCmdAutocomplete } from "../commands/warn/WarnSlashCmd";
import { MassBanSlashCmdAutocomplete } from "../commands/massban/MassBanSlashCmd";
import { MassKickSlashCmdAutocomplete } from "../commands/masskick/MassKickSlashCmd";
import { MassMuteSlashCmdAutocomplete } from "../commands/massmute/MassMuteSlashCmd";
import { MassUnbanSlashCmdAutocomplete } from "../commands/massunban/MassUnbanSlashCmd";
import { MassWarnSlashCmdAutocomplete } from "../commands/masswarn/MassWarnSlashCmd";

export const AutocompleteEvt = modActionsEvt({
  event: "interactionCreate",
  async listener({ pluginData, args: { interaction } }) {
    if (!interaction.isAutocomplete()) {
      return;
    }

    const options = interaction.options;

    if (interaction.commandName !== "mod") {
      return;
    }

    switch (options.getSubcommand(true)) {
      case "addcase":
        AddCaseSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "ban":
        BanSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "forceban":
        ForceBanSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "forcemute":
        ForceMuteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "forceunmute":
        ForceUnmuteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "kick":
        KickSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "massban":
        MassBanSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "masskick":
        MassKickSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "massmute":
        MassMuteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "massunban":
        MassUnbanSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "masswarn":
        MassWarnSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "mute":
        MuteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "note":
        NoteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "unban":
        UnbanSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "unmute":
        UnmuteSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "update":
        UpdateSlashCmdAutocomplete({ pluginData, interaction });
        break;

      case "warn":
        WarnSlashCmdAutocomplete({ pluginData, interaction });
        break;
    }
  },
});
