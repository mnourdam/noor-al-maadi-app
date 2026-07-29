// ============================================================
// Memory Engine — Plan (RuntimeChapterPlan) lifecycle
// ------------------------------------------------------------
// The plan is the single source of truth for "does this chapter
// have a review, which one, where does it go?" It is:
//   - created ONCE per (owner, campaign, chapter)
//   - persisted in partitioned localStorage
//   - re-created automatically when the engine version or plan
//     structure version changes (amendment #1)
//   - self-healing when the frozen ReviewItem's correctness-critical
//     revision has changed since the plan was written (amendment #2)
// ============================================================

import { getActiveOwner } from "@/lib/identity/owner";
import { hashParts } from "./hash";
import { memoryEnabled } from "./flags";
import { loadBank, findItem } from "./bank";
import { pickForChapter, recentAttempts } from "./selector";
import { decideInsertion } from "./scheduler";
import type {
  MemoryReviewActivityMarker,
  ReviewItem,
  RuntimeChapterPlan,
} from "./types";
import { MEMORY_ENGINE_VERSION, MEMORY_PLAN_STRUCTURE_VERSION } from "./types";

const PLAN_PREFIX = "irth.memory.plan.";

function keyFor(planKey: string): string {
  return `${PLAN_PREFIX}${planKey}`;
}

export function planKeyFor(campaignId: string, chapterId: string, ownerKey: string): string {
  return hashParts("plan", ownerKey, campaignId, chapterId);
}

function loadPlan(planKey: string): RuntimeChapterPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(planKey));
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeChapterPlan;
  } catch { return null; }
}

function savePlan(plan: RuntimeChapterPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(plan.planKey), JSON.stringify(plan));
  } catch { /* ignore */ }
}

function newUuid(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(now: number): string {
  return new Date(now).toISOString();
}

function blankPlan(
  planKey: string,
  ownerKey: string,
  campaignId: string,
  chapterId: string,
  originalActivityIds: string[],
  now: number,
): RuntimeChapterPlan {
  return {
    planKey, ownerKey, campaignId, chapterId,
    engineVersion: MEMORY_ENGINE_VERSION,
    structureVersion: MEMORY_PLAN_STRUCTURE_VERSION,
    originalActivityIds,
    insertionAfterActivityId: null,
    reviewItemId: null,
    reviewItemRevision: null,
    reviewAttemptId: null,
    reviewCompleted: false,
    reviewCorrect: null,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
  };
}

/**
 * Ensure a plan exists for this chapter for the active owner. Behaviour:
 *   - Missing plan     → create + select once (if allowed) + save.
 *   - Version mismatch → discard + create fresh (amendment #1).
 *   - Structure drift  → discard + create fresh.
 *   - Owner change     → planKey differs ⇒ never touches the old plan.
 *   - Feature off      → returns a "no-review" plan without touching bank.
 *
 * NOTE: never re-picks a review mid-chapter unless the plan was
 * invalidated by a version bump or a revision-critical content change
 * (see `resolveReviewFromPlan`).
 */
export function ensurePlan(
  campaignId: string,
  chapterId: string,
  originalActivityIds: string[],
  now: number = Date.now(),
  opts?: { allowReselect?: boolean },
): RuntimeChapterPlan {
  const ownerKey = getActiveOwner();
  const planKey = planKeyFor(campaignId, chapterId, ownerKey);
  const existing = loadPlan(planKey);

  const structureValid = existing
    && existing.engineVersion === MEMORY_ENGINE_VERSION
    && existing.structureVersion === MEMORY_PLAN_STRUCTURE_VERSION
    && existing.ownerKey === ownerKey
    && Array.isArray(existing.originalActivityIds)
    && existing.originalActivityIds.join("|") === originalActivityIds.join("|");

  if (existing && structureValid) {
    // A plan frozen with NO review because the bank was empty or the
    // daily cap was reached is a TRANSIENT miss, not a decision. When the
    // caller says it is safe (chapter not started yet), retry selection —
    // otherwise the very first visit permanently disables reviews for
    // that chapter. Mid-chapter re-selection is never attempted.
    if (existing.selectionDeferred && opts?.allowReselect && !existing.reviewCompleted) {
      return selectInto(existing, originalActivityIds, campaignId, chapterId, now);
    }
    return existing;
  }

  const fresh = blankPlan(planKey, ownerKey, campaignId, chapterId, originalActivityIds, now);
  if (!memoryEnabled()) {
    fresh.selectionDeferred = true;
    savePlan(fresh);
    return fresh;
  }
  return selectInto(fresh, originalActivityIds, campaignId, chapterId, now);
}

/** Runs the scheduler + selector against a (blank or deferred) plan. */
function selectInto(
  base: RuntimeChapterPlan,
  originalActivityIds: string[],
  campaignId: string,
  chapterId: string,
  now: number,
): RuntimeChapterPlan {
  const decision = decideInsertion(originalActivityIds, now);
  if (decision.insertionAfterActivityId == null) {
    // "chapter-too-short" is permanent for this chapter; "daily-cap-reached"
    // is transient and must be retried on a later visit.
    const next: RuntimeChapterPlan = {
      ...base,
      insertionAfterActivityId: null,
      reviewItemId: null,
      reviewItemRevision: null,
      reviewAttemptId: null,
      selectionDeferred: decision.reason === "daily-cap-reached",
      updatedAt: nowIso(now),
    };
    savePlan(next);
    return next;
  }

  const bank = loadBank();
  const recent = recentAttempts(3);
  const item = pickForChapter({
    campaignId, chapterId, now,
    bank,
    recentSourceIds: recent.sourceIds,
    recentKinds: recent.kinds,
  });
  if (!item) {
    // Empty / fully-excluded bank — transient (the bank fills up as the
    // player completes more campaigns).
    const next: RuntimeChapterPlan = {
      ...base,
      insertionAfterActivityId: null,
      reviewItemId: null,
      reviewItemRevision: null,
      reviewAttemptId: null,
      selectionDeferred: true,
      updatedAt: nowIso(now),
    };
    savePlan(next);
    return next;
  }

  const planned: RuntimeChapterPlan = {
    ...base,
    insertionAfterActivityId: decision.insertionAfterActivityId,
    reviewItemId: item.id,
    reviewItemRevision: item.revision,
    reviewAttemptId: base.reviewAttemptId ?? newUuid(),
    selectionDeferred: false,
    updatedAt: nowIso(now),
  };
  savePlan(planned);
  return planned;
}


/**
 * Resolve the LIVE ReviewItem for a plan, applying amendment #2:
 *   - Item still present + revision matches ⇒ use latest content (prose
 *     fixes flow through automatically).
 *   - Item missing OR revision changed ⇒ treat as removed; return null
 *     and null out the plan's review fields so the runtimeActivities
 *     list falls back to the original chapter unchanged.
 */
export function resolveReviewFromPlan(plan: RuntimeChapterPlan): ReviewItem | null {
  if (!plan.reviewItemId) return null;
  const live = findItem(plan.reviewItemId);
  if (!live || live.revision !== plan.reviewItemRevision) {
    // Telemetry: don't let content deletion / revision drift disappear
    // silently — we want to know if reviews are being dropped in the wild.
    try {
      const reason = !live ? "content_missing" : "revision_changed";
      logReviewDrop({
        reason,
        planKey: plan.planKey,
        reviewItemId: plan.reviewItemId,
        reviewItemRevision: plan.reviewItemRevision,
        campaignId: plan.campaignId,
        chapterId: plan.chapterId,
        at: new Date().toISOString(),
      });
    } catch { /* telemetry must never break gameplay */ }
    if (plan.reviewItemId || plan.reviewItemRevision) {
      const patched: RuntimeChapterPlan = {
        ...plan,
        reviewItemId: null,
        reviewItemRevision: null,
        reviewAttemptId: null,
        insertionAfterActivityId: null,
        updatedAt: new Date().toISOString(),
      };
      savePlan(patched);
    }
    return null;
  }
  return live;
}

// ---- Telemetry for silent-drop protection (point #2) ----
const TELEMETRY_KEY = "irth.memory.telemetry.drops.v1";
const TELEMETRY_MAX = 50;
export type MemoryReviewDropReason = "content_missing" | "revision_changed";
export interface MemoryReviewDropEntry {
  reason: MemoryReviewDropReason;
  planKey: string;
  reviewItemId: string | null;
  reviewItemRevision: string | null;
  campaignId: string;
  chapterId: string;
  at: string;
}
function logReviewDrop(entry: MemoryReviewDropEntry): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    const arr: MemoryReviewDropEntry[] = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    while (arr.length > TELEMETRY_MAX) arr.shift();
    window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
  try {
    // Also surface in console so QA / support can spot missing content fast.
    // eslint-disable-next-line no-console
    console.warn("[memory] review dropped", entry);
  } catch { /* ignore */ }
}
export function readReviewDropLog(): MemoryReviewDropEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    return raw ? (JSON.parse(raw) as MemoryReviewDropEntry[]) : [];
  } catch { return []; }
}
export function clearReviewDropLog(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(TELEMETRY_KEY); } catch { /* ignore */ }
}

