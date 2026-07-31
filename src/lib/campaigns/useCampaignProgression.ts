// ============================================================
// Campaign Progression — React data plumbing
// ------------------------------------------------------------
// Feeds `computeFeedLockMap` from the existing sources of truth:
//   - completions: local sticky ∪ profile ∪ server ledger
//   - stories:     profile.storiesRead
//   - achievements: Achievement Engine v2 views
//   - level:       levelFor(profile.points)
// No new storage, no new tables.
// ============================================================

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useProfile } from "@/lib/profile";
import { levelFor } from "@/lib/progression";
import { localCompletedIds, unionCompletedIds } from "@/lib/campaigns/completions";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import {
  computeFeedLockMap,
  OPEN_STATUS,
  type CampaignLike,
  type CampaignLockStatus,
  type ProgressionState,
} from "@/lib/campaigns/progression";

export function useProgressionState(): ProgressionState {
  const { profile } = useProfile();
  const achievements = useAchievementViews();

  const { data: serverCompleted } = useQuery({
    queryKey: ["campaign-completions", "union", profile.campaignsCompleted.length],
    queryFn: () => unionCompletedIds(profile.campaignsCompleted),
    staleTime: 30_000,
  });

  return useMemo(() => {
    const completed = new Set<string>(profile.campaignsCompleted);
    for (const id of localCompletedIds()) completed.add(id);
    for (const id of serverCompleted ?? []) completed.add(id);
    const unlockedAchievementIds = new Set<string>(
      achievements.filter((a) => a.unlockedAt).map((a) => a.id),
    );
    return {
      completedCampaignIds: completed,
      completedStoryIds: new Set<string>(profile.storiesRead),
      unlockedAchievementIds,
      level: levelFor(profile.points).level,
    };
  }, [profile.campaignsCompleted, profile.storiesRead, profile.points, serverCompleted, achievements]);
}

/** Group key priority: authored campaign section → divider section/id → era. */
function groupKeyFor(
  campaign: CampaignLike & { section_key?: unknown; era?: unknown },
  divider: { sectionKey?: string | null; id?: string; era?: string } | null | undefined,
  fallbackIndex: number,
): string {
  const own = asCampaignSectionKey((campaign as { section_key?: unknown }).section_key);
  if (own) return `section:${own}`;
  const fromDivider = asCampaignSectionKey(divider?.sectionKey);
  if (fromDivider) return `section:${fromDivider}`;
  const era = typeof campaign.era === "string" && campaign.era.trim() ? campaign.era.trim() : null;
  if (era) return `era:${era}`;
  if (divider?.id) return `divider:${divider.id}`;
  return `index:${fallbackIndex}`;
}

/** Lock map for the full campaigns feed (era groups in authored order). */
export function useCampaignLockMap(
  sections:
    | readonly {
        divider?: { sectionKey?: string | null; id?: string; era?: string } | null;
        campaigns: readonly CampaignLike[];
      }[]
    | undefined,
): Map<string, CampaignLockStatus> {
  const state = useProgressionState();
  return useMemo(() => {
    const entries: { campaign: CampaignLike; groupKey: string }[] = [];
    (sections ?? []).forEach((s, i) => {
      for (const c of s.campaigns ?? []) {
        entries.push({ campaign: c, groupKey: groupKeyFor(c as never, s.divider, i) });
      }
    });
    return computeLockMapByGroup(entries, state);
  }, [sections, state]);
}

/** Single-campaign lock status; needs the full feed for era ordering. */
export function useCampaignLockStatus(
  sections:
    | readonly {
        divider?: { sectionKey?: string | null; id?: string; era?: string } | null;
        campaigns: readonly CampaignLike[];
      }[]
    | undefined,
  campaignId: string | undefined,
): CampaignLockStatus {
  const map = useCampaignLockMap(sections);
  if (!campaignId) return OPEN_STATUS;
  return map.get(campaignId) ?? OPEN_STATUS;
}
