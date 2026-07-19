export type {
  CinematicScene,
  CinematicOpeningConfig,
  SceneTransition,
  ParticlePreset,
  RichTextSegment,
} from "./types";
export { loadCinematicOpeningConfig } from "./config";
export { CINEMATIC_OPENING_DATA, CINEMATIC_LOGO_URL } from "./data";
export {
  hasCompleted,
  markCompleted,
  readCompletedVersion,
  resetCompletion,
  isFirstEverLaunch,
  hasAskedNotificationPermission,
  markNotificationPermissionAsked,
} from "./persistence";

