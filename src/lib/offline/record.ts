// ============================================================
// Unified progress recorder
// ------------------------------------------------------------
// Single façade every gameplay call site should use to persist
// completions/discoveries/rewards. Immediately enqueues to the
// durable outbox and attempts a best-effort flush. When offline
// the enqueue succeeds and the flush is a no-op; on reconnect
// the driver drains everything in one pass.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { enqueue, enqueueWithId, type OutboxKind } from "./outbox";
import { saveGameplay, saveUserId, type SaveOutcome } from "./gameplay-write";
import { flushOutbox } from "./flush";
import { recordTrace } from "@/lib/diag-trace";

async function currentUserId(): Promise<string | null> {
  try {
    return await saveUserId();
  } catch { return null; }
}

async function record(kind: OutboxKind, payload: Record<string, unknown>): Promise<SaveOutcome> {
  try { payload = JSON.parse(JSON.stringify(payload)); }
  catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, queued: false, reason: "unauthenticated" };
  try { await enqueue(uid, kind, payload); }
  catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  void flushOutbox(uid).catch(() => {});
  return { acknowledged: false, queued: true };
}

export async function recordCollectionAdd(p: {
  itemId: string; itemType: string;
  sourceCampaignId?: string | null; sourceChapterId?: string | null;
}): Promise<SaveOutcome> {
  const outcome = await record("collection_add", p);
  // Artifact ownership gates (`artifact_owned` unlock nodes) listen for this.
  if (outcome.queued && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("irth:collection:changed", { detail: { itemId: p.itemId } }));
    } catch { /* noop */ }
  }
  return outcome;
}


export async function recordGameComplete(p: {
  gameId: string; stageIndex: number; score: number;
}, owner?: string): Promise<SaveOutcome> {
  p = { ...p };
  const uid = owner ?? await saveUserId();
  if (!uid) return { acknowledged: false, queued: false, reason: "unauthenticated" };
  try { await enqueueWithId(uid, `game_complete:${uid}:${p.gameId}`, "game_complete", p); }
  catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  if (typeof navigator === "undefined" || navigator.onLine) void flushOutbox(uid).catch(() => {});
  return { acknowledged: false, queued: true };
}

/**
 * Priority-Zero durable write contract for chapter progress.
 *
 *   1. Enqueue an outbox operation with a STABLE id
 *      (`chapter_progress:<uid>:<campaignId>:<chapterId>`). Re-enqueueing
 *      the same key overwrites; it never duplicates.
 *   2. Immediately call `record_campaign_progress_v2` when online.
 *   3. On success the item is removed and callers observe the acknowledged
 *      canonical state. On failure the item stays queued for later flush.
 *   4. Permanent failures (invalid ids, unknown chapter, etc.) fall through
 *      to the flush driver which moves them to the dead-letter store —
 *      progress is NEVER silently marked as server-synced.
 *
 * The v2 RPC atomically stamps `user_campaign_completions` when the final
 * chapter completes, so callers do not need a separate completion write.
 */
export async function recordChapterProgress(p: {
  campaignId: string; chapterId: string;
  status: "locked" | "unlocked" | "completed";
  score?: number; xpEarned?: number; coinsEarned?: number;
  completed?: boolean;
}): Promise<{
  acknowledged: boolean;
  queued: boolean;
  dequeued?: boolean;
  reason?: string;
  operationId?: string;
  rpc?: {
    ok?: boolean;
    reason?: string;
    chapter_completed?: boolean;
    chapter_completed_at?: string | null;
    campaign_completed?: boolean;
    campaign_completion_updated?: boolean;
    campaign_completion_completed_at?: string | null;
    campaign_version?: number | null;
  };
}> {
  p = { ...p };
  let uid: string | null;
  try { uid = await saveUserId(true); }
  catch { return { acknowledged: false, queued: false, reason: "identity_changed" }; }
  if (!uid) {
    try {
      const { bufferChapterProgress } = await import("@/lib/campaigns/guest-progress-buffer");
      bufferChapterProgress(p);
    } catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
    return { acknowledged: false, queued: false, reason: "buffered_no_session" };
  }
  const outboxId = `chapter_progress:${uid}:${p.campaignId}:${p.chapterId}`;
  const outcome = await saveGameplay({
    userId: uid, id: outboxId, kind: "chapter_progress", payload: p,
    rpc: () => supabase.rpc("record_campaign_progress_v2" as any, {
      p_campaign_id: p.campaignId, p_chapter_id: p.chapterId, p_completed: !!p.completed,
      p_score: p.score ?? null, p_xp_earned: p.xpEarned ?? null, p_coins_earned: p.coinsEarned ?? null,
    }),
  });
  if (outcome.acknowledged) {
    try {
      window.dispatchEvent(new CustomEvent("irth:campaign-progress:changed"));
      window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
    } catch { /* observer */ }
  }
  recordTrace("campaign-persistence", outcome.acknowledged ? "record_campaign_progress_v2-ok" : "record_campaign_progress_v2-not-ok", JSON.stringify({
    operationId: outboxId, acknowledged: outcome.acknowledged, queued: outcome.queued,
    normalizedError: outcome.reason, rpcResponse: outcome.result,
    outboxAcknowledgement: outcome.dequeued ? "removed" : "retained-or-unavailable",
  }));
  return { ...outcome, operationId: outboxId, rpc: outcome.result };
}

