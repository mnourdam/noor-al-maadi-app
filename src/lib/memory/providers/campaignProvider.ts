// ============================================================
// Memory Engine — Campaign Provider
// ------------------------------------------------------------
// Reads the owner's completed campaign chapters and exposes every
// MCQ / true_false activity as a ReviewItem. Content is READ-ONLY —
// this provider never writes back to campaign progress.
// ============================================================

import type { Campaign, CampaignActivity } from "@/types/campaign";
import { listCampaigns } from "@/lib/campaignStorage";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type { ReviewItem } from "../types";
import { computeItemRevision, computeItemId } from "../bank";

function toReviewItem(
  campaign: Campaign,
  chapterId: string,
  activity: CampaignActivity,
): ReviewItem | null {
  if (activity.type === "multiple_choice"
    || (activity.type === "reading_then_question" && (activity.options?.length ?? 0) > 0)
  ) {
    const options = activity.options ?? [];
    if (options.length < 2) return null;
    const correct = typeof activity.correctAnswer === "number"
      ? activity.correctAnswer
      : Number(activity.correctAnswer);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
    const localRef = `chapter:${chapterId}#activity:${activity.id}`;
    const id = computeItemId("campaign", campaign.id, localRef);
    return {
      id,
      sourceType: "campaign",
      sourceId: campaign.id,
      sourceLabel: campaign.title,
      localRef,
      kind: "mcq",
      prompt: activity.prompt,
      options,
      correctAnswer: correct,
      originalXp: activity.xpReward ?? 10,
      era: campaign.historicalPeriod,
      tags: campaign.tags ?? [],
      revision: computeItemRevision("mcq", correct, options),
    };
  }

  if (activity.type === "true_false") {
    const canonical = activity.correctAnswer;
    if (typeof canonical !== "boolean") return null;
    const localRef = `chapter:${chapterId}#activity:${activity.id}`;
    const id = computeItemId("campaign", campaign.id, localRef);
    return {
      id,
      sourceType: "campaign",
      sourceId: campaign.id,
      sourceLabel: campaign.title,
      localRef,
      kind: "true_false",
      prompt: activity.prompt,
      correctAnswer: canonical,
      originalXp: activity.xpReward ?? 10,
      era: campaign.historicalPeriod,
      tags: campaign.tags ?? [],
      revision: computeItemRevision("true_false", canonical),
    };
  }

  return null;
}

export function listCampaignReviewItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  const campaigns = listCampaigns();
  for (const campaign of campaigns) {
    const progress = getCampaignProgress(campaign.id);
    for (const chapter of campaign.chapters) {
      const chProg = progress.chapters[chapter.id];
      if (!chProg?.completed) continue;
      for (const activity of chapter.activities) {
        if (!chProg.completedActivityIds.includes(activity.id)) continue;
        const item = toReviewItem(campaign, chapter.id, activity);
        if (item) out.push(item);
      }
    }
  }
  return out;
}

export const campaignProvider = {
  name: "campaign",
  listItems: listCampaignReviewItems,
};
