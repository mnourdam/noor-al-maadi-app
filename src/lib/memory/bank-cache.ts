// ============================================================
// Memory Engine — Harvested bank cache
// ------------------------------------------------------------
// ROOT CAUSE (2026-07): `campaignProvider` built the review bank from
// `campaignStorage.listCampaigns()`, i.e. the localStorage key
// `irth_admin_campaigns`. That key is only ever populated on ADMIN
// devices (cloudSync pulls it for the campaign editor). Real players
// load campaigns from the published Supabase snapshot through
// `fetchPublishedCampaigns()` / `fetchCampaignByIdOrSlug()`, so the
// bank was always EMPTY ⇒ `pickForChapter()` returned null ⇒ every
// plan was frozen with `reviewItemId: null` ⇒ no review question ever
// appeared, no matter how many campaigns were completed.
//
// This module fixes that by maintaining an owner-partitioned cache of
// harvested ReviewItems built from the SAME campaign source the player
// actually plays (published snapshot) crossed with the local progress
// ledger. The cache is written asynchronously and read synchronously
// by the provider (providers must stay sync).
//
// Read-only with respect to campaigns and progress: nothing here
// mutates campaign JSON, progress, hearts, XP, or the plan.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import { toReviewItem } from "./providers/campaignReviewItem";
import type { ReviewItem } from "./types";

const CACHE_KEY = "irth.memory.bank.v1";

interface BankCacheFile {
  version: 1;
  updatedAt: string;
  items: ReviewItem[];
}

export function readBankCache(): ReviewItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const file = JSON.parse(raw) as BankCacheFile;
    return Array.isArray(file?.items) ? file.items : [];
  } catch { return []; }
}

function writeBankCache(items: ReviewItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const file: BankCacheFile = { version: 1, updatedAt: new Date().toISOString(), items };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(file));
  } catch { /* quota / private mode — bank simply stays as-is */ }
}

/**
 * Harvest every reviewable activity from COMPLETED chapters of the
 * given campaigns. Pure: no writes.
 */
export function harvestReviewItems(campaigns: Campaign[]): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const campaign of campaigns) {
    if (!campaign?.id || !Array.isArray(campaign.chapters)) continue;
    const progress = getCampaignProgress(campaign.id);
    for (const chapter of campaign.chapters) {
      const chProg = progress.chapters?.[chapter.id];
      if (!chProg?.completed) continue;
      for (const activity of chapter.activities ?? []) {
        if (!chProg.completedActivityIds?.includes(activity.id)) continue;
        const item = toReviewItem(campaign, chapter.id, activity);
        if (item) out.push(item);
      }
    }
  }
  return out;
}

/** Merge harvested items into the cache (by id, latest wins). */
export function mergeIntoBankCache(items: ReviewItem[]): number {
  if (!items.length) return readBankCache().length;
  const byId = new Map<string, ReviewItem>();
  for (const it of readBankCache()) byId.set(it.id, it);
  for (const it of items) byId.set(it.id, it);
  const merged = [...byId.values()];
  writeBankCache(merged);
  return merged.length;
}

/**
 * Full refresh from the published campaign catalogue (local-first,
 * works offline through the snapshot). Safe to call on route mount —
 * it is idempotent and never throws.
 */
export async function refreshMemoryBank(): Promise<number> {
  try {
    const { fetchPublishedCampaigns } = await import("@/lib/supabaseCampaigns");
    const campaigns = await fetchPublishedCampaigns();
    return mergeIntoBankCache(harvestReviewItems(campaigns));
  } catch {
    return readBankCache().length;
  }
}

/** Immediate harvest for a single already-loaded campaign. */
export function harvestCampaignIntoBank(campaign: Campaign | null | undefined): void {
  if (!campaign) return;
  try { mergeIntoBankCache(harvestReviewItems([campaign])); }
  catch { /* never break gameplay */ }
}

export const MEMORY_BANK_CACHE_KEY = CACHE_KEY;
