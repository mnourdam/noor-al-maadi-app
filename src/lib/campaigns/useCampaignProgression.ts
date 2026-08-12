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

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { useProfile } from "@/lib/profile";
import { levelFor } from "@/lib/progression";
import { localCompletedIds, unionCompletedIds } from "@/lib/campaigns/completions";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import {
  computeLockMapByGroup,
  deriveCampaignGroupKey,
  OPEN_STATUS,
  type CampaignLike,
  type CampaignLockStatus,
  type ProgressionState,
} from "@/lib/campaigns/progression";

export function useProgressionState(): ProgressionState {
  const { profile } = useProfile();
  const achievements = useAchievementViews();

  // Unified tick to trigger re-renders on custom completion/progress events.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("irth:campaign-completions:changed", handler);
    window.addEventListener("irth:campaign-progress:changed", handler);
    return () => {
      window.removeEventListener("irth:campaign-completions:changed", handler);
      window.removeEventListener("irth:campaign-progress:changed", handler);
    };
  }, []);

  const { data: serverCompleted } = useQuery({
    queryKey: ["campaign-completions", "union", profile.campaignsCompleted.length, tick],
    queryFn: () => unionCompletedIds(profile.campaignsCompleted),
    staleTime: 5_000, // Faster reactivity for unlock logic (canonical projection)
    gcTime: 60_000,
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
  }, [profile.campaignsCompleted, profile.storiesRead, profile.points, serverCompleted, achievements, tick]);
}

type DividerLike = {
  rawSectionKey?: string | null;
  sectionKey?: string | null;
  id?: string;
  era?: string;
} | null;

/** Lock map for the full campaigns feed (era groups in authored order). */
export function useCampaignLockMap(
  sections:
    | readonly {
        divider?: DividerLike;
        campaigns: readonly CampaignLike[];
      }[]
    | undefined,
): Map<string, CampaignLockStatus> {
  const state = useProgressionState();
  return useMemo(() => {
    const entries: { campaign: CampaignLike; groupKey: string }[] = [];
    (sections ?? []).forEach((s, i) => {
      for (const c of s.campaigns ?? []) {
        entries.push({ campaign: c, groupKey: deriveCampaignGroupKey(c, s.divider ?? null, i) });
      }
    });
    return computeLockMapByGroup(entries, state);
  }, [sections, state]);
}

/** Single-campaign lock status; needs the full feed for era ordering. */
export function useCampaignLockStatus(
  sections:
    | readonly {
        divider?: DividerLike;
        campaigns: readonly CampaignLike[];
      }[]
    | undefined,
  campaignId: string | undefined,
): CampaignLockStatus {
  const map = useCampaignLockMap(sections);
  if (!campaignId) return OPEN_STATUS;
  return map.get(campaignId) ?? OPEN_STATUS;
}
