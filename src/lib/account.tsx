import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";
import { recordTrace } from "@/lib/diag-trace";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAccountProfile,
  fetchCloudSave,
  pushSave,
  signInWithEmail,
  signOut as cloudSignOut,
  signUpWithEmail,
  touchLastActive,
  updateDisplayName as cloudUpdateDisplayName,
  updateUsername as cloudUpdateUsername,
  isUsernameAvailable as cloudIsUsernameAvailable,
  type AccountProfile,
} from "./cloud-save";
import { useProfile, type ProfileState } from "./profile";
import { pushPublicStats } from "./social";
import { androidMark, androidMeasure, isAndroidUltraStableMode, recordAndroidAction } from "./androidFreezeDiagnostics";
import { flushOutbox } from "./offline/flush";
import { getReconciliationState, setReconciliationState } from "./boot/reconciliation";
import { withBoundedTimeout } from "./boot/withTimeout";
import { recordStartupMark } from "./boot/startup-timeline";
import { resetForIdentityChange } from "./identity/reset";
import { getActiveOwner, getActiveUserId, getIdentityEpoch, onOwnerChange, guestOwnerKey, userOwnerKey } from "./identity/owner";
import { accountOperation } from "./account-operation";
import { waitForAuthReady } from "./identity/guard";
import { DISABLED_PROTOCOL_GATE, readProtocolGate, type ProtocolGateObservation } from "./economy/compatibility-gate";
import {
  beginEmailObservation,
  endEmailObservation,
  failEmailObservation,
  selectTestEmailObserver,
  type EmailAuthObserver,
} from "./auth/transition-observation";


interface AccountCtx {
  user: User | null;
  account: AccountProfile | null;
  displayName: string;
  loadingSession: boolean;
  syncing: boolean;
  isAuthResetting: boolean;
  lastSyncAt: number | null;
  protocolGate: ProtocolGateObservation;
  signUp: (args: { email: string; password: string; username: string; displayName?: string }) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<boolean>;
  updateDisplayName: (name: string) => Promise<{ ok: boolean; error?: string }>;
  updateUsername: (username: string) => Promise<{ ok: boolean; error?: string; value?: string }>;
  isUsernameAvailable: (username: string) => Promise<boolean>;
}



const Ctx = createContext<AccountCtx | null>(null);

const PUSH_DEBOUNCE_MS = 1500;

