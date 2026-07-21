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

export async function recordChapterProgress(p: {
  campaignId: string; chapterId: string;
  status: "locked" | "unlocked" | "completed";
  score?: number; xpEarned?: number; coinsEarned?: number;
  completed?: boolean;
}): Promise<void> {
  await record("chapter_progress", p);
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
