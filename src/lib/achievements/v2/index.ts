/**
 * Achievement Engine v2 — public entry point.
 *
 * This slice exposes the engine surface without wiring it into UI. The
 * legacy engine (`ACHIEVEMENTS` / `evaluateAchievements` / `AchievementWatcher`)
 * remains authoritative until the cutover slice. Import from here only:
 *
 *   import {
 *     registry, evaluate, buildViews, reconcile,
 *     rebuildSnapshot, emptySnapshot,
 *     onAchievementEvent, onAchievementAnalytics,
 *     claimAchievements, fetchUserAchievements,
 *     ENGINE_VERSION,
 *   } from "@/lib/achievements/v2";
 */

export * from "./types";
export { ENGINE_VERSION, REGISTRY_VERSION, buildRegistry, validate } from "./registry";
export type { Registry, RegistryValidationIssue } from "./registry";
export { evaluate } from "./evaluator";
export { buildViews } from "./viewModel";
export { reconcile, dispatchClaimTransitions } from "./reconciler";
export {
  emptySnapshot,
  rebuildSnapshot,
  registerSliceProvider,
} from "./snapshot";
export type { SliceProvider } from "./snapshot";
export {
  onAchievementEvent,
  onAchievementAnalytics,
  dispatchAchievementHook,
} from "./events";
export type {
  AchievementEventPayload,
  AchievementAnalyticsPayload,
  AchievementLifecycleHook,
} from "./events";
export { resolveI18n, setAchievementLocale, getAchievementLocale } from "./i18n";
export type { LocaleId } from "./i18n";
export { claimAchievements, fetchUserAchievements } from "./claim.functions";
export type { ClaimResult } from "./claim.functions";

import { buildRegistry } from "./registry";
import { DEFINITIONS } from "./definitions";

/** The frozen, validated project registry. Rebuilds only on module reload. */
export const registry = buildRegistry(DEFINITIONS);