export function AccountProvider({ children, emailAuthObserverForTests, compatibilityGateProbeForTests }: {
  children: ReactNode;
  emailAuthObserverForTests?: EmailAuthObserver;
  /** Ignored outside test builds; there is no production rollout flag. */
  compatibilityGateProbeForTests?: boolean;
}) {
  const emailAuthObserver = selectTestEmailObserver(emailAuthObserverForTests);
  const identitySnapshot = () => JSON.stringify([getActiveOwner(), getIdentityEpoch()]);
  const identity = useSyncExternalStore(onOwnerChange, identitySnapshot, identitySnapshot);
  const gateProbeEnabled = import.meta.env.MODE === "test" && import.meta.env.PROD === false && compatibilityGateProbeForTests === true;
  const [gateFrame, setGateFrame] = useState<{
    owner: string; epoch: number; value: ProtocolGateObservation;
  } | null>(null);
  const protocolGate = gateProbeEnabled && gateFrame?.owner === getActiveOwner() &&
    gateFrame.epoch === getIdentityEpoch() ? gateFrame.value : DISABLED_PROTOCOL_GATE;

  const androidStable = isAndroidUltraStableMode();
  const { profile, getPersistence, mergeCloudSave, applyServerStats, addDinars, awardBadge, login, hydrateClaimedStreakRewards, adoptServerAvatar } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [accountFrame, setAccountFrame] = useState<{
    owner: string; epoch: number; value: AccountProfile | null;
  } | null>(null);
  const account = accountFrame?.owner === getActiveOwner() &&
    accountFrame.epoch === getIdentityEpoch() ? accountFrame.value : null;
  const setAccount = (change: SetStateAction<AccountProfile | null>) => {
    const acceptedLifetime = lifetime.current;
    const request = accountOperation(null, () => mounted.current && lifetime.current === acceptedLifetime);
    setAccountFrame(previous => {
      if (!request.current()) return previous;
      const before = previous?.owner === request.owner && previous.epoch === request.epoch
        ? previous.value : null;
      return { owner: request.owner, epoch: request.epoch,
        value: typeof change === "function" ? change(before) : change };
    });
  };
  const [loadingSession, setLoadingSession] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isAuthResetting, setIsAuthResetting] = useState(false);

  // Block auto-push while we're resolving a conflict or initial hydration.
  const autoPushEnabled = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // Timestamp of the most recent local profile mutation that has not yet
  // been pushed to the server. Realtime UPDATE events that arrive within
  // REALTIME_GUARD_MS of this stamp are ignored, because the server row
  // they carry is older than our local state and would otherwise overwrite
  // a just-earned reward or a just-lost heart with a stale value.
  const lastLocalChangeRef = useRef(0);
  const prevProfileSigRef = useRef<string>("");
  const profileWrite = getPersistence?.();
  const profileReady = profileWrite?.owner === getActiveOwner() &&
    profileWrite?.epoch === getIdentityEpoch() &&
    profileWrite.outcome !== "unresolved" && profileWrite.outcome !== "failed";
  const profileIdentity = JSON.stringify([profileWrite?.owner, profileWrite?.epoch, profileReady]);
  const mounted = useRef(true);
  const lifetime = useRef(0);
  const syncTicket = useRef<symbol | null>(null);
  const resetTicket = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lifetime.current++; syncTicket.current = null; };
  }, []);
  const operation = (uid: string | null, alive: () => boolean = () => true) => {
    const acceptedLifetime = lifetime.current;
    return accountOperation(uid, () => mounted.current && lifetime.current === acceptedLifetime &&
      identity === identitySnapshot() && alive());
  };
  const beginSync = () => {
    const ticket = Symbol("account-sync");
    syncTicket.current = ticket;
    setSyncing(true);
    return ticket;
  };
  const finishSync = (ticket: symbol, current: () => boolean) => {
    if (syncTicket.current === ticket && current()) setSyncing(false);
  };
  const snapshot = () => JSON.parse(JSON.stringify(profileRef.current)) as ProfileState;



  // ============ Initial session + auth state listener ============
  const switchStartRef = useRef<number>(performance.now());
  useEffect(() => {
    let alive = true;
    let authSequence = 0;
    const boot = operation(null, () => alive && authSequence === 0);
    switchStartRef.current = performance.now();
    androidMark("account.session.start");
    supabase.auth.getSession().then(({ data }) => {
      if (!boot.current()) return;
      setReconciliationState(data.session?.user ? "loading-local" : "offline-local");
      recordAndroidAction("account.session.resolved", { hasUser: !!data.session?.user });
      setUser(data.session?.user ?? null);
      setLoadingSession(false);
    }).catch(() => {
      if (!boot.current()) return;
      setLoadingSession(false);
      setReconciliationState("offline-local", "initial-session-unresolved");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      const sequence = ++authSequence;
      const u = session?.user ?? null;
      setLoadingSession(false);
      
      // V13 Forensic Trace: Record the auth event immediately.

      if (event === "SIGNED_OUT") {
        setReconciliationState("offline-local");
        // V13 Bug 2: Ensure the native PKCE client reference is reset on all 
        // SIGNED_OUT transitions, not just explicit logout.
        try {
          import("@/lib/native-auth").then(m => {
            m.resetNativePkceClient();
          }).catch(() => {});
        } catch { /* ignore dynamic import failure */ }
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        // V13 hotfix: only a REAL identity transition may downgrade trust.
        // Duplicate same-user events (Android resume / WebView session
        // restore re-emitting SIGNED_IN / INITIAL_SESSION) must leave an
        // already-terminal reconciliation state untouched — the hydration
        // effect is keyed on user.id and will NOT re-run to restore it, so
        // a blind downgrade strands Hearts/Hero in loading indefinitely.
        const nextOwner = u ? userOwnerKey(u.id) : guestOwnerKey();
        if (getActiveOwner() !== nextOwner) {
          setReconciliationState(u ? "loading-local" : "offline-local");
        }
      }

      // THE single approved identity-switch path. Idempotent: repeated
      // INITIAL_SESSION / TOKEN_REFRESHED events for the same user are
      // no-ops, while any real change (login, logout, account switch,
      // expired session) atomically swaps the storage namespace, clears
      // the query cache, drops realtime channels and invalidates every
      // in-flight response guard.
      void resetForIdentityChange({
        nextUserId: u?.id ?? null,
        reason: event === "SIGNED_OUT" ? "sign-out" : event === "SIGNED_IN" ? "sign-in" : "auth-listener",
      }).then((res) => {
        if (!alive || sequence !== authSequence || getActiveOwner() !== (u ? userOwnerKey(u.id) : guestOwnerKey()) || !res.changed) return;

        // Real initialization/change confirmed by the identity lifecycle.
        // Covers the edge the synchronous pre-check above cannot prove
        // (same owner key but never fully initialized). Safe point: the
        // hydration effect is gated on THIS reset's auth-readiness, so
        // this loading state always proceeds to a terminal state through
        // the existing reconciliation flow.
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          setReconciliationState(u ? "loading-local" : "offline-local");
        }

        // Neutralize owner-bound pending state on identity swap.
        autoPushEnabled.current = false;
        if (pushTimer.current) {
          clearTimeout(pushTimer.current);
          pushTimer.current = null;
        }

        if (!u) {
          setAccount(null);
          setLastSyncAt(null);
          setSyncing(false); // Neutralize syncing state on sign-out
        }
      }).catch(() => {
        if (!alive || sequence !== authSequence) return;
        autoPushEnabled.current = false;
        setReconciliationState("failed", "identity-reset-failed");
      });

      setUser(u);

      if (event === "SIGNED_OUT") {
        autoPushEnabled.current = false;
        setAccount(null);
        setLastSyncAt(null);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Inert diagnostic only. No production RPC, wallet/Cloud mutation or auth dependency.
  useEffect(() => {
    if (!gateProbeEnabled || !user) return;
    let alive = true;
    const request = operation(user.id, () => alive);
    void readProtocolGate(user.id, request.current).then(result => {
      if (!result || !request.current()) return;
      setGateFrame(previous => request.current()
        ? { owner: request.owner, epoch: request.epoch, value: result }
        : previous);
    });
    return () => { alive = false; };
  }, [gateProbeEnabled, user?.id, identity]);

  // ============ On user change: hydrate account + reconcile cloud save ============
  useEffect(() => {
    if (!user) return;
    if (!profileReady) {
      autoPushEnabled.current = false;
      setReconciliationState("offline-local", "profile-read-unresolved");
      return;
    }
    let cancelledFlag = false;
    // Anti-race: a response for THIS user is only applied while it is still
    // the active identity. A slow fetch that resolves after logout / account
    // switch is dropped instead of poisoning the new identity's state.
    const request = operation(user.id, () => !cancelledFlag);
    const isStale = () => !request.current();
    setReconciliationState("loading-server");

    // A conflicting legacy owner marker is unresolved provenance. Keep the
    // source bytes and do not seed a cloud wallet from an unknown snapshot.
    const LAST_USER_KEY = "hakaya.profile.userId";
    try {
      const prev = typeof localStorage !== "undefined"
        ? localStorage.getItem(LAST_USER_KEY)
        : null;
      if (prev && prev !== user.id) {
        // Ambiguous provenance is not permission to reset/delete/seed a wallet.
        setReconciliationState("offline-local", "profile-owner-unresolved");
        autoPushEnabled.current = false;
        return;
      }
    } catch { /* ignore */ }

    (async () => {
      // 0) AUTH READINESS CONTRACT: authenticated queries must wait for readiness.
      await waitForAuthReady();
      if (isStale()) return;

      const sourceProfile = profileRef.current;
      const started = performance.now();
      androidMark("account.hydrate.start", { userId: user.id.slice(0, 8) });
      recordStartupMark("server-reconciliation-started");
      const ticket = beginSync();
      let reconciled = false;
      // Soft deadline: if server reconciliation has not reached a terminal
      // state within 5s, transition to "offline-local" so consumers (tutorial
      // engine, hero recommendation) unblock. The work continues in the
      // background and, on eventual success, upgrades to "reconciled".
      const softTimer = setTimeout(() => {
        if (isStale() || reconciled) return;
        recordStartupMark("server-reconciliation-soft-timeout");
        recordStartupMark("offline-local-entered");
        setReconciliationState("offline-local", "soft-timeout");
      }, 5000);
      try {
        const [acc, save] = await Promise.all([
          fetchAccountProfile(user.id),
          fetchCloudSave(user.id),
        ]);
        if (isStale()) return;

        setAccount(acc);
        if (!androidStable) void touchLastActive(user.id);

        // Phase 2 (Referrals removal): signup referral reward claim was
        // deleted. New accounts get their +300 Dinar starting balance from
        // profile seed defaults, not from referral RPCs.


        if (!save) {
          // A successful missing-row read may use only this request's
          // unchanged, readable local snapshot. Errors never enter this path.
          if (androidStable) {
            autoPushEnabled.current = false;
          } else {
            if (isStale() || profileRef.current !== sourceProfile) {
              setReconciliationState("offline-local", "profile-revision-unresolved"); return;
            }
            const pushed = await pushSave(user.id, snapshot());
            if (isStale()) return;
            if (profileRef.current !== sourceProfile) {
              setReconciliationState("offline-local", "profile-revision-unresolved"); return;
            }
            autoPushEnabled.current = pushed;
            if (pushed) setLastSyncAt(Date.now());
          }
        } else {
          // Cloud hydrate — MERGE, don't clobber. Union server sticky
          // campaign completions in so a device that never pushed the
          // fact (or is coming back after a reinstall) cannot regress
          // progression arrays. Numeric scalars (xp/dinars/season) take
          // max; hearts / streak respect their day-anchored rules.
          let sticky: string[] = [];
          try {
            const { fetchServerCompletedIds } = await import("@/lib/campaigns/completions");
            if (isStale()) return;
            sticky = Array.from((await fetchServerCompletedIds()).ids);
          } catch { /* offline / transient — proceed without ledger */ }
          if (isStale()) return;
          if (profileRef.current !== sourceProfile) {
            setReconciliationState("offline-local", "profile-revision-unresolved");
            autoPushEnabled.current = false; return;
          }
          mergeCloudSave(save.data, { stickyCampaignIds: sticky });
          autoPushEnabled.current = true;
          setLastSyncAt(Date.now());
        }

        // Premium Emblem — `cloud_saves` is a whole-profile blob that can be
        // arbitrarily stale (it is pushed on a debounce), and `mergeCloudSave`
        // spreads it over local state. `profiles.avatar_id` is the value every
        // other player actually sees, so it wins here — unless THIS device
        // still holds an un-flushed pick, which is newer than both.
        try {
          const { reconcileAvatarOnHydrate } = await import("@/lib/emblems/avatar-persistence");
          if (isStale()) return;
          const resolved = await reconcileAvatarOnHydrate(user.id, profileRef.current?.avatarId);
          if (!isStale() && resolved) adoptServerAvatar(resolved);
        } catch { /* keep the merged value — non-fatal */ }

        if (isStale()) return;
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(LAST_USER_KEY, user.id);
          }
        } catch { /* ignore */ }
        // Encyclopedia discovery ledger — promote guest-scope reads into
        // this account and repair any locally-known discovery the server
        // never received. `evaluate_unlock_spec_v2` reads ONLY the server
        // table, so a gap here shows up as "I read it but the Story is
        // still locked". Fire-and-forget: never blocks first paint.
        try {
          const { syncLocalDiscoveriesToServer } = await import("@/lib/entityDiscoveries");
          if (isStale()) return;
          void syncLocalDiscoveriesToServer(user.id);
        } catch { /* noop */ }
        // Merge server-side streak reward claims so they can never be
        // re-claimed after a fresh install / cloud restore.
        if (isStale()) return;
        try { await hydrateClaimedStreakRewards(); } catch { /* noop */ }
        // Reflective Moments — pull server-mirrored reflections so the
        // "My Reflections" journal restores after reinstall / new device.
        // Fire-and-forget; journal continues to render from local mirror
        // on failure.
        try {
          const { hydrateReflectionsFromServer } = await import("@/lib/reflections");
          if (isStale()) return;
          void hydrateReflectionsFromServer();
        } catch { /* noop */ }
        // Tutorial server mirror — reconcile local ⇄ server so a
        // reinstalled/second-device authenticated user does not replay
        // the tour. Priority-Zero (2026-07).
        try {
          const { hydrateOnboardingFromServer } = await import("@/lib/tutorial/persistence");
          if (isStale()) return;
          const outcome = await withBoundedTimeout(
            hydrateOnboardingFromServer("irth-first-time"),
            5000,
            (late) => {
              if (isStale()) return;
              if (late.kind === "success") {
                recordStartupMark("server-reconciliation-success", "late");
                setReconciliationState("reconciled");
              } else if (late.kind === "offline") {
                recordStartupMark("offline-local-entered", "late");
                setReconciliationState("offline-local");
              } else if (late.kind === "failed") {
                recordStartupMark("server-reconciliation-failed", "late");
              }
            },
            "onboarding"
          );
          if (isStale()) return;
          if (outcome.kind === "success") {
            reconciled = true;
            recordStartupMark("server-reconciliation-success");
          } else if (outcome.kind === "timeout") {
            recordStartupMark("server-reconciliation-soft-timeout", "onboarding");
            // Soft-timeout sets state to offline-local to allow the app to boot,
            // but the onLate callback above will promote it to 'reconciled' 
            // if the request eventually finishes successfully.
            setReconciliationState("offline-local", "onboarding-timeout");
          } else if (outcome.kind === "offline") {
            recordStartupMark("offline-local-entered", "onboarding");
            setReconciliationState("offline-local");
          } else {
            recordStartupMark("server-reconciliation-failed");
            setReconciliationState("failed", outcome.error instanceof Error ? outcome.error.message : String(outcome.error));
          }
        } catch (e) {
          // If a low-level error happens during initialization, 
          // default to 'failed' rather than assuming a device-offline state.
          if (!isStale()) setReconciliationState("failed", e instanceof Error ? e.message : String(e));
        }


        // Identity → never show "ضيف" once authenticated. Prefer display_name.
        if (isStale()) return;
        const identityName = acc?.display_name?.trim()
          || (user.user_metadata?.display_name as string | undefined)?.trim()
          || (user.user_metadata?.full_name as string | undefined)?.trim()
          || acc?.username
          || user.email?.split("@")[0]
          || "";
        if (identityName) login(identityName);

        // One-time repair: if profile.display_name is empty/null/"ضيف", set it.
        if (!androidStable && acc && (!acc.display_name || !acc.display_name.trim() || acc.display_name === "ضيف")) {
          const repair = (user.user_metadata?.display_name as string | undefined)
            || (user.user_metadata?.full_name as string | undefined)
            || acc.username
            || user.email?.split("@")[0]
            || "مستخدم إرث";
          try {
          if (isStale()) return;
            const r = await cloudUpdateDisplayName(repair);
            if (!isStale() && r.ok && r.value) setAccount((prev) => !isStale() && prev ? { ...prev, display_name: r.value! } : prev);
          } catch { /* ignore */ }
        }
        if (reconciled && !isStale()) {
          setReconciliationState("reconciled");
        }

      } catch (e) {
        if (!isStale()) {
          setReconciliationState("failed", e instanceof Error ? e.message : String(e));
        }
      } finally {
        const duration = performance.now() - started;
        clearTimeout(softTimer);
        androidMeasure("account.hydrate", started);
        finishSync(ticket, request.current);
      }
    })();
    return () => {
      cancelledFlag = true;

    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, androidStable, identity, profileIdentity]);

  // ============ Track local profile mutations (stat-only signature) ============
  // Only the fields the server reflects matter for the realtime guard. We
  // ignore unrelated profile mutations (e.g. opening a story) so we don't
  // suppress legitimate server-side updates.
  useEffect(() => {
    const sig = [
      profile.points,
      profile.dinars,
      profile.hearts,
      profile.streak,
      profile.campaignsCompleted.length,
      profile.artifactsFound.length,
    ].join("|");
    if (prevProfileSigRef.current && prevProfileSigRef.current !== sig) {
      lastLocalChangeRef.current = Date.now();
    }
    prevProfileSigRef.current = sig;
  }, [profile.points, profile.dinars, profile.hearts, profile.streak, profile.campaignsCompleted.length, profile.artifactsFound.length]);

  // ============ Debounced auto-push while signed in ============
  useEffect(() => {
    const isReady = ["reconciled", "offline-local"].includes(getReconciliationState());
    if (!user || !profileReady || !autoPushEnabled.current || !isReady) return;
    if (androidStable) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    let cancelled = false;
    const request = operation(user.id, () => !cancelled);
    pushTimer.current = setTimeout(() => {
      if (!request.current()) return;
      const data = snapshot();
      const source = profileRef.current;
      const ticket = beginSync();
      void (async () => {
        try {
          const ok = await pushSave(user.id, data);
          if (!request.current()) return;
          if (profileRef.current !== source) {
            setReconciliationState("offline-local", "profile-revision-unresolved"); return;
          }
          if (ok) setLastSyncAt(Date.now());
          const statsAcknowledged = await pushPublicStats(user.id, data, () => request.current() && profileRef.current === source);
          if (ok && statsAcknowledged === true && request.current() && profileRef.current === source && syncTicket.current === ticket)
            lastLocalChangeRef.current = 0;
        } catch { /* Offline does not acknowledge the pending snapshot. */ }
        finally { finishSync(ticket, request.current); }
      })();
    }, PUSH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [profile, user, androidStable, identity]);

  // ============ Re-sync when network returns ============
  // pushSave is the only writer to cloud_saves and runs on a debounce
  // when local state changes. If rewards were earned offline and no
  // further mutations happen after reconnect, the queue would sit idle.
  // On 'online', force one push so offline-earned XP/dinars/hearts/
  // streak land server-side without waiting for the next gameplay event.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    const request = operation(uid, () => !cancelled);
    if (request.current()) void flushOutbox(uid).catch(() => {});
    const onOnline = () => {
      if (!request.current()) return;
      void flushOutbox(uid).finally(() => {
        if (!profileReady || !autoPushEnabled.current || !request.current()) return;
        const data = snapshot(), source = profileRef.current;
        const ticket = beginSync();
        void (async () => {
          try {
            const ok = await pushSave(uid, data);
            if (!request.current()) return;
            if (profileRef.current !== source) {
              setReconciliationState("offline-local", "profile-revision-unresolved"); return;
            }
            if (ok) setLastSyncAt(Date.now());
            const statsAcknowledged = await pushPublicStats(uid, data, () => request.current() && profileRef.current === source);
            if (ok && statsAcknowledged === true && request.current() && profileRef.current === source && syncTicket.current === ticket)
              lastLocalChangeRef.current = 0;
          } catch { /* Offline. */ }
          finally { finishSync(ticket, request.current); }
        })();
      }).catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => { cancelled = true; window.removeEventListener("online", onOnline); };
  }, [user, identity, profileIdentity]);


  // Server `profiles` row is authoritative for xp/dinars/hearts/streak. If an
  // admin adjusts a balance (or any other server-side mutation occurs), mirror
  // it into the local profile so the player sees the new value immediately —
  // no logout, no manual refresh. While local has unpushed changes (within
  // REALTIME_GUARD_MS of the last local mutation), suppress the apply: the
  // incoming row is older than local state and would clobber a freshly
  // earned reward or a just-lost heart.
  const REALTIME_GUARD_MS = 4000;
  // Phase 3B (R1): keep the latest `applyServerStats` in a ref so the effect
  // below depends ONLY on the user id. Previously `applyServerStats` changed
  // identity on every profile mutation, which tore down and rebuilt the
  // realtime channel (and re-ran the cold-start RPC) dozens of times a
  // session — the dominant source of `realtime.subscription` write churn.
  const applyServerStatsRef = useRef(applyServerStats);
  useEffect(() => { applyServerStatsRef.current = applyServerStats; }, [applyServerStats]);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    const request = operation(uid, () => !cancelled);
    const sourceProfile = profileRef.current;

    // Cold-start reconciliation: pull the current authoritative row once.
    (async () => {
      try {
        if (!request.current()) return;
        const { data, error } = await supabase.rpc("get_my_profile");
        if (!request.current() || error || !data) return;
        if (profileRef.current !== sourceProfile) {
          setReconciliationState("offline-local", "profile-revision-unresolved"); return;
        }
        // Skip if local has unpushed gameplay changes that just happened.
        if (Date.now() - lastLocalChangeRef.current < REALTIME_GUARD_MS) return;
        const row = data as { xp?: number; dinars?: number; hearts?: number; streak?: number; last_streak_day?: string | null };
        applyServerStatsRef.current({
          xp: row.xp ?? null,
          dinars: row.dinars ?? null,
          hearts: row.hearts ?? null,
          streak: row.streak ?? null,
          // V17-04A — the mirror's own day travels with the mirror.
          lastStreakDay: row.last_streak_day ?? null,
        });
      } catch { /* ignore */ }
    })();

    const channel = supabase
      .channel(`profile-sync-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          // Late broadcast for a signed-out / switched-away account.
          if (!request.current()) return;
          if (Date.now() - lastLocalChangeRef.current < REALTIME_GUARD_MS) {
            // Local has unpushed changes — the broadcast row is stale.
            return;
          }
          const row = (payload.new ?? {}) as { xp?: number; dinars?: number; hearts?: number; streak?: number; last_streak_day?: string | null };
          applyServerStatsRef.current({
            xp: row.xp ?? null,
            dinars: row.dinars ?? null,
            hearts: row.hearts ?? null,
            streak: row.streak ?? null,
            lastStreakDay: row.last_streak_day ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, identity]);





  const signUp = useCallback<AccountCtx["signUp"]>(async ({ email, password, username, displayName }) => {
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً" };
    if (password.length < 8) return { ok: false, error: "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" };
    const observation = beginEmailObservation(emailAuthObserver, "sign_up");
    let response: Awaited<ReturnType<typeof signUpWithEmail>>;
    try {
      response = await signUpWithEmail({ email, password, username: u, displayName });
    } catch (error) {
      failEmailObservation(observation);
      throw error;
    }
    const { data, error } = response;
    if (observation) endEmailObservation(observation, !!error, !!data?.session);
    if (error) return { ok: false, error: error.message };
    // Client-side fallback: if a session was returned, upsert display_name immediately.
    if (data.session?.user) {
      const name = (displayName ?? u).trim();
      try { await cloudUpdateDisplayName(name); } catch { /* ignore */ }
    }

    // BETA: when VITE_BETA_AUTO_CONFIRM_USERS=true, accounts are auto-confirmed
    // server-side and we send a branded welcome email instead of a verification
    // link. Toggle the env flag off (and re-disable auto-confirm in Cloud)
    // to restore the normal verification flow without any code change.
    const autoConfirm = import.meta.env.VITE_BETA_AUTO_CONFIRM_USERS === "true";
    if (autoConfirm && data.session?.user) {
      const name = (displayName ?? u).trim();
      try {
        const { sendTransactionalEmail } = await import("@/lib/email/send");
        await sendTransactionalEmail({
          templateName: "welcome-beta",
          recipientEmail: email.trim(),
          idempotencyKey: `welcome-beta-${data.session.user.id}`,
          templateData: { displayName: name },
        });
      } catch (err) {
        console.warn("[account] welcome email failed", err);
      }
      return { ok: true };
    }

    if (!data.session) {
      return { ok: true, error: "تحقق من بريدك لتأكيد الحساب." };
    }
    return { ok: true };
  }, [emailAuthObserver]);

  const signIn = useCallback<AccountCtx["signIn"]>(async (email, password) => {
    const observation = beginEmailObservation(emailAuthObserver, "sign_in");
    let response: Awaited<ReturnType<typeof signInWithEmail>>;
    try {
      response = await signInWithEmail(email, password);
    } catch (error) {
      failEmailObservation(observation);
      throw error;
    }
    const { error } = response;
    if (observation) endEmailObservation(observation, !!error, !!response.data?.session);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, [emailAuthObserver]);

  const signOutFn = useCallback(async () => {
    const request = operation(user?.id ?? null);
    if (!request.current()) return;
    const finalSource = profileRef.current;
    const finalSnapshot = snapshot();
    const acceptedLifetime = lifetime.current;
    const ticket = Symbol("account-signout");
    resetTicket.current = ticket;
    setIsAuthResetting(true);
    try {
      // Cancel the debounce and flush a final synchronous push BEFORE
      // signing out so any pending progression (hearts just lost, coins
      // earned, XP awarded seconds before logout, streak update) lands in
      // both cloud_saves and the profiles row. Without this the debounced
      // push is dropped when the auth token is cleared and the next login
      // restores a stale snapshot — most visibly, a heart the player just
      // lost reappears / a heart just spent comes back at 5/5.
      autoPushEnabled.current = false;
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
      }
      const currentUser = user;
      if (currentUser && profileReady) {
        try {
          await pushSave(currentUser.id, finalSnapshot);
          if (!request.current()) return;
          if (profileRef.current !== finalSource) {
            setReconciliationState("offline-local", "profile-revision-unresolved"); return;
          }
          await pushPublicStats(currentUser.id, finalSnapshot, () => request.current() && profileRef.current === finalSource);
          if (!request.current()) return;
          if (profileRef.current !== finalSource) {
            setReconciliationState("offline-local", "profile-revision-unresolved"); return;
          }
        } catch (err) {
          console.warn("[account] final flush before signOut failed", err);
        }
        // Priority-Zero §5: drain the durable outbox so queued chapter
        // progress / tutorial completions / etc. reach the server BEFORE
        // the auth token clears. Bounded timeout so sign-out never hangs.
        try {
          const { flushOutboxWithTimeout } = await import("./offline/logout-flush");
          if (!request.current()) return;
          const res = await flushOutboxWithTimeout(currentUser.id, 4000);
          if (!request.current()) return;
          if (profileRef.current !== finalSource) {
            setReconciliationState("offline-local", "profile-revision-unresolved"); return;
          }
          if (res.pendingAfter > 0) {
            console.warn("[account] signOut leaving pending outbox ops", res);
          }
        } catch (err) {
          console.warn("[account] logout-flush errored", err);
        }
      }

      const { resetNativePkceClient } = await import("@/lib/native-auth");
      
      if (!request.current()) return;
      // Atomic identity switch back to this device's guest space. The auth
      // listener also calls this (idempotent) — doing it here guarantees the
      // swap has completed before signOut() resolves, so no frame can render
      // the previous account's data.
      await resetForIdentityChange({ nextUserId: null, reason: "sign-out" });
      
      // V13 Bug 2: Nullify the native PKCE transport reference so the next 
      // login uses a fresh instance, avoiding "code verifier not found".
      const guest = accountOperation(null, () => mounted.current && lifetime.current === acceptedLifetime && resetTicket.current === ticket);
      if (getActiveOwner() !== guestOwnerKey()) return;
      resetNativePkceClient();
      if (!guest.current()) return;
      await cloudSignOut();
      if (!guest.current()) return;
      setUser(null);
      setAccount(null);
      setLastSyncAt(null);
    } catch (e) {
      console.error("[account] signOut error", e);
    } finally {
      if (mounted.current && resetTicket.current === ticket) setIsAuthResetting(false);
    }
  }, [user, identity, profileIdentity]);

  const syncNow = useCallback(async () => {
    if (!user || !profileReady) return false;
    const request = operation(user.id);
    if (!request.current()) return false;
    const data = snapshot(), source = profileRef.current;
    const ticket = beginSync();
    try {
      const saveOk = await pushSave(user.id, data);
      if (!request.current()) return false;
      if (profileRef.current !== source) {
        setReconciliationState("offline-local", "profile-revision-unresolved"); return false;
      }
      const statsAcknowledged = await pushPublicStats(user.id, data, () => request.current() && profileRef.current === source);
      if (!request.current()) return false;
      if (profileRef.current !== source) {
        setReconciliationState("offline-local", "profile-revision-unresolved"); return false;
      }
      if (saveOk) setLastSyncAt(Date.now());
      if (saveOk && statsAcknowledged === true && profileRef.current === source && syncTicket.current === ticket) lastLocalChangeRef.current = 0;
      return saveOk;
    } finally { finishSync(ticket, request.current); }
  }, [user, identity, profileIdentity]);

  const updateDisplayNameFn = useCallback<AccountCtx["updateDisplayName"]>(async (name) => {
    const request = operation(user?.id ?? null);
    if (!request.current()) return { ok: false, error: "identity_changed" };
    const r = await cloudUpdateDisplayName(name);
    if (!request.current()) return { ok: false, error: "identity_changed" };
    if (!r.ok) return { ok: false, error: r.error };
    if (r.value) {
      setAccount((prev) => prev ? { ...prev, display_name: r.value! } : prev);
      login(r.value);
    }
    return { ok: true };
  }, [login, user, identity]);

  const updateUsernameFn = useCallback<AccountCtx["updateUsername"]>(async (username) => {
    const request = operation(user?.id ?? null);
    if (!request.current()) return { ok: false, error: "identity_changed" };
    const r = await cloudUpdateUsername(username);
    if (!request.current()) return { ok: false, error: "identity_changed" };
    if (!r.ok) return { ok: false, error: r.error };
    if (r.value) {
      setAccount((prev) => prev ? { ...prev, username: r.value! } : prev);
    }
    return { ok: true, value: r.value };
  }, [user, identity]);

  const isUsernameAvailableFn = useCallback<AccountCtx["isUsernameAvailable"]>(async (username) => {
    return cloudIsUsernameAvailable(username);
  }, []);

  const displayName = useMemo(() => {
    const resolved = account?.display_name?.trim()
      || (user?.user_metadata?.display_name as string | undefined)?.trim()
      || (user?.user_metadata?.full_name as string | undefined)?.trim()
      || (user?.user_metadata?.username as string | undefined)?.trim()
      || account?.username?.trim()
      || user?.email?.split("@")[0]?.trim();
    if (resolved) return resolved;
    return user ? "مستخدم إرث" : "ضيف";
  }, [account, user]);

  const value = useMemo<AccountCtx>(() => ({
    user,
    account,
    displayName,
    loadingSession,
    syncing,
    isAuthResetting,
    lastSyncAt,
    protocolGate,
    signUp,
    signIn,
    signOut: signOutFn,
    syncNow,
    updateDisplayName: updateDisplayNameFn,
    updateUsername: updateUsernameFn,
    isUsernameAvailable: isUsernameAvailableFn,
  }), [user, account, displayName, loadingSession, syncing, isAuthResetting, lastSyncAt, protocolGate, signUp, signIn, signOutFn, syncNow, updateDisplayNameFn, updateUsernameFn, isUsernameAvailableFn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}