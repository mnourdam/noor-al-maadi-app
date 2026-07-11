// ============================================================
// Progress Sync — Granular Supabase Mirror Writes
// ------------------------------------------------------------
// Additive layer on top of the existing cloud_saves JSON blob.
// Writes individual rows to user_campaign_progress and
// user_collection through the durable offline outbox so they
// survive cold starts, retries, and long offline sessions.
//
// All functions are no-ops when the user is signed out and
// never block gameplay.
// ============================================================

import { recordChapterProgress, recordCollectionAdd } from "@/lib/offline/record";

export interface ChapterProgressUpsert {
  campaignId: string;
  chapterId: string;
  status: "locked" | "unlocked" | "completed";
  score?: number;
  xpEarned?: number;
  coinsEarned?: number;
  completed?: boolean;
}

/** Enqueue one chapter row. Safe to call repeatedly. */
export async function upsertChapterProgress(p: ChapterProgressUpsert): Promise<void> {
  await recordChapterProgress(p);
}

export interface CollectionItemInsert {
  itemId: string;
  itemType: string;
  sourceCampaignId?: string;
  sourceChapterId?: string;
}

/** Enqueue one collection row. Server upsert is idempotent on (user_id,item_id). */
export async function addCollectionItem(i: CollectionItemInsert): Promise<void> {
  await recordCollectionAdd({
    itemId: i.itemId,
    itemType: i.itemType,
    sourceCampaignId: i.sourceCampaignId ?? null,
    sourceChapterId: i.sourceChapterId ?? null,
  });
}

/** Batch enqueue multiple collection items. */
export async function addCollectionItems(items: CollectionItemInsert[]): Promise<void> {
  for (const i of items) {
    await recordCollectionAdd({
      itemId: i.itemId,
      itemType: i.itemType,
      sourceCampaignId: i.sourceCampaignId ?? null,
      sourceChapterId: i.sourceChapterId ?? null,
    });
  }
}