export function markReviewCompleted(planKey: string, correct: boolean): RuntimeChapterPlan | null {
  const plan = loadPlan(planKey);
  if (!plan) return null;
  const updated: RuntimeChapterPlan = {
    ...plan,
    reviewCompleted: true,
    reviewCorrect: correct,
    updatedAt: new Date().toISOString(),
  };
  savePlan(updated);
  return updated;
}

export function clearPlan(planKey: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(keyFor(planKey)); }
  catch { /* ignore */ }
}

/**
 * Build the runtime activity list by interleaving the frozen review
 * (when present + enabled + still valid) into the authored order.
 * ORIGINAL activities are returned untouched — the review is a
 * synthetic marker object the renderer branches on.
 */
export function buildRuntimeActivities<T extends { id: string }>(
  originalActivities: T[],
  plan: RuntimeChapterPlan,
): (T | MemoryReviewActivityMarker)[] {
  // Point #1: once a plan has committed a review (insertionAfterActivityId set),
  // the chapter session honours it to the end even if the runtime kill switch
  // flips mid-session. Flag flips only affect NEW plans (see `ensurePlan`).
  // A plan with no review committed is still gated by the flag so we don't
  // start injecting after re-enable.
  const hasCommittedReview = plan.reviewItemId != null && plan.insertionAfterActivityId != null;
  if (plan.reviewCompleted) return [...originalActivities];
  if (!hasCommittedReview && !memoryEnabled()) return [...originalActivities];
  const item = resolveReviewFromPlan(plan);
  if (!item || !plan.insertionAfterActivityId) return [...originalActivities];

  const out: (T | MemoryReviewActivityMarker)[] = [];
  for (const act of originalActivities) {
    out.push(act);
    if (act.id === plan.insertionAfterActivityId) {
      out.push({
        __memoryReview: true,
        runtimeId: `review:${plan.planKey}:${item.id}`,
        planKey: plan.planKey,
        reviewItemId: item.id,
      });
    }
  }
  return out;
}

export function isReviewMarker(a: unknown): a is MemoryReviewActivityMarker {
  return !!(a as { __memoryReview?: boolean })?.__memoryReview;
}

export const MEMORY_PLAN_PREFIX = PLAN_PREFIX;
