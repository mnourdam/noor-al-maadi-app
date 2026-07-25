// ============================================================
// Stories M3 — Unlock Spec v2 barrel
// ------------------------------------------------------------
// Single import surface for the unlock subsystem. Callers MUST
// import from this file; deep imports risk drifting past the
// validator / normaliser pipeline.
// ============================================================

export * from "./spec";
export { validateUnlockSpec, parseUnlockSpec, walkUnlockNodes } from "./validate";
export { normalizeUnlockSpec } from "./normalize";
export { evaluateUnlock, evaluateUnlockUnknown } from "./evaluate";
export {
  evaluateStoryUnlock,
  isAlwaysUnlockSpec,
  toUnlockSpecV2,
  type PlayerUnlockState,
} from "./local";
export { detectUnlockCycles, extractStoryDeps, type UnlockCycle } from "./cycle";
