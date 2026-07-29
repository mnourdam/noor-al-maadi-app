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

  if (existing && structureValid) return existing;

  const fresh = blankPlan(planKey, ownerKey, campaignId, chapterId, originalActivityIds, now);
  if (!memoryEnabled()) {
    savePlan(fresh);
    return fresh;
  }

  const decision = decideInsertion(originalActivityIds, now);
  if (decision.insertionAfterActivityId == null) {
    savePlan(fresh);
    return fresh;
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
    savePlan(fresh);
    return fresh;
  }

  const planned: RuntimeChapterPlan = {
    ...fresh,
    insertionAfterActivityId: decision.insertionAfterActivityId,
    reviewItemId: item.id,
    reviewItemRevision: item.revision,
    reviewAttemptId: newUuid(),
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
  if (!memoryEnabled() || plan.reviewCompleted) return [...originalActivities];
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
