// ============================================================
// Memory Engine — Selector
// ------------------------------------------------------------
// Picks at most ONE ReviewItem for a chapter, given the current
// bank + history. Deterministic per (owner, day, chapter).
//
// Priority (amendment #3 preserved: neverReviewed ⇒ eligibleImmediately):
//   1. wrong last time AND due now
//   2. overdue (past nextDueAt)
//   3. never reviewed
//   4. due now, oldest lastAttemptAt first
// Tie-breakers: no same source in last 3 attempts, no same kind twice
// in a row. Falls back to first eligible if all constraints exclude.
// ============================================================

import type { ReviewItem } from "./types";
import { allEntries, getEntry } from "./history";
import { isDue } from "./spacing";

interface Context {
  campaignId: string;
  chapterId: string;
  now: number;
}

export interface SelectionContext extends Context {
  bank: ReviewItem[];
  /** Recently attempted item ids for source-diversity tie-breaking. */
  recentSourceIds?: string[];
  recentKinds?: string[];
}

type Bucket = "wrong-due" | "overdue" | "never" | "due-oldest";

function bucketOf(item: ReviewItem, now: number): Bucket | null {
  const entry = getEntry(item.id);
  if (!entry) return "never";
  if (entry.lastAttemptCorrect === false && isDue(entry, now)) return "wrong-due";
  if (entry.nextDueAt != null && entry.nextDueAt < now - 24 * 60 * 60 * 1000) return "overdue";
  if (isDue(entry, now)) return "due-oldest";
  return null;
}

const BUCKET_ORDER: Bucket[] = ["wrong-due", "overdue", "never", "due-oldest"];

export function pickForChapter(ctx: SelectionContext): ReviewItem | null {
  const { bank, now } = ctx;
  if (!bank.length) return null;

  // Exclude items that originate from THIS campaign — a review only
  // reinforces knowledge from OTHER campaigns the player has already
  // finished. Reviewing content from the campaign in play would
  // trivialise the injected question.
  const eligible = bank.filter(i => !(i.sourceType === "campaign" && i.sourceId === ctx.campaignId));
  if (!eligible.length) return null;

  const buckets: Record<Bucket, ReviewItem[]> = {
    "wrong-due": [],
    "overdue": [],
    "never": [],
    "due-oldest": [],
  };
  for (const item of eligible) {
    const b = bucketOf(item, now);
    if (b) buckets[b].push(item);
  }

  const recentSources = new Set(ctx.recentSourceIds ?? []);
  const lastKind = ctx.recentKinds?.[0];

  for (const bucket of BUCKET_ORDER) {
    const list = buckets[bucket];
    if (!list.length) continue;
    const sorted = bucket === "due-oldest" || bucket === "overdue"
      ? [...list].sort((a, b) => {
          const ea = getEntry(a.id)?.lastAttemptAt ?? 0;
          const eb = getEntry(b.id)?.lastAttemptAt ?? 0;
          return ea - eb;
        })
      : list;

    const withSourceDiversity = sorted.filter(i => !recentSources.has(i.sourceId));
    const kindDiverse = lastKind
      ? (withSourceDiversity.length ? withSourceDiversity : sorted).filter(i => i.kind !== lastKind)
      : (withSourceDiversity.length ? withSourceDiversity : sorted);

    if (kindDiverse.length) return deterministicPick(kindDiverse, ctx);
    if (withSourceDiversity.length) return deterministicPick(withSourceDiversity, ctx);
    return deterministicPick(sorted, ctx);
  }

  return null;
}

function deterministicPick(items: ReviewItem[], ctx: Context): ReviewItem {
  if (items.length === 1) return items[0];
  // Stable ordering by id, then choose by day-hash for daily variety
  // without turning selection random within a day.
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const day = new Date(ctx.now).toISOString().slice(0, 10);
  let h = 0;
  const seed = `${day}|${ctx.chapterId}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return sorted[h % sorted.length];
}

/** Compact "recent attempts" projection from history for diversity guards. */
export function recentAttempts(limit = 3): { sourceIds: string[]; kinds: string[] } {
  const entries = Object.values(allEntries())
    .filter(e => e.lastAttemptAt != null)
    .sort((a, b) => (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0))
    .slice(0, limit);
  const sourceIds: string[] = [];
  const kinds: string[] = [];
  for (const e of entries) {
    // We only know itemId here; provider information is embedded in the id
    // hash and not recoverable without the bank. Callers pass sourceIds
    // separately when they have live bank context; this helper is used
    // as a lightweight fallback (kinds unavailable ⇒ empty).
    sourceIds.push(e.itemId);
    kinds.push("");
  }
  return { sourceIds, kinds };
}
