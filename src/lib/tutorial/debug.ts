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
// Development-only window attachment
// ------------------------------------------------------------

const env: { DEV?: boolean; PROD?: boolean } | undefined = (
  import.meta as unknown as { env?: { DEV?: boolean; PROD?: boolean } }
).env;
if (env?.PROD !== true && typeof window !== "undefined") {
  (window as unknown as { __irthTutorialDebug?: TutorialDebugController })
    .__irthTutorialDebug = tutorialDebug;
}
