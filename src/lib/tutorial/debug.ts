// ============================================================
// Guided Tutorial — Debug Controller (Phase 2B.5)
// ------------------------------------------------------------
// Public, framework-agnostic control surface. Exposes engine
// commands and read-only diagnostics without duplicating state.
//
// A single running engine registers itself on mount. The debug
// controller forwards calls to whatever is currently registered;
// when nothing is registered, every command is a safe no-op.
//
// This module ships in every build (tree-shakeable) but performs
// no behavior change until called. In development, it is also
// attached to `window.__irthTutorialDebug` for console use.
// ============================================================

import {
  clearEligibilityOverride,
  computeEligibility,
  disableEligibilityOverride,
  eligibilityWaitingReason,
  forceEligibilityOverride,
  getAllEligibilityFlags,
  getEligibilityOverride,
} from "./eligibility";
import * as persistence from "./persistence";
import type {
  TutorialConfig,
  TutorialDiagnostics,
  TutorialEngineApi,
  TutorialStep,
} from "./types";

// ------------------------------------------------------------
// Bindings
// ------------------------------------------------------------

export interface DebugEnvInputs {
  pathname: string;
  overlayStackSize: number;
  homeStableFrames: number;
  documentVisible: boolean;
}

export interface TutorialDebugBinding {
  api: TutorialEngineApi;
  config: TutorialConfig;
  /** Latest engine snapshot getter. */
  getState: () => TutorialDiagnostics["currentState"];
  /** Latest measured rect (may be null). */
  getTargetRect: () => DOMRectReadOnly | null;
  /** Current environmental inputs consumed by eligibility. */
  getEnvInputs: () => DebugEnvInputs;
}

let binding: TutorialDebugBinding | null = null;

/** Called by <TutorialProvider> on mount. Returns an unregister
 *  callback for cleanup. */
export function registerTutorialDebugBinding(
  b: TutorialDebugBinding,
): () => void {
  binding = b;
  return () => {
    if (binding === b) binding = null;
  };
}

