// ============================================================
// Guided Tutorial — Types
// ------------------------------------------------------------
// Phase 2A scaffold: data-driven tutorial engine. Only types are
// declared here — no UI, no target DOM attributes, no Arabic copy
// wired to the DOM. The engine mounts as a passive state machine
// and defers all rendering to a later phase (Spotlight/CoachMark).
// ============================================================

export type TutorialId = "irth-first-time";

/** Semantic hook that identifies a DOM element that will be
 *  highlighted. Concrete `data-tutorial-target="…"` attributes are
 *  wired in a later phase; only the ids are catalogued now. */
export type TutorialTargetId =
  | "nav-campaigns"
  | "nav-encyclopedia"
  | "nav-atlas"
  | "nav-museum"
  | "nav-profile"
  | "home-worlds-section";

/** Coach-mark placement relative to the spotlighted element. */
export type TutorialPlacement = "top" | "bottom" | "adaptive";

/** Spotlight cutout shape. */
export type TutorialShape = "rounded-rect";

/** Scroll behavior when locating the target. */
export type TutorialScrollBehavior = "none" | "into-view" | "into-view-smooth";

/** What to do if the step's target cannot be resolved within the
 *  resolution window. */
export type TutorialMissingTargetBehavior =
  | "wait" // keep trying until resolution window elapses
  | "skip"; // silently advance to the next step

export interface TutorialStep {
  /** Stable step identifier used for logs/analytics/persistence. */
  id: string;
  /** DOM target hook. */
  targetId: TutorialTargetId;
  /** Route on which the step should be shown. Phase 2A supports
   *  same-route steps only (all six are `/`). */
  route: "/";
  placement: TutorialPlacement;
  shape: TutorialShape;
  /** Extra padding (px) added around the target for the cutout. */
  padding: number;
  scroll: TutorialScrollBehavior;
  /** i18n keys or literal strings. Kept as identifiers only in Phase
   *  2A — final Arabic copy is wired in a later phase. */
  titleKey: string;
  bodyKey: string;
  /** When false, taps on the spotlighted element are absorbed by the
   *  overlay so the tour cannot be dismissed accidentally. */
  allowTargetInteraction: boolean;
  /** If true, resolution failure silently advances to the next
   *  eligible step instead of waiting/showing an error. */
  skipIfTargetUnavailable: boolean;
  /** Behavior when target is not yet found within the window. */
  onMissingTarget: TutorialMissingTargetBehavior;
}

export interface TutorialConfig {
  id: TutorialId;
  /** Monotonic integer version — bumping this replays the tutorial
   *  for every device once. */
  version: number;
  /** Route required for the tour to start. */
  startRoute: "/";
  /** Persistence scope: device-scoped (never per-account). */
  scope: "device";
  /** When eligibility becomes true on a non-`startRoute` path, the
   *  engine defers instead of redirecting. */
  deferOnDeepLink: boolean;
  steps: readonly TutorialStep[];
}

// ------------------------------------------------------------
// Engine state machine
// ------------------------------------------------------------

export type TutorialEngineState =
  | "idle"
  | "armed"
  | "waiting_for_eligibility"
  | "locating_target"
  | "scrolling_to_target"
  | "measuring_target"
  | "showing_step"
  | "paused_by_overlay"
  | "transitioning"
  | "finishing"
  | "completed";

export interface TutorialEngineSnapshot {
  state: TutorialEngineState;
  /** 0-based index into the config's `steps`. Null when not running. */
  stepIndex: number | null;
  /** True while paused by an overlay (auth dialogs, first-launch,
   *  RecoveryModeGuard, or any registered navigation overlay). */
  paused: boolean;
  /** Version of the currently active tutorial config. */
  version: number;
}

export interface TutorialEngineApi {
  getSnapshot(): TutorialEngineSnapshot;
  subscribe(listener: () => void): () => void;
  /** Consumers request start; engine ignores if already running or
   *  persistence says this version is completed. */
  requestStart(): void;
  next(): void;
  previous(): void;
  /** Skip via the coach-mark's "تخطي" affordance or confirmed skip. */
  skip(): void;
  /** Natural finish (last step confirmed). */
  finish(): void;
  /** Force-close without persisting (used only when the engine is
   *  torn down mid-flight, e.g. hot reload). */
  forceClose(): void;
  /** Pause / resume — used by the overlay-observer contract. */
  pause(reason: string): void;
  resume(): void;
}