export async function recordProfileDelta(p: {
  xp?: number; dinars?: number; hearts?: number; source?: string;
}): Promise<SaveOutcome> {
  return record("profile_delta", p);
}

/**
 * Encyclopedia read/discovery. Uses a caller-supplied stable idempotency
 * key so replays cannot create duplicate rows even across offline flushes.
 * Guest: no-op (nothing written to Supabase). The local mirror is handled
 * by `@/lib/entityDiscoveries` separately.
 */
export async function recordEntityDiscovery(p: {
  entityId: string;
  entitySlug: string;
  entityType: string;
  source?: string;
}): Promise<SaveOutcome> {
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, queued: false, reason: "unauthenticated" };
  const id = `entity_discovery:${uid}:${p.entityId}`;
  try { await enqueueWithId(uid, id, "entity_discovery", {
    entityId: p.entityId,
    entitySlug: p.entitySlug,
    entityType: p.entityType,
    source: p.source ?? "encyclopedia",
    viewedAt: new Date().toISOString(),
  }); } catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  // Awaited: story unlocks gated on `entity_discovered` re-evaluate against
  // the server row, so callers must be able to know when it actually landed.
  try { await flushOutbox(uid); } catch { /* queued; retried later */ }
  return { acknowledged: false, queued: true };
}

/**
 * Record a sticky campaign completion. Thin wrapper around
 * `@/lib/campaigns/completions` so gameplay code has one recorder facade.
 */
export async function recordCampaignCompletion(p: {
  campaignId: string;
  campaignVersion?: number | null;
  source?: string;
}): Promise<SaveOutcome> {
  const { recordCampaignCompletion: impl } = await import("@/lib/campaigns/completions");
  return impl(p);
}

/**
 * Campaign intro watch record (Stage 4 mirror).
 *
 * Backup/restore only — the "should the intro play?" decision is taken
 * locally and synchronously before this is ever called, so this never
 * blocks campaign start. Guest: no-op.
 *
 * Stable idempotency key per (user, campaign, intro_version): a re-queue
 * overwrites rather than duplicating, and the RPC merge is monotonic
 * (completed > skipped > started, scene index never rewinds).
 */
export async function recordCampaignIntroWatch(p: {
  campaignId: string;
  introVersion: number;
  storyId?: string | null;
  status: "started" | "completed" | "skipped";
  lastSceneIndex?: number;
}): Promise<SaveOutcome> {
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, queued: false, reason: "unauthenticated" };
  const id = `campaign_intro:${uid}:${p.campaignId}:v${p.introVersion}`;
  try { await enqueueWithId(uid, id, "campaign_intro", {
    campaignId: p.campaignId,
    introVersion: p.introVersion,
    storyId: p.storyId ?? null,
    status: p.status,
    lastSceneIndex: Math.max(0, Math.trunc(p.lastSceneIndex ?? 0)),
  }); } catch { return { acknowledged: false, queued: false, reason: "storage_error" }; }
  void flushOutbox(uid).catch(() => {});
  return { acknowledged: false, queued: true };
}
