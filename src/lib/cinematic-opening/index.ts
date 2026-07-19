export type {
  CinematicScene,
  CinematicOpeningConfig,
  SceneTransition,
  ParticlePreset,
} from "./types";
export { loadCinematicOpeningConfig } from "./config";
export { hasCompleted, markCompleted, readCompletedVersion, resetCompletion } from "./persistence";
