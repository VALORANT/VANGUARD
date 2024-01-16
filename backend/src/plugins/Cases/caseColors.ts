import { CaseTypes } from "../../data/CaseTypes";

export const caseColors: Record<CaseTypes, number> = {
  [CaseTypes.Ban]: 0xfc3e5c,
  [CaseTypes.Unban]: 0x4bc271,
  [CaseTypes.Note]: 0xb2b7d2,
  [CaseTypes.Warn]: 0xf4c13c,
  [CaseTypes.Mute]: 0xf3693e,
  [CaseTypes.Unmute]: 0x4bc271,
  [CaseTypes.Kick]: 0xfc3e5c,
  [CaseTypes.Deleted]: 0xb2b7d2,
  [CaseTypes.Softban]: 0xfc3e5c,
};
