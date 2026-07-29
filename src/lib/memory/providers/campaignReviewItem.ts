// ============================================================
// Memory Engine — Campaign → ReviewItem mapping (shared)
// ------------------------------------------------------------
// Extracted so BOTH the legacy admin-cache provider and the
// harvested bank cache (player path) produce byte-identical items,
// including the stable `id` and correctness `revision`.
//
// SUPPORTED REVIEW KINDS (must match ReviewActivity renderer exactly):
//   - "mcq"        (multiple_choice + reading_then_question w/ options)
//   - "true_false"
// Never add a kind here before the renderer supports it.
// ============================================================

import type { Campaign, CampaignActivity } from "@/types/campaign";
import type { ReviewItem } from "../types";
import { computeItemRevision, computeItemId } from "../bank";

export function toReviewItem(
  campaign: Campaign,
  chapterId: string,
  activity: CampaignActivity,
): ReviewItem | null {
  if (!activity?.id) return null;

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
    return {
      id: computeItemId("campaign", campaign.id, localRef),
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
    return {
      id: computeItemId("campaign", campaign.id, localRef),
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
