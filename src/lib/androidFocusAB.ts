/**
 * Production stub for the former Android focus A/B experiment.
 * All experiments shipped as defaults; no flag is active.
 */

export type AndroidFocusABFlagKey =
  | "disableGlobalFocusBlur"
  | "disableCampaignFocusLogic"
  | "disableKeyboardViewportResize"
  | "disableScrollIntoView"
  | "disableSelectionChange"
  | "disablePerfClassToggles"
  | "disableFocusVisualToggles";

export function isAndroidFocusABDisabled(_key: AndroidFocusABFlagKey): boolean {
  return false;
}

export function installAndroidFocusABSwitches(): void {
  /* no-op in production */
}
