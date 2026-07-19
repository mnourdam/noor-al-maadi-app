// ============================================================
// Guided Tutorial — Eligibility (Phase 2B.5)
// ------------------------------------------------------------
// Pure predicate + subsystem flag bus + Phase 2B.5 debug overrides.
//
// Overrides:
//   • forceEligibility()   — predicate returns true regardless of
//                            the flag bus and environmental inputs.
//   • disableEligibility() — predicate returns false regardless.
//   • clearEligibilityOverride() — restores normal evaluation.
//
// Overrides are engine-observable (subscribers are notified when
// they change). They exist for the debug controller and future
// admin diagnostics; production code does not call them.
// ============================================================

import { useEffect, useState } from "react";
import { TUTORIAL_HOME_STABLE_FRAMES } from "./data";

export type EligibilityFlag =
  | "cinematicUnmounted"
  | "openingCompletedEvent"
  | "firstLaunchChoiceRecorded"
  | "sessionReady"
  | "authDialogClosed"
  | "googleAuthResultDialogClosed"
  | "recoveryGuardInactive";

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

const flagState: Record<EligibilityFlag, boolean> = { ...DEFAULTS };
const listeners = new Set<Listener>();

type Override = "force" | "disable" | null;
let override: Override = null;

function emit() {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function setEligibilityFlag(flag: EligibilityFlag, value: boolean): void {
  if (flagState[flag] === value) return;
  flagState[flag] = value;
  emit();
}

export function getAllEligibilityFlags(): Record<EligibilityFlag, boolean> {
  return { ...flagState };
}

export function getEligibilityFlag(flag: EligibilityFlag): boolean {
  return flagState[flag];
}

export function subscribeEligibility(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ------------------------------------------------------------
// Debug overrides
// ------------------------------------------------------------

export function forceEligibilityOverride(): void {
  if (override === "force") return;
  override = "force";
  emit();
}

export function disableEligibilityOverride(): void {
  if (override === "disable") return;
  override = "disable";
  emit();
}

export function clearEligibilityOverride(): void {
  if (override == null) return;
  override = null;
  emit();
}

export function getEligibilityOverride(): Override {
  return override;
}

export interface EligibilityInputs {
  pathname: string;
  overlayStackSize: number;
  homeStableFrames: number;
  documentVisible: boolean;
}

/** Pure predicate — no side effects. */
export function computeEligibility(inputs: EligibilityInputs): boolean {
  if (override === "force") return true;
  if (override === "disable") return false;

  if (!flagState.cinematicUnmounted) return false;
  if (!flagState.openingCompletedEvent) return false;
  if (!flagState.firstLaunchChoiceRecorded) return false;
  if (!flagState.sessionReady) return false;
  if (!flagState.authDialogClosed) return false;
  if (!flagState.googleAuthResultDialogClosed) return false;
  if (!flagState.recoveryGuardInactive) return false;

  if (inputs.pathname !== "/") return false;
  if (!inputs.documentVisible) return false;
  if (inputs.overlayStackSize > 0) return false;
  if (inputs.homeStableFrames < TUTORIAL_HOME_STABLE_FRAMES) return false;

  return true;
}

/** Human-readable reason the tour is currently ineligible — used by
 *  diagnostics only; returns null when eligible. */
export function eligibilityWaitingReason(
  inputs: EligibilityInputs,
): string | null {
  if (override === "force") return null;
  if (override === "disable") return "override:disabled";

  if (!flagState.cinematicUnmounted) return "cinematic-mounted";
  if (!flagState.openingCompletedEvent) return "opening-not-completed";
  if (!flagState.firstLaunchChoiceRecorded) return "first-launch-choice-pending";
  if (!flagState.sessionReady) return "session-loading";
  if (!flagState.authDialogClosed) return "auth-dialog-open";
  if (!flagState.googleAuthResultDialogClosed) return "google-auth-result-open";
  if (!flagState.recoveryGuardInactive) return "recovery-mode-active";
  if (inputs.pathname !== "/") return `off-home:${inputs.pathname}`;
  if (!inputs.documentVisible) return "document-hidden";
  if (inputs.overlayStackSize > 0) return "overlay-open";
  if (inputs.homeStableFrames < TUTORIAL_HOME_STABLE_FRAMES)
    return "home-not-stable";

  return null;
}

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
