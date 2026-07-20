/**
 * Shared v2 selectors.
 *
 * Every player-facing surface (Home, Profile Overview, Profile Achievements,
 * notifications) MUST use these hooks. Never recompute "nearest" or "latest
 * unlocked" locally — that produces drift across screens.
 */

import { useMemo } from "react";
import { useAchievementViews } from "./driver";
import { isEarned } from "./presentation";
import type { AchievementView } from "./types";

export interface AchievementCompletion {
  earned: number;
  total: number;
  pct: number; // 0..100 integer
}

/** Global completion count + % across every visible (non-hidden) view. */
export function useAchievementCompletion(): AchievementCompletion {
  const views = useAchievementViews();
  return useMemo(() => {
    const total = views.length;
    const earned = views.filter(isEarned).length;
    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
    return { earned, total, pct };
  }, [views]);
}

/**
 * Closest-to-unlock, non-secret, non-earned view. Returns null when nothing
 * is currently in-progress.
 */
export function useNearestAchievement(): AchievementView | null {
  const views = useAchievementViews();
  return useMemo(() => {
    return (
      [...views]
        .filter((v) => !isEarned(v) && v.state !== "locked-secret" && v.state !== "locked-hidden")
        .filter((v) => v.progress > 0 && v.progress < 1)
        .sort((a, b) => b.progress - a.progress)[0] ?? null
    );
  }, [views]);
}

/** Most-recently unlocked view (by `unlockedAt`). */
export function useLatestUnlockedAchievement(): AchievementView | null {
  const views = useAchievementViews();
  return useMemo(() => {
    return (
      views
        .filter((v) => isEarned(v) && v.unlockedAt)
        .sort((a, b) => new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime())[0] ?? null
    );
  }, [views]);
}

/** Recently-unlocked list (descending), for compact rows. */
export function useRecentlyUnlockedAchievements(limit = 5): AchievementView[] {
  const views = useAchievementViews();
  return useMemo(() => {
    return views
      .filter((v) => isEarned(v) && v.unlockedAt)
      .sort((a, b) => new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime())
      .slice(0, limit);
  }, [views, limit]);
}
