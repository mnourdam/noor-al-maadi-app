export type {
  CampaignIntroRef,
  CampaignIntroState,
  CampaignIntroStatus,
} from "./types";
export { strongerIntroStatus, introStateKey, INTRO_STATUS_STRENGTH } from "./types";
export { resolveCampaignIntro, normalizeIntroVersion } from "./resolve";
export type { IntroCarrier } from "./resolve";
export {
  shouldShowCampaignIntro,
  readCampaignIntroState,
  readCampaignIntroHistory,
  writeCampaignIntroState,
  markCampaignIntroStarted,
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  recordCampaignIntroScene,
  resetCampaignIntro,
  __clearCampaignIntroStates,
  CAMPAIGN_INTRO_STORE_KEY,
} from "./state";
export { mergeCampaignIntroRecord } from "./state";
export { queueCampaignIntroSync, hydrateCampaignIntrosFromServer } from "./sync";
export {
  areCampaignIntrosEnabled,
  isCampaignIntroEnabledFor,
  isCampaignIntroRolledOut,
  readCampaignIntroRollout,
  CAMPAIGN_INTRO_FLAG_KEYS,
} from "./flags";
export { introDebug, introError } from "./debug";

export {
  auditCampaignIntroAssets,
  readCampaignIntroFromRow,
  INTRO_ENGINE_VERSION,
} from "./audit";
export type { IntroAuditEntry, IntroAuditResult, IntroAuditInput } from "./audit";
export { loadCampaignIntroBundle, isCampaignIntroPlayableOffline } from "./offline";
export type { CampaignIntroBundle } from "./offline";
