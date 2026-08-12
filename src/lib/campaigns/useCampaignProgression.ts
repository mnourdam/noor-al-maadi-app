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
  const { profile, hydrated: profileHydrated } = useProfile();
  const achievements = useAchievementViews();

  // Unified tick to trigger re-renders on custom completion/progress events.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("irth:campaign-completions:changed", handler);
    window.addEventListener("irth:campaign-progress:changed", handler);
    window.addEventListener("irth:identity-changed", handler);
    return () => {
      window.removeEventListener("irth:campaign-completions:changed", handler);
      window.removeEventListener("irth:campaign-progress:changed", handler);
      window.removeEventListener("irth:identity-changed", handler);
    };
  }, []);

  const { data: serverCompleted, isLoading: serverLoading } = useQuery({
    queryKey: ["campaign-completions", "union", profile.campaignsCompleted.length, tick, profileHydrated],
    queryFn: () => unionCompletedIds(profile.campaignsCompleted),
    staleTime: 5_000, 
    gcTime: 60_000,
  });

  return useMemo(() => {
    // If the server ledger is still loading and we have no local evidence,
    // we return an empty but "pending" state.
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
      hydrated: profileHydrated && !serverLoading,
    };
  }, [profile.campaignsCompleted, profile.storiesRead, profile.points, serverCompleted, achievements, tick, profileHydrated, serverLoading]);
}

type DividerLike = {
  rawSectionKey?: string | null;
  sectionKey?: string | null;
  id?: string;
  era?: string;
} | null;

/**
 * Performance layer: In-memory cache for the computed lock map.
 * This prevents re-computing the full feed map (200+ campaigns)
 * on every single Campaign Route mount when the inputs are identical.
 */
interface LockMapCache {
  sections: any;
  state: ProgressionState;
  result: Map<string, CampaignLockStatus>;
}
let globalLockMapCache: LockMapCache | null = null;

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
    // 1. Check if the sections identity and state have changed.
    // ProgressionState is carefully constructed with useMemo in useProgressionState,
    // and its dependencies include the 'tick' which handles completion events.
    if (
      globalLockMapCache &&
      globalLockMapCache.sections === sections &&
      globalLockMapCache.state === state
    ) {
      return globalLockMapCache.result;
    }

    // 2. Compute the entries for the lock map calculation.
    const entries: { campaign: CampaignLike; groupKey: string }[] = [];
    (sections ?? []).forEach((s, i) => {
      for (const c of s.campaigns ?? []) {
        entries.push({ campaign: c, groupKey: deriveCampaignGroupKey(c, s.divider ?? null, i) });
      }
    });

    // 3. Perform the calculation.
    const result = computeLockMapByGroup(entries, state);

    // 4. Update the singleton cache for the next caller.
    globalLockMapCache = { sections, state, result };

    return result;
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

