import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile";
import { ACHIEVEMENTS, evaluateAchievements } from "@/lib/app-constants";

/**
 * Watches profile state and shows a toast when a new achievement is unlocked.
 * Persists the earned timestamp on `profile.achievementsEarned` so notifications
 * fire only once per achievement, and the Achievements page can show "latest 5".
 *
 * Mounted once near the root, inside ProfileProvider.
 */
export function AchievementWatcher() {
  const { profile, markAchievementEarned } = useProfile();
  const firstRun = useRef(true);

  useEffect(() => {
    const evals = evaluateAchievements(profile);
    const earnedMap = profile.achievementsEarned ?? {};

    for (const e of evals) {
      if (!e.earned) continue;
      if (earnedMap[e.id]) continue;
      const def = ACHIEVEMENTS.find((a) => a.id === e.id);
      if (!def) continue;
      const isNew = markAchievementEarned(e.id);
      // On the very first render after hydration, silently backfill timestamps
      // for already-earned achievements so we don't spam toasts on app open.
      if (isNew && !firstRun.current) {
        toast.success(`إنجاز جديد: ${def.name}`, {
          description: def.desc,
          icon: def.icon,
          duration: 6000,
        });
      }
    }
    firstRun.current = false;
    // We intentionally depend on the whole profile so any state change re-checks.
  }, [profile, markAchievementEarned]);

  return null;
}
