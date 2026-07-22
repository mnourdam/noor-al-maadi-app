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
import { flushOutbox } from "./flush";

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

async function record(kind: OutboxKind, payload: Record<string, unknown>): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return; // guest — nothing to sync
  await enqueue(uid, kind, payload);
  // Fire-and-forget flush; safe if offline (early-returns).
  void flushOutbox(uid);
}

export async function recordCollectionAdd(p: {
  itemId: string; itemType: string;
  sourceCampaignId?: string | null; sourceChapterId?: string | null;
}): Promise<void> {
  await record("collection_add", p);
}

export async function recordGameComplete(p: {
  gameId: string; stageIndex: number; score: number;
}): Promise<void> {
  await record("game_complete", p);
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
}): Promise<{ acknowledged: boolean; reason?: string }> {
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, reason: "unauthenticated" };
  const outboxId = `chapter_progress:${uid}:${p.campaignId}:${p.chapterId}`;
  await enqueueWithId(uid, outboxId, "chapter_progress", p);
  // Immediate awaited acknowledgement when online.
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc(
        "record_campaign_progress_v2" as any,
        {
          p_campaign_id: p.campaignId,
          p_chapter_id: p.chapterId,
          p_completed: !!p.completed,
          p_score: p.score ?? null,
          p_xp_earned: p.xpEarned ?? null,
          p_coins_earned: p.coinsEarned ?? null,
        },
      );
      if (!error) {
        const payload = (data ?? {}) as { ok?: boolean; reason?: string };
        if (payload.ok) {
          try {
            const { remove } = await import("./outbox");
            await remove(outboxId);
          } catch { /* leave queued */ }
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("irth:campaign-progress:changed"));
              window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
            }
          } catch { /* ignore */ }
          return { acknowledged: true };
        }
        // Permanent rejection — surface via flush → dead-letter.
        void flushOutbox(uid);
        return { acknowledged: false, reason: payload.reason ?? "rpc-not-ok" };
      }
    } catch { /* fall through to queued flush */ }
  }
  void flushOutbox(uid);
  return { acknowledged: false, reason: "queued" };
}

export async function recordProfileDelta(p: {
  xp?: number; dinars?: number; hearts?: number; source?: string;
}): Promise<void> {
  await record("profile_delta", p);
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
}): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const id = `entity_discovery:${uid}:${p.entityId}`;
  await enqueueWithId(uid, id, "entity_discovery", {
    entityId: p.entityId,
    entitySlug: p.entitySlug,
    entityType: p.entityType,
    source: p.source ?? "encyclopedia",
    viewedAt: new Date().toISOString(),
  });
  void flushOutbox(uid);
}

/**
 * Record a sticky campaign completion. Thin wrapper around
 * `@/lib/campaigns/completions` so gameplay code has one recorder facade.
 */
export async function recordCampaignCompletion(p: {
  campaignId: string;
  campaignVersion?: number | null;
  source?: string;
}): Promise<void> {
  const { recordCampaignCompletion: impl } = await import("@/lib/campaigns/completions");
  await impl(p);
}
