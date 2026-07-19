// Guided Tutorial — public barrel.
export type {
  TutorialConfig,
  TutorialDebugColor,
  TutorialDiagnostics,
  TutorialEngineApi,
  TutorialEngineSnapshot,
  TutorialEngineState,
  TutorialHooks,
  TutorialId,
  TutorialPlacement,
  TutorialScrollBehavior,
  TutorialShape,
  TutorialStep,
  TutorialTargetId,
} from "./types";
export { TUTORIAL_DEBUG_COLORS } from "./types";

export {
  FIRST_TIME_TUTORIAL,
  TutorialProvider,
  useTutorial,
  useTutorialSnapshot,
} from "./engine";

export { TutorialOverlay } from "./TutorialOverlay";
export { TutorialFlagPublishers } from "./flag-publishers";

export { IRTH_FIRST_TIME_TUTORIAL, TUTORIAL_COPY } from "./data";
export { FIRST_TIME_TUTORIAL_ID, getTutorialConfig } from "./registry";

export {
  hasCompleted as hasTutorialCompleted,
  markCompleted as markTutorialCompleted,
  readCompletedVersion as readTutorialCompletedVersion,
  readCompletionRecord as readTutorialCompletionRecord,
  resetCompletion as resetTutorialCompletion,
} from "./persistence";

export {
  clearEligibilityOverride,
  computeEligibility,
  disableEligibilityOverride,
  eligibilityWaitingReason,
  forceEligibilityOverride,
  getEligibilityFlag,
  getEligibilityOverride,
  setEligibilityFlag,
  subscribeEligibility,
  type EligibilityFlag,
  type EligibilityInputs,
} from "./eligibility";

export {
  tutorialDebug,
  currentEligibilityOverride,
  readLastStartDiagnostic,
  writeLastStartDiagnostic,
  __tutorialAutoStartTelemetry,
  LAST_START_DIAGNOSTIC_KEY,
  type LastStartDiagnostic,
  type AutoStartResult,
  type TutorialDebugController,
} from "./debug";

export {
  validateTutorialConfig,
  validateTutorialConfigInDev,
  type TutorialValidationIssue,
  type TutorialValidationOptions,
  type TutorialValidationResult,
} from "./validate";
