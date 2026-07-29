// ============================================================
// Memory Engine — Campaign Provider
// ------------------------------------------------------------
// Exposes completed-campaign MCQ / true_false activities as
// ReviewItems. Content is READ-ONLY.
//
// Two sources are merged (by item id, cache wins):
//   1. `bank-cache` — harvested from the PUBLISHED campaign snapshot
//      the player actually plays. This is the real player path.
//   2. `campaignStorage.listCampaigns()` — the admin editor cache
//      (`irth_admin_campaigns`), kept so admin devices still work.
//
// Historical bug: only (2) existed, and it is empty for every normal
// player, so the review bank was always empty. See `bank-cache.ts`.
// ============================================================

import { listCampaigns } from "@/lib/campaignStorage";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type { ReviewItem } from "../types";
import { toReviewItem } from "./campaignReviewItem";
import { readBankCache } from "../bank-cache";

function listLegacyAdminCacheItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const campaign of listCampaigns()) {
    const progress = getCampaignProgress(campaign.id);
    for (const chapter of campaign.chapters ?? []) {
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

export function listCampaignReviewItems(): ReviewItem[] {
  const byId = new Map<string, ReviewItem>();
  for (const it of listLegacyAdminCacheItems()) byId.set(it.id, it);
  for (const it of readBankCache()) byId.set(it.id, it);
  return [...byId.values()];
}

export const campaignProvider = {
  name: "campaign",
  listItems: listCampaignReviewItems,
};
