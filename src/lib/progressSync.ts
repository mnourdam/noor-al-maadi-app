// ============================================================
// Progress Sync — Granular Supabase Mirror Writes
// ------------------------------------------------------------
// Additive layer on top of the existing cloud_saves JSON blob.
// Writes individual rows to user_campaign_progress and
// user_collection so we can later query per-chapter/per-item
// data server-side (leaderboards, friends' unlocks, analytics).
//
// All functions are no-ops when the user is signed out, swallow
// errors silently, and never block gameplay.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface ChapterProgressUpsert {
  campaignId: string;
  chapterId: string;
  status: "locked" | "unlocked" | "completed";
  score?: number;
  xpEarned?: number;
  coinsEarned?: number;
  completed?: boolean;
}

/** Upsert one chapter row. Safe to call repeatedly. */
export async function upsertChapterProgress(p: ChapterProgressUpsert): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await supabase.from("user_campaign_progress").upsert(
      {
        user_id: uid,
        campaign_id: p.campaignId,
        chapter_id: p.chapterId,
        status: p.status,
        score: p.score ?? 0,
        xp_earned: p.xpEarned ?? 0,
        coins_earned: p.coinsEarned ?? 0,
        completed_at: p.completed ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,campaign_id,chapter_id" },
    );
  } catch {
    /* offline / guest — ignore */
  }
}

export interface CollectionItemInsert {
  itemId: string;
  itemType: string;
  sourceCampaignId?: string;
  sourceChapterId?: string;
}

/** Insert one collection row. UNIQUE(user_id,item_id) makes it idempotent. */
export async function addCollectionItem(i: CollectionItemInsert): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await supabase.from("user_collection").upsert(
      {
        user_id: uid,
        item_id: i.itemId,
        item_type: i.itemType,
        source_campaign_id: i.sourceCampaignId ?? null,
        source_chapter_id: i.sourceChapterId ?? null,
      },
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
  } catch {
    /* ignore */
  }
}

/** Batch insert multiple collection items. */
export async function addCollectionItems(items: CollectionItemInsert[]): Promise<void> {
  if (!items.length) return;
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await supabase.from("user_collection").upsert(
      items.map((i) => ({
        user_id: uid,
        item_id: i.itemId,
        item_type: i.itemType,
        source_campaign_id: i.sourceCampaignId ?? null,
        source_chapter_id: i.sourceChapterId ?? null,
      })),
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
  } catch {
    /* ignore */
  }
}
