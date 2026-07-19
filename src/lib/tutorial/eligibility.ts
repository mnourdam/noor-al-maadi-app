// ============================================================
// Guided Tutorial — Eligibility
// ------------------------------------------------------------
// Pure predicate + a React hook that observes the composite
// signal. The engine consults `computeEligibility()` before it
// transitions from `armed` → `waiting_for_eligibility` →
// `locating_target`.
//
// Eligibility is TRUE only when every one of the following holds:
//
//   1. Cinematic Opening is fully unmounted
//   2. `OPENING_COMPLETED_EVENT` has resolved
//   3. `irth.firstLaunch.choice.v1` exists in localStorage
//   4. Session loading is complete
//   5. No auth dialog is open
//   6. No Google auth-result dialog is open
//   7. RecoveryModeGuard is inactive
//   8. Current pathname is exactly `/`
//   9. Document is visible
//  10. Navigation overlay stack is empty
//  11. Home targets have had at least two stable animation frames
//
// Signals 1–7 are surfaced via a small in-process event bus so the
// engine does not need to reach into unrelated modules directly.
// Consumers of those subsystems call `setEligibilityFlag(...)` to
// publish their state; the engine reads the aggregate.
// ============================================================

import { useEffect, useState } from "react";
import {
  TUTORIAL_HOME_STABLE_FRAMES,
} from "./data";

export type EligibilityFlag =
  | "cinematicUnmounted"
  | "openingCompletedEvent"
  | "firstLaunchChoiceRecorded"
  | "sessionReady"
  | "authDialogClosed"
  | "googleAuthResultDialogClosed"
  | "recoveryGuardInactive";

/** Defaults are conservative: everything is FALSE until a subsystem
 *  reports otherwise. The engine will therefore remain in
 *  `waiting_for_eligibility` on a cold boot until the app publishes
 *  its readiness. */
const DEFAULTS: Record<EligibilityFlag, boolean> = {
  cinematicUnmounted: false,
  openingCompletedEvent: false,
  firstLaunchChoiceRecorded: false,
  sessionReady: false,
  authDialogClosed: true,
  googleAuthResultDialogClosed: true,
  recoveryGuardInactive: true,
};

type Listener = () => void;

const state: Record<EligibilityFlag, boolean> = { ...DEFAULTS };
const listeners = new Set<Listener>();

function emit() {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

/** Publish a boolean signal from a subsystem. Idempotent. */
export function setEligibilityFlag(flag: EligibilityFlag, value: boolean): void {
  if (state[flag] === value) return;
  state[flag] = value;
  emit();
}

export function getEligibilityFlag(flag: EligibilityFlag): boolean {
  return state[flag];
}

export function subscribeEligibility(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export interface EligibilityInputs {
  /** Current router pathname. */
  pathname: string;
  /** Overlay stack size from the Navigation Engine. */
  overlayStackSize: number;
  /** Frames elapsed since Home mounted its targets. */
  homeStableFrames: number;
  /** `document.visibilityState === "visible"`. */
  documentVisible: boolean;
}

/** Pure predicate — no side effects. */
export function computeEligibility(inputs: EligibilityInputs): boolean {
  // Composite subsystem readiness
  if (!state.cinematicUnmounted) return false;
  if (!state.openingCompletedEvent) return false;
  if (!state.firstLaunchChoiceRecorded) return false;
  if (!state.sessionReady) return false;
  if (!state.authDialogClosed) return false;
  if (!state.googleAuthResultDialogClosed) return false;
  if (!state.recoveryGuardInactive) return false;

  // Environmental
  if (inputs.pathname !== "/") return false;
  if (!inputs.documentVisible) return false;
  if (inputs.overlayStackSize > 0) return false;
  if (inputs.homeStableFrames < TUTORIAL_HOME_STABLE_FRAMES) return false;

  return true;
}

/** React hook wrapper that re-renders when any published flag
 *  changes. Environmental inputs are passed in per render. */
export function useEligibility(inputs: EligibilityInputs): boolean {
  const [, force] = useState(0);
  useEffect(() => subscribeEligibility(() => force((n) => n + 1)), []);
  return computeEligibility(inputs);
}

/** Reads `irth.firstLaunch.choice.v1` and republishes its presence
 *  as an eligibility flag. Safe to call multiple times. */
export function refreshFirstLaunchChoiceFlag(): void {
  try {
    if (typeof window === "undefined") {
      setEligibilityFlag("firstLaunchChoiceRecorded", false);
      return;
    }
    const present =
      window.localStorage.getItem("irth.firstLaunch.choice.v1") != null;
    setEligibilityFlag("firstLaunchChoiceRecorded", present);
  } catch {
    setEligibilityFlag("firstLaunchChoiceRecorded", false);
  }
}
