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
 */
export interface LegacyAchProgress {
  id: string;
  current: number;
  earned: boolean;
}
export function useAchievementLegacyEvals(): LegacyAchProgress[] {
  const views = useAchievementViews();
  return useMemo(
    () =>
      views.map((v) => {
        const def = registry.byId.get(v.id);
        // Map 0..1 progress back to an absolute count against the legacy
        // goal so existing UI progress-bars keep the same visual meaning.
        // `def.progress` is 0..1; we approximate current by inverting the
        // ratio against a synthetic goal of 1 (already unlocked) or use
        // the fact that legacy UI cares about (current/goal) — v.progress
        // is exactly (current/goal).
        void def;
        return { id: v.id, current: v.progress, earned: v.state === "unlocked" || v.state === "claimed" };
      }),
    [views],
  );
}
