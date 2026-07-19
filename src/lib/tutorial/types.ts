// ============================================================
// Guided Tutorial — Types (Phase 2B.5)
// ------------------------------------------------------------
// Data-driven tutorial engine. Behavior is unchanged from Phase 2B;
// this hardening pass adds per-step `enabled`, `analyticsId` and
// `debugColor` fields, and exposes a richer diagnostics contract
// for the debug controller (see `./debug.ts`).
// ============================================================

export type TutorialId = "irth-first-time";

/** Semantic hook that identifies a DOM element that will be
 *  highlighted. */
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

/** Missing-target policy. */
export type TutorialMissingTargetBehavior = "wait" | "skip";

/** Debug palette — used only by future debug tooling; never
 *  rendered during normal gameplay. */
export type TutorialDebugColor =
  | "gold"
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red";

export const TUTORIAL_DEBUG_COLORS: readonly TutorialDebugColor[] = [
  "gold",
  "blue",
  "green",
  "purple",
  "orange",
  "red",
] as const;

export interface TutorialStep {
  /** Stable step identifier used for logs/analytics/persistence. */
  id: string;
  /** DOM target hook. */
  targetId: TutorialTargetId;
  /** Route on which the step should be shown. */
  route: "/";
  placement: TutorialPlacement;
  shape: TutorialShape;
  padding: number;
  scroll: TutorialScrollBehavior;
  /** Final coach-mark title (Arabic). Rendered verbatim. */
  title: string;
  /** Final coach-mark body (Arabic). Rendered verbatim. */
  body: string;
  allowTargetInteraction: boolean;
  skipIfTargetUnavailable: boolean;
  onMissingTarget: TutorialMissingTargetBehavior;

  /** ------------------------------------------------------------
   *  Phase 2B.5 additions
   *  ------------------------------------------------------------ */

  /** When false, the step is skipped entirely — invisible to the
   *  player, ignored by next/previous, and excluded from the
   *  progress counter. Default (in the registry) is `true`. */
  enabled: boolean;
  /** Stable analytics identifier. Propagated to every
   *  `TutorialHooks` callback. Never reused across steps. */
  analyticsId: string;
  /** Debug palette hint — never rendered during normal gameplay. */
  debugColor: TutorialDebugColor;
}

// ------------------------------------------------------------
// Extension hooks (no default implementation)
// ------------------------------------------------------------

export interface TutorialHooks {
  onTutorialStarted?: (info: {
    id: TutorialId;
    version: number;
    /** The analyticsId of the first enabled step actually shown. */
    startAnalyticsId: string;
  }) => void;
  onStepChanged?: (info: {
    id: TutorialId;
    version: number;
    /** Raw index into `config.steps`. */
    stepIndex: number;
    stepId: string;
    /** Enabled-only ordinal (1-based) and total. */
    enabledOrdinal: number;
    enabledTotal: number;
    /** The step's analyticsId. */
    analyticsId: string;
    direction: "forward" | "backward" | "initial";
  }) => void;
  onTutorialSkipped?: (info: {
    id: TutorialId;
    version: number;
    atStepIndex: number | null;
    /** analyticsId of the step the player was viewing when they
     *  skipped. Null if the tour hadn't shown a step yet. */
    atAnalyticsId: string | null;
  }) => void;
  onTutorialCompleted?: (info: {
    id: TutorialId;
    version: number;
    /** analyticsId of the final enabled step confirmed. */
    finalAnalyticsId: string;
  }) => void;
}

export interface TutorialConfig {
  id: TutorialId;
  version: number;
  startRoute: "/";
  scope: "device";
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
  /** Raw index into `config.steps`. Null when not running. */
  stepIndex: number | null;
  paused: boolean;
  version: number;
}

// ------------------------------------------------------------
// Read-only diagnostics (Phase 2B.5)
// ------------------------------------------------------------

export interface TutorialDiagnostics {
  currentState: TutorialEngineState;
  currentStepIndex: number | null;
  currentStepId: string | null;
  currentAnalyticsId: string | null;
  currentTargetId: TutorialTargetId | null;
  currentTargetResolved: boolean;
  currentTargetRect: DOMRectReadOnly | null;
  eligible: boolean;
  paused: boolean;
  completed: boolean;
  overlayPaused: boolean;
  waitingReason: string | null;
}

export interface TutorialEngineApi {
  getSnapshot(): TutorialEngineSnapshot;
  subscribe(listener: () => void): () => void;
  requestStart(): void;
  next(): void;
  previous(): void;
  skip(): void;
  finish(): void;
  forceClose(): void;
  pause(reason: string): void;
  resume(): void;
  /** Phase 2B.5 — jump to an arbitrary enabled step (debug only).
   *  Passing an index that resolves to a disabled step throws. */
  jumpToStep(rawIndex: number): void;
}
