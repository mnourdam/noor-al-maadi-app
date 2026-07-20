/**
 * Achievement Engine v2 — FROZEN public API.
 *
 * Everything re-exported from this module is the stable surface for the rest
 * of the app. Anything not exported here is INTERNAL and subject to change
 * without notice. The legacy engine (`evaluateAchievements`, legacy watcher,
 * `markAchievementEarned`) was removed in the finalization slice; v2 is now
 * the sole source of truth for unlock, progress, reward, and view state.
 *
 * Public surface:
 *   - Types:         AchievementDefinition, AchievementView, AchievementState,
 *                    AchievementRewards, ProgressSnapshot, EvaluationResult,
 *                    UserAchievementRecord, CanonicalDomain, AchievementId,
 *                    AchievementCategory, AchievementRarity
 *   - Registry:      registry, buildRegistry, validate, ENGINE_VERSION,
 *                    REGISTRY_VERSION, RegistryValidationIssue
 *   - Snapshot:      emptySnapshot, rebuildSnapshot, registerSliceProvider
 *   - Evaluator:     evaluate
 *   - Reconciler:    reconcile, dispatchClaimTransitions
 *   - ViewModel:     buildViews
 *   - Event bus:     onAchievementEvent, onAchievementAnalytics,
 *                    dispatchAchievementHook + payload types
 *   - i18n:          resolveI18n, setAchievementLocale, getAchievementLocale
 *   - Server RPC:    claimAchievements, fetchUserAchievements, ClaimResult
 *   - React hooks:   AchievementEngineBoot, useAchievementViews (driver.tsx)
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