export function getRegisteredBinding(): TutorialDebugBinding | null {
  return binding;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function enabledStepsOf(config: TutorialConfig): readonly TutorialStep[] {
  return config.steps.filter((s) => s.enabled === true);
}

function requireBinding(op: string): TutorialDebugBinding | null {
  if (!binding) {
    // eslint-disable-next-line no-console
    console.warn(`[tutorialDebug] ${op}: no engine registered — no-op.`);
    return null;
  }
  return binding;
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

export interface TutorialDebugController {
  start(): void;
  finish(): void;
  reset(): void;
  jumpToStep(rawIndex: number): void;
  currentState(): TutorialDiagnostics["currentState"] | null;
  currentStep(): TutorialStep | null;
  enabledSteps(): readonly TutorialStep[];
  forceEligibility(): void;
  disableEligibility(): void;
  clearEligibilityOverride(): void;
  diagnostics(): TutorialDiagnostics | null;
}

export const tutorialDebug: TutorialDebugController = {
  start() {
    const b = requireBinding("start");
    if (!b) return;
    b.api.requestStart();
  },
  finish() {
    const b = requireBinding("finish");
    if (!b) return;
    b.api.finish();
  },
  reset() {
    const b = binding;
    // Persistence reset is safe even without a registered engine.
    try {
      persistence.resetCompletion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[tutorialDebug] reset persistence failed:", err);
    }
    if (b) b.api.forceClose();
  },
  jumpToStep(rawIndex) {
    const b = requireBinding("jumpToStep");
    if (!b) return;
    b.api.jumpToStep(rawIndex);
  },
  currentState() {
    if (!binding) return null;
    return binding.getState();
  },
  currentStep() {
    if (!binding) return null;
    const snap = binding.api.getSnapshot();
    if (snap.stepIndex == null) return null;
    return binding.config.steps[snap.stepIndex] ?? null;
  },
  enabledSteps() {
    if (!binding) return [];
    return enabledStepsOf(binding.config);
  },
  forceEligibility() {
    forceEligibilityOverride();
  },
  disableEligibility() {
    disableEligibilityOverride();
  },
  clearEligibilityOverride() {
    clearEligibilityOverride();
  },
  diagnostics() {
    if (!binding) return null;
    const snap = binding.api.getSnapshot();
    const step: TutorialStep | null =
      snap.stepIndex != null
        ? binding.config.steps[snap.stepIndex] ?? null
        : null;
    const rect = binding.getTargetRect();
    const inputs = binding.getEnvInputs();
    const waiting = eligibilityWaitingReason(inputs);
    return {
      currentState: snap.state,
      currentStepIndex: snap.stepIndex,
      currentStepId: step?.id ?? null,
      currentAnalyticsId: step?.analyticsId ?? null,
      currentTargetId: step?.targetId ?? null,
      currentTargetResolved: rect != null,
      currentTargetRect: rect,
      eligible: computeEligibility(inputs),
      paused: snap.paused,
      completed: snap.state === "completed",
      overlayPaused: snap.state === "paused_by_overlay",
      waitingReason: waiting,
      envInputs: inputs,
    } satisfies TutorialDiagnostics;
  },
};

/** Read-only accessor for the current override (diagnostics). */
export function currentEligibilityOverride() {
  return getEligibilityOverride();
}

// ------------------------------------------------------------
// Auto-start telemetry + persisted last-start diagnostic
// ------------------------------------------------------------

export type AutoStartResult =
  | "none"
  | "skipped-completed"
  | "skipped-not-eligible"
  | "skipped-not-idle"
  | "invoked"
  | "invoked-still-idle";

export const __tutorialAutoStartTelemetry = {
  autoStartEffectRan: 0,
  requestStartCalled: 0,
  lastRequestStartResult: "none" as AutoStartResult,
};

export const LAST_START_DIAGNOSTIC_KEY = "irth.tutorial.last-start-diagnostic.v1";
const FIRST_TARGET_SELECTOR = '[data-tutorial-target="nav-campaigns"]';

interface LastStartDiagnosticInput {
  reason: string;
  pathname: string;
  overlayStackSize: number;
  homeStableFrames: number;
  documentVisible: boolean;
  engineState: string;
  eligible: boolean;
  completed: boolean;
  autoStartResult: AutoStartResult;
}

export interface LastStartDiagnostic {
  timestamp: number;
  reason: string;
  pathname: string;
  engineState: string;
  eligible: boolean;
  waitingReason: string | null;
  completed: boolean;
  currentStepIndex: number | null;
  firstLaunchChoiceRecorded: boolean;
  cinematicUnmounted: boolean;
  openingCompletedEvent: boolean;
  sessionReady: boolean;
  authDialogClosed: boolean;
  googleAuthResultDialogClosed: boolean;
  recoveryGuardInactive: boolean;
  documentVisible: boolean;
  homeStableFrames: number;
  totalOverlayStackSize: number;
  externalOverlayStackSize: number;
  tutorialRegistrationActive: boolean;
  firstTargetExists: boolean;
  firstTargetRect: { x: number; y: number; w: number; h: number } | null;
  autoStartEffectRan: number;
  requestStartCalled: number;
  requestStartResult: AutoStartResult;
}

export function writeLastStartDiagnostic(input: LastStartDiagnosticInput): void {
  if (typeof window === "undefined") return;
  const flags = getAllEligibilityFlags();
  const waiting = eligibilityWaitingReason({
    pathname: input.pathname,
    overlayStackSize: input.overlayStackSize,
    homeStableFrames: input.homeStableFrames,
    documentVisible: input.documentVisible,
  });

  let firstTargetExists = false;
  let firstTargetRect: LastStartDiagnostic["firstTargetRect"] = null;
  try {
    const el = document.querySelector(FIRST_TARGET_SELECTOR) as HTMLElement | null;
    if (el) {
      firstTargetExists = true;
      const r = el.getBoundingClientRect();
      firstTargetRect = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
  } catch {
    /* ignore */
  }

  // Tutorial's own overlay-stack registration is active when the
  // engine is not idle/completed OR the skip-confirm dialog is open.
  const tutorialActive =
    input.engineState !== "idle" && input.engineState !== "completed";
  const externalOverlayStackSize = Math.max(
    0,
    input.overlayStackSize - (tutorialActive ? 1 : 0),
  );

  const snap = binding?.api.getSnapshot();
  const record: LastStartDiagnostic = {
    timestamp: Date.now(),
    reason: input.reason,
    pathname: input.pathname,
    engineState: input.engineState,
    eligible: input.eligible,
    waitingReason: waiting,
    completed: input.completed,
    currentStepIndex: snap?.stepIndex ?? null,
    firstLaunchChoiceRecorded: flags.firstLaunchChoiceRecorded,
    cinematicUnmounted: flags.cinematicUnmounted,
    openingCompletedEvent: flags.openingCompletedEvent,
    sessionReady: flags.sessionReady,
    authDialogClosed: flags.authDialogClosed,
    googleAuthResultDialogClosed: flags.googleAuthResultDialogClosed,
    recoveryGuardInactive: flags.recoveryGuardInactive,
    documentVisible: input.documentVisible,
    homeStableFrames: input.homeStableFrames,
    totalOverlayStackSize: input.overlayStackSize,
    externalOverlayStackSize,
    tutorialRegistrationActive: tutorialActive,
    firstTargetExists,
    firstTargetRect,
    autoStartEffectRan: __tutorialAutoStartTelemetry.autoStartEffectRan,
    requestStartCalled: __tutorialAutoStartTelemetry.requestStartCalled,
    requestStartResult: input.autoStartResult,
  };
  try {
    window.localStorage.setItem(
      LAST_START_DIAGNOSTIC_KEY,
      JSON.stringify(record),
    );
  } catch {
    /* ignore */
  }
}

export function readLastStartDiagnostic(): LastStartDiagnostic | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_START_DIAGNOSTIC_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastStartDiagnostic;
  } catch {
    return null;
  }
}


// ------------------------------------------------------------
// Development-only window attachment
// ------------------------------------------------------------

const env: { DEV?: boolean; PROD?: boolean } | undefined = (
  import.meta as unknown as { env?: { DEV?: boolean; PROD?: boolean } }
).env;
if (env?.PROD !== true && typeof window !== "undefined") {
  (window as unknown as { __irthTutorialDebug?: TutorialDebugController })
    .__irthTutorialDebug = tutorialDebug;
}
