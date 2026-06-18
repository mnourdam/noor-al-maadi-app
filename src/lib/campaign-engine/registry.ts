import type {
  CampaignDefinition, ChapterDefinition, CampaignProgress,
} from "./types";
import { chapterCompletionKey, campaignCompletionKey } from "./types";
import type { ProfileState } from "../profile";
import { SALAHUDDIN_LIBERATOR_CAMPAIGN } from "./campaigns/salahuddin-liberator";

// ============================================================
// Campaign Engine — Registry
// ------------------------------------------------------------
// Future campaigns (Khalid ibn al-Walid, Umar ibn al-Khattab,
// Andalusia, Nur al-Din, the Ottomans, Fall of Baghdad, Mehmed
// the Conqueror…) plug in by exporting a CampaignDefinition
// and adding it to ENGINE_CAMPAIGNS below. No UI changes needed.
// ============================================================

export const ENGINE_CAMPAIGNS: CampaignDefinition[] = [
  SALAHUDDIN_LIBERATOR_CAMPAIGN,
].sort((a, b) => a.order - b.order);

const BY_ID = new Map<string, CampaignDefinition>(
  ENGINE_CAMPAIGNS.map(c => [c.id, c]),
);

export function getEngineCampaign(id: string): CampaignDefinition | undefined {
  return BY_ID.get(id);
}

export function listEngineCampaigns(): CampaignDefinition[] {
  return ENGINE_CAMPAIGNS;
}

/** Compute progress for a campaign against a ProfileState snapshot. */
export function campaignProgressFor(
  campaign: CampaignDefinition,
  profile: Pick<ProfileState, "missionsCompleted" | "campaignsCompleted">,
): CampaignProgress {
  const chapters = campaign.chapters.map(ch => {
    const completed = profile.missionsCompleted.includes(
      chapterCompletionKey(campaign.id, ch.id),
    );
    return { chapterId: ch.id, completed, percent: completed ? 100 : 0 };
  });
  const completedChapters = chapters.filter(c => c.completed).length;
  const total = chapters.length;
  return {
    campaignId: campaign.id,
    completedChapters,
    totalChapters: total,
    percent: total ? Math.round((completedChapters / total) * 100) : 0,
    completed: profile.campaignsCompleted.includes(campaignCompletionKey(campaign.id)),
    chapters,
  };
}

/** True when the chapter at `index` is unlocked given current progress. */
export function isChapterUnlocked(
  campaign: CampaignDefinition,
  chapter: ChapterDefinition,
  profile: Pick<ProfileState, "missionsCompleted">,
): boolean {
  if (chapter.index <= 1) return true;
  const prev = campaign.chapters.find(c => c.index === chapter.index - 1);
  if (!prev) return true;
  return profile.missionsCompleted.includes(
    chapterCompletionKey(campaign.id, prev.id),
  );
}

export { chapterCompletionKey, campaignCompletionKey };