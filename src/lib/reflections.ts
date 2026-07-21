// ============================================================
// Reflective Moments — local persistence adapter
// ------------------------------------------------------------
// Reflective Moments are educational pauses inside imported
// campaigns. They are NOT scored: every answer is accepted and
// completion is captured by the standard imported-campaign
// progress store (recordActivity + claimActivityReward), which
// already guarantees idempotency across resumes, offline replays
// and duplicate onResolve calls.
//
// This module owns the *auxiliary* per-reflection state — the
// chosen option and the optional free-text — which is *not*
// tracked by the activity progress ledger. It is stored under
// its own localStorage key, keyed by (campaignId, activityId),
// so the player can resume mid-campaign and see their previous
// selection and personal note.
//
// Data model (fully data-driven; no campaign is hardcoded):
//   {
//     "<campaignId>:<activityId>": {
//       mode: "continue" | "choose" | "write",
//       choiceIndex?: number,   // 0-based, "choose" mode only
//       choiceValue?: string,   // canonicalized option text
//       text?: string,          // "write" mode or allowFreeText
//       at: string,             // ISO timestamp of last update
//     },
//     ...
//   }
//
// Written data NEVER leaves the device — the parent chapter route
// still emits its normal `onResolve(true)` and the standard
// server-side progress ledger records completion. This adapter
// only shapes the *view* on resume.
// ============================================================

import type { CampaignActivity } from "@/types/campaign";

export const REFLECTIONS_KEY = "irth_reflections_v1";

export type ReflectionMode = "continue" | "choose" | "write";

export interface ReflectionRecord {
  mode: ReflectionMode;
  choiceIndex?: number;
  choiceValue?: string;
  text?: string;
  at: string;
}

export type ReflectionKey = `${string}:${string}`;
export type ReflectionStore = Record<ReflectionKey, ReflectionRecord>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): ReflectionStore {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(REFLECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as ReflectionStore;
  } catch {
    return {};
  }
}

function writeAll(store: ReflectionStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFLECTIONS_KEY, JSON.stringify(store));
  } catch {
    // Storage full / privacy mode — reflections are non-critical, silently drop.
  }
}

function keyOf(campaignId: string, activityId: string): ReflectionKey {
  return `${campaignId}:${activityId}` as ReflectionKey;
}

export function getReflection(campaignId: string, activityId: string): ReflectionRecord | null {
  return readAll()[keyOf(campaignId, activityId)] ?? null;
}

export function saveReflection(
  campaignId: string,
  activityId: string,
  patch: Omit<ReflectionRecord, "at"> & { at?: string },
): ReflectionRecord {
  const store = readAll();
  const k = keyOf(campaignId, activityId);
  const prev = store[k];
  const next: ReflectionRecord = {
    mode: patch.mode,
    choiceIndex: patch.choiceIndex ?? prev?.choiceIndex,
    choiceValue: patch.choiceValue ?? prev?.choiceValue,
    text: patch.text ?? prev?.text,
    at: patch.at ?? new Date().toISOString(),
  };
  store[k] = next;
  writeAll(store);
  return next;
}

/**
 * Resolves the effective reflective-moment mode from an authored
 * `CampaignActivity`. Pure function — safe to unit-test.
 *
 * Rules:
 *   1. `reflectionMode === "write"` → "write" (author-forced).
 *   2. `reflectionMode === "choose"` AND has ≥2 options → "choose".
 *   3. `reflectionMode === "continue"` → "continue".
 *   4. Author left mode unset:
 *        - has ≥2 non-empty options → "choose"
 *        - otherwise                → "continue"
 */
export function resolveReflectionMode(activity: CampaignActivity): ReflectionMode {
  const opts = (activity.options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
  const authored = activity.reflectionMode;
  if (authored === "write") return "write";
  if (authored === "continue") return "continue";
  if (authored === "choose") return opts.length >= 2 ? "choose" : "continue";
  return opts.length >= 2 ? "choose" : "continue";
}

/** Non-empty, trimmed choice list — safe to render directly. */
export function reflectionChoices(activity: CampaignActivity): string[] {
  return (activity.options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
}
