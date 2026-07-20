/**
 * React driver for Achievement Engine v2.
 *
 * Mounts once at the app root. Pulls values from canonical hooks and
 * pushes them into the engine via `pushCanonical(...)`. Also handles:
 *   - guest→account migration on sign-in
 *   - offline retry (piggy-backs on the engine's single-flight loop)
 *   - notification dispatch on newly-unlocked ids
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { levelFor } from "@/lib/progression";
import { supabase } from "@/integrations/supabase/client";
import {
  getEvaluation,
  getPersisted,
  initAchievementEngine,
  migrateGuestUnlocks,
  onEngineTick,
  pushCanonical,
  refreshPersistedForUser,
} from "./engine";
import { buildViews } from "./viewModel";
import { registry } from "./index";
import type { AchievementView } from "./types";

let inited = false;
function ensureInit() {
  if (inited) return;
  inited = true;
  initAchievementEngine();
}

/**
 * Boot component: mount once inside the root layout, next to
 * `<ProfileProvider>`. Never renders anything.
 */
export function AchievementEngineBoot() {
  ensureInit();
  const { profile } = useProfile();
  const canonicalInv = useCanonicalInvestigationProgress();
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const migratedRef = useRef(false);

  // Auth-driven mirror refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;
        if (cancelled) return;
        authUserIdRef.current = uid;
        if (uid && !migratedRef.current) {
          migratedRef.current = true;
          await migrateGuestUnlocks();
        }
        await refreshPersistedForUser(uid);
      } catch {
        await refreshPersistedForUser(null);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        authUserIdRef.current = uid;
        if (event === "SIGNED_IN" && !migratedRef.current) {
          migratedRef.current = true;
          void migrateGuestUnlocks();
        }
        void refreshPersistedForUser(uid);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Canonical inputs → engine.
  useEffect(() => {
    const lvl = levelFor(profile.points).level;
    pushCanonical({
      campaigns: { completedIds: profile.campaignsCompleted ?? [] },
      investigations: { completedIds: [...canonicalInv.completedIds] },
      xp: profile.points ?? 0,
      level: lvl,
      dinars: {
        current: profile.dinars ?? 0,
        // No canonical lifetime ledger; use current as lower-bound.
        lifetimeEarned: profile.dinars ?? 0,
      },
      streak: { current: profile.streak ?? 0, longest: profile.streak ?? 0 },
      titles: { earnedCount: (profile.titlesEarned ?? []).length },
    });
  }, [
    profile.campaignsCompleted,
    profile.points,
    profile.dinars,
    profile.streak,
    profile.titlesEarned,
    canonicalInv.count,
  ]);

  return null;
}

/**
 * Snapshot hook — subscribes to engine ticks and yields the current
 * `AchievementView[]`. Consumed by every UI surface.
 */
export function useAchievementViews(): AchievementView[] {
  const subscribe = (cb: () => void) => onEngineTick(cb);
  const version = useSyncExternalStore(
    subscribe,
    () => getEvaluation().snapshotVersion,
    () => 0,
  );
  return useMemo(() => {
    // `version` is intentionally read to keep memo cache invalidation aligned.
    void version;
    return buildViews({
      registry,
      evaluation: getEvaluation(),
      persisted: getPersisted(),
    });
  }, [version]);
}

/**
 * Compat hook — mirrors the legacy `AchievementProgress[]` shape used by
 * profile.tsx and index.tsx, but sourced entirely from v2. This is a
 * read-only bridge; nothing writes through the legacy path anymore.
 *
 * For FLAGGED legacy achievements not represented in v2, we still return
 * a row (earned=false, current=0) so legacy UIs iterating `ACHIEVEMENTS`
 * always find a match. If the player already has an `achievementsEarned`
 * timestamp for the flagged id, we preserve it as `earned=true` (read-only).
 */
export interface LegacyAchProgress {
  id: string;
  current: number;
  earned: boolean;
}

export function useAchievementLegacyEvals(
  legacyEarnedMap?: Readonly<Record<string, number>>,
): LegacyAchProgress[] {
  const views = useAchievementViews();
  return useMemo(() => {
    // Lazy import to avoid a cycle with app-constants.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ACHIEVEMENTS } = require("@/lib/app-constants") as {
      ACHIEVEMENTS: readonly { id: string; goal: number }[];
    };
    const viewById = new Map(views.map((v) => [v.id, v]));
    return ACHIEVEMENTS.map((a) => {
      const v = viewById.get(a.id);
      if (v) {
        return {
          id: a.id,
          current: Math.round(v.progress * a.goal),
          earned: v.state === "unlocked" || v.state === "claimed",
        };
      }
      // FLAGGED legacy id: preserve historical earned state read-only.
      const earnedAt = legacyEarnedMap?.[a.id] ?? 0;
      return {
        id: a.id,
        current: earnedAt > 0 ? a.goal : 0,
        earned: earnedAt > 0,
      };
    });
  }, [views, legacyEarnedMap]);
}

