// ============================================================
// Memory Engine — Types
// ------------------------------------------------------------
// A ReviewItem is one atomic piece of previously-learned knowledge
// that can be surfaced as a single review question, independent of
// its source (campaign / investigation / story / museum / daily).
//
// v1 ships with the campaign provider only; other sources plug in
// via `registerProvider()` in `providers/index.ts` without touching
// the scheduler, selector, plan, or renderer.
// ============================================================

export type MemorySourceType =
  | "campaign"
  | "investigation"
  | "story"
  | "museum"
  | "daily_challenge";

export type MemoryItemKind = "mcq" | "true_false";

export interface ReviewItem {
  /** hash(sourceType + sourceId + localRef) — stable across runs. */
  id: string;
  sourceType: MemorySourceType;
  sourceId: string;
  /** Arabic label shown ONLY after the answer is revealed. */
  sourceLabel: string;
  /** Provider-defined pointer into the source (e.g. `chapter:xyz#activity:abc`). */
  localRef: string;
  kind: MemoryItemKind;
  prompt: string;
  options?: string[];
  /**
   * Canonical correct answer.
   *   - mcq        → index into `options` (number)
   *   - true_false → boolean
   */
  correctAnswer: number | boolean;
  /** Original XP as authored on the source activity (may be 0). */
  originalXp: number;
  era?: string;
  tags?: string[];
  /**
   * Content revision fingerprint. Hashes ONLY the correctness-critical
   * fields (kind + correctAnswer + normalized option set). Prose tweaks
   * to prompt/label do NOT change this — future content corrections can
   * flow into an already-scheduled review as long as the correctness
   * shape is intact. See `bank.ts::computeItemRevision`.
   */
  revision: string;
}

// ------------------------------------------------------------
// RuntimeChapterPlan — the frozen-once contract that lets the
// review survive reloads, app restarts, flag toggles, and content
// edits without ever destabilising the underlying chapter.
// ------------------------------------------------------------

/** Bumped when the engine's decision logic changes in a way that
 *  invalidates every persisted plan (e.g. new scheduler rule). */
export const MEMORY_ENGINE_VERSION = 1;
/** Bumped when the on-disk plan shape changes. */
export const MEMORY_PLAN_STRUCTURE_VERSION = 1;

export interface RuntimeChapterPlan {
  planKey: string;
  ownerKey: string;
  campaignId: string;
  chapterId: string;

  /** Version stamps — see amendment #1. Mismatch ⇒ plan is
   *  discarded and re-generated on next entry. */
  engineVersion: number;
  structureVersion: number;

  /** Original activity ids in authored order — the ONLY source of
   *  truth for progress and completion. runtimeActivities are
   *  reconstructed from these plus `insertionAfterActivityId`. */
  originalActivityIds: string[];

  /** null ⇒ no review in this chapter (final decision, taken once). */
  insertionAfterActivityId: string | null;

  /**
   * True when the "no review" outcome was TRANSIENT (empty bank, daily
   * cap, feature flag off) rather than a real decision. Such a plan may
   * re-run selection on a later visit, but only before the chapter has
   * been started — never mid-chapter.
   */
  selectionDeferred?: boolean;


  /** Chosen once at plan creation, then FROZEN. Never re-selected. */
  reviewItemId: string | null;
  /** Content revision at plan-creation time — see amendment #2. */
  reviewItemRevision: string | null;

  /** Idempotency key for XP grant. Never regenerated. */
  reviewAttemptId: string | null;

  /** Local completion flag for the review runtime activity. Does NOT
   *  gate chapter completion — that stays on original activities. */
  reviewCompleted: boolean;
  reviewCorrect: boolean | null;

  createdAt: string;
  updatedAt: string;
}

/** Marker set on the synthetic runtime activity so the renderer can
 *  branch without touching campaign types. */
export interface MemoryReviewActivityMarker {
  __memoryReview: true;
  runtimeId: string;                     // `review:<planKey>:<itemId>`
  planKey: string;
  reviewItemId: string;
}
