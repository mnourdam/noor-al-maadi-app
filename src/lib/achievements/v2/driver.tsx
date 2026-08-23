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
import { getActiveOwner, getActiveUserId, getIdentityEpoch, getDeviceId } from "@/lib/identity/owner";
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
  const { profile, hydrated, userId } = useProfile();
  const canonicalInv = useCanonicalInvestigationProgress();
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const migratedRef = useRef(false);
  const [serverResult, setServerResult] = useState<{ userId: string | null; ids: readonly string[] }>({ userId: null, ids: [] });
  const [achievementSourcesSettled, setAchievementSourcesSettled] = useState(false);

  // V13 Transition Barrier: Capture current identity epoch to invalidate stale pushes.
  const identityEpoch = getIdentityEpoch();

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
            const res = await fetchServerCompletedIds();
            if (!cancelled) setServerResult({ userId: res.userId, ids: [...res.ids] });
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
          void fetchServerCompletedIds().then(res => {
            if (!cancelled) setServerResult({ userId: res.userId, ids: [...res.ids] });
          }).catch(() => { /* silent */ }).finally(() => {
            if (!cancelled) setAchievementSourcesSettled(true);
          });
        } else if (event === "SIGNED_OUT") {
          setServerResult({ userId: null, ids: [] });
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
      void fetchServerCompletedIds().then(res => {
        if (!cancelled) setServerResult({ userId: res.userId, ids: [...res.ids] });
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
    const currentEpoch = getIdentityEpoch();
    const activeOwner = getActiveOwner();
    const activeUserId = getActiveUserId();
    const intendedOwner = userId ? `user:${userId}` : `guest:${getDeviceId()}`;

    // V13 Safety Guard: If not hydrated or identity changed, return empty to prevent stale union.
    if (!hydrated || identityEpoch !== currentEpoch || userId !== activeUserId || intendedOwner !== activeOwner) {
      return [];
    }
    
    const profileSource = profile.campaignsCompleted ?? [];
    const localSource = Array.from(localCompletedIds());
    
    // V13 SOURCE-LEVEL FIX: Validate ownership of server results before unioning.
    const rawServerCount = serverResult.ids.length;
    let acceptedServerCount = 0;
    let rejectedReason = "";

    if (!userId) {
      rejectedReason = "guest_mode";
    } else if (serverResult.userId !== userId) {
      rejectedReason = "userId_mismatch";
    } else if (intendedOwner !== activeOwner) {
      rejectedReason = "owner_mismatch";
    } else {
      acceptedServerCount = rawServerCount;
    }

    const serverSource = acceptedServerCount > 0 ? serverResult.ids : [];

    // V13 Diagnostic: Log server completion source evaluation
    import("@/lib/diag-trace").then(m => {
      m.recordTrace("logout-audit", "ACHIEVEMENT_SERVER_COMPLETION_SOURCE", JSON.stringify({
        activeOwner,
        currentUserId: userId,
        resultOwnerUserId: serverResult.userId,
        rawServerCount,
        acceptedServerCount,
        rejectedReason
      }));
    }).catch(() => {});

    const out = new Set<string>();
    for (const id of profileSource) if (id) out.add(id);
    for (const id of localSource) out.add(id);
    for (const id of serverSource) out.add(id);

    // V13 Diagnostic Trace: Log every constituent before push
    import("@/lib/diag-trace").then(m => {
      m.recordTrace("logout-audit", "ACHIEVEMENT_CANONICAL_INPUT_SOURCES", JSON.stringify({
        owner: intendedOwner,
        activeOwner,
        profileCount: profileSource.length,
        localCount: localSource.length,
        serverCount: serverSource.length,
        totalUnion: out.size,
        identityMatch: userId === activeUserId
      }));
    }).catch(() => {});

    return [...out];
  }, [profile.campaignsCompleted, serverResult, hydrated, identityEpoch, userId]);



  // Canonical inputs → engine.
  useEffect(() => {
    if (!hydrated) return;
    
    const currentEpoch = getIdentityEpoch();
    const activeOwner = getActiveOwner();
    const activeUserId = getActiveUserId();
    const intendedOwner = userId ? `user:${userId}` : `guest:${getDeviceId()}`;

    // V13 TRANSITION BARRIER
    // 1. Epoch mismatch: identity changed while this render was queued.
    // 2. userId mismatch: Hook userId (from closure) doesn't match current global auth state.
    // 3. intendedOwner mismatch: Physical owner doesn't match logical owner.
    let blockReason = "";
    if (identityEpoch !== currentEpoch) blockReason = "epoch_mismatch";
    else if (userId !== activeUserId) blockReason = "userId_mismatch";
    else if (intendedOwner !== activeOwner) blockReason = "owner_mismatch";

    if (blockReason) {
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "ACHIEVEMENT_CANONICAL_PUSH_BLOCKED", JSON.stringify({
          reason: blockReason,
          intendedOwner,
          activeOwner,
          capturedEpoch: identityEpoch,
          currentEpoch,
          totalCompleted: unionedCampaigns.length,
          hookUserId: userId,
          globalUserId: activeUserId
        }));
      }).catch(() => {});
      return;
    }

    const lvl = levelFor(profile.points).level;
    pushCanonical({
      campaigns: { completedIds: unionedCampaigns },
      investigations: { completedIds: [...canonicalInv.completedIds] },
      xp: profile.points ?? 0,
      level: lvl,
      dinars: {
        current: profile.dinars ?? 0,
        lifetimeEarned: profile.dinars ?? 0,
      },
      streak: { current: profile.streak ?? 0, longest: Math.max(profile.longestStreak ?? 0, profile.streak ?? 0) },
      titles: { earnedCount: (profile.titlesEarned ?? []).length },
      profile: { userId }
    });
  }, [
    unionedCampaigns,
    profile.points,
    profile.dinars,
    profile.streak,
    profile.longestStreak,
    profile.titlesEarned,
    profile.loggedIn,
    userId,
    canonicalInv.count,
    hydrated,
    identityEpoch
  ]);


  // Silent baseline gate: live achievement notifications are enabled only
  // after the auth mirror and initial canonical completion sources settle.
  useEffect(() => {
    if (!hydrated) return;
    if (!achievementSourcesSettled) return;
    void establishAchievementLiveBaseline();
  }, [hydrated, achievementSourcesSettled, unionedCampaigns, canonicalInv.count, profile.points, profile.dinars, profile.streak]);

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

