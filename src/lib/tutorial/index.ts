// Guided Tutorial — public barrel.
export type {
  TutorialConfig,
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
  computeEligibility,
  getEligibilityFlag,
  setEligibilityFlag,
  subscribeEligibility,
  type EligibilityFlag,
  type EligibilityInputs,
} from "./eligibility";
