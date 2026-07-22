/**
 * React driver for Achievement Engine v2.
 *
 * Mounts once at the app root. Pulls values from canonical hooks and
 * pushes them into the engine via `pushCanonical(...)`. Also handles:
 *   - guest→account migration on sign-in
 *   - offline retry (piggy-backs on the engine's single-flight loop)
 *   - notification dispatch on newly-unlocked ids
 *   - union projection for campaign completions (profile blob ∪
 *     local sticky ledger ∪ server ledger) — never trust
 *     `profile.campaignsCompleted` alone; cloud save can overwrite it.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { levelFor } from "@/lib/progression";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchServerCompletedIds,
  localCompletedIds,
} from "@/lib/campaigns/completions";
import {
  getEvaluation,
  getPersisted,
  initAchievementEngine,
  establishAchievementLiveBaseline,
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
  const [serverCompletedIds, setServerCompletedIds] = useState<readonly string[]>([]);
  const [achievementSourcesSettled, setAchievementSourcesSettled] = useState(false);

  // Auth-driven mirror refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAchievementSourcesSettled(false);
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;
        if (cancelled) return;
        authUserIdRef.current = uid;
        if (uid && !migratedRef.current) {
          migratedRef.current = true;
          await migrateGuestUnlocks();
        }
        await refreshPersistedForUser(uid);
        // Non-blocking: pull server-side sticky campaign completions so
        // the union projection includes rows the local profile blob does
        // not know about (post-reinstall, post-conflict-resolution, etc).
        if (!cancelled && uid) {
          try {
            const ids = await fetchServerCompletedIds();
            if (!cancelled) setServerCompletedIds([...ids]);
          } catch { /* silent */ }
        }
        if (!cancelled) setAchievementSourcesSettled(true);
      } catch {
        await refreshPersistedForUser(null);
        if (!cancelled) setAchievementSourcesSettled(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setAchievementSourcesSettled(false);
        authUserIdRef.current = uid;
        if (event === "SIGNED_IN" && !migratedRef.current) {
          migratedRef.current = true;
          void migrateGuestUnlocks();
        }
        void refreshPersistedForUser(uid);
        if (event === "SIGNED_IN" && uid) {
          void fetchServerCompletedIds().then(ids => {
            if (!cancelled) setServerCompletedIds([...ids]);
          }).catch(() => { /* silent */ }).finally(() => {
            if (!cancelled) setAchievementSourcesSettled(true);
          });
        } else if (event === "SIGNED_OUT") {
          setServerCompletedIds([]);
          setAchievementSourcesSettled(true);
        } else {
          setAchievementSourcesSettled(true);
        }
      }
    });
    // Refresh the server-side completions cache whenever the outbox flushes
    // or a new completion is recorded locally.
    const onChange = () => {
      const uid = authUserIdRef.current;
      if (!uid) return;
      void fetchServerCompletedIds().then(ids => {
        if (!cancelled) setServerCompletedIds([...ids]);
      }).catch(() => { /* silent */ });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("irth:campaign-completions:changed", onChange);
      window.addEventListener("irth:outbox:flushed", onChange);
    }
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("irth:campaign-completions:changed", onChange);
        window.removeEventListener("irth:outbox:flushed", onChange);
      }
    };
  }, []);

  // Union projection for campaign completions:
  //   profile.campaignsCompleted  (legacy blob — may be stomped by cloud sync)
  //   ∪  localCompletedIds()      (local sticky ledger)
  //   ∪  serverCompletedIds       (server-authoritative ledger)
  const unionedCampaigns = useMemo(() => {
    const out = new Set<string>();
    for (const id of profile.campaignsCompleted ?? []) if (id) out.add(id);
    for (const id of localCompletedIds()) out.add(id);
    for (const id of serverCompletedIds) out.add(id);
    return [...out];
  }, [profile.campaignsCompleted, serverCompletedIds]);

  // Canonical inputs → engine.
  useEffect(() => {
    const lvl = levelFor(profile.points).level;
    pushCanonical({
      campaigns: { completedIds: unionedCampaigns },
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
    unionedCampaigns,
    profile.points,
    profile.dinars,
    profile.streak,
    profile.titlesEarned,
    canonicalInv.count,
  ]);

  // Silent baseline gate: live achievement notifications are enabled only
  // after the auth mirror and initial canonical completion sources settle.
  useEffect(() => {
    if (!achievementSourcesSettled) return;
    void establishAchievementLiveBaseline();
  }, [achievementSourcesSettled, unionedCampaigns, canonicalInv.count, profile.points, profile.dinars, profile.streak]);

  return null;
}

/**
 * Snapshot hook — subscribes to engine ticks and yields the current
 * `AchievementView[]`. This is the sole read API for every UI surface
 * (home, profile, achievements page, notifications). The legacy
 * `useAchievementLegacyEvals` bridge was deleted in Slice 4.
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

