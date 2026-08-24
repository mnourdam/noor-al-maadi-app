import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { getActiveUserId } from "./identity/owner";
import { waitForAuthReady } from "./identity/guard";


interface AccountCtx {
  user: User | null;
  account: AccountProfile | null;
  displayName: string;
  loadingSession: boolean;
  syncing: boolean;
  isAuthResetting: boolean;
  lastSyncAt: number | null;
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

export function AccountProvider({ children }: { children: ReactNode }) {
  const androidStable = isAndroidUltraStableMode();
  const { profile, mergeCloudSave, applyServerStats, addDinars, awardBadge, login, resetProfile, hydrateClaimedStreakRewards, adoptServerAvatar } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isAuthResetting, setIsAuthResetting] = useState(false);

  // Block auto-push while we're resolving a conflict or initial hydration.
  const autoPushEnabled = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const resetProfileRef = useRef(resetProfile);
  resetProfileRef.current = resetProfile;
  // Timestamp of the most recent local profile mutation that has not yet
  // been pushed to the server. Realtime UPDATE events that arrive within
  // REALTIME_GUARD_MS of this stamp are ignored, because the server row
  // they carry is older than our local state and would otherwise overwrite
  // a just-earned reward or a just-lost heart with a stale value.
  const lastLocalChangeRef = useRef(0);
  const prevProfileSigRef = useRef<string>("");


  // ============ Initial session + auth state listener ============
  const switchStartRef = useRef<number>(performance.now());
  useEffect(() => {
    let alive = true;
    switchStartRef.current = performance.now();
    recordTrace("sync-forensics", "ACCOUNT_SWITCH_REQUESTED", JSON.stringify({ ts: Date.now() }));
    androidMark("account.session.start");
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setReconciliationState(data.session?.user ? "loading-local" : "offline-local");
      recordAndroidAction("account.session.resolved", { hasUser: !!data.session?.user });
      setUser(data.session?.user ?? null);
      setLoadingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      
      // V13 Forensic Trace: Record the auth event immediately.
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", `auth:${event}`, JSON.stringify({
          hasUser: !!u,
          userId: u?.id?.slice(0, 8) ?? null,
          reason: event
        }));
      }).catch(() => {});

      if (event === "SIGNED_OUT") {
        recordTrace("sync-forensics", "AUTH_SIGNOUT_DONE", JSON.stringify({ userId: u?.id?.slice(0, 8) }));
        setReconciliationState("offline-local");
        // V13 Bug 2: Ensure the native PKCE client reference is reset on all 
        // SIGNED_OUT transitions, not just explicit logout.
        try {
          import("@/lib/native-auth").then(m => {
            import("@/lib/diag-trace").then(dt => dt.recordTrace("pkce-audit", "SIGNED_OUT_received"));
            m.resetNativePkceClient();
          }).catch(() => {});
        } catch { /* ignore dynamic import failure */ }
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        recordTrace("sync-forensics", "SESSION_DETECTED", JSON.stringify({ event, userId: u?.id?.slice(0, 8) }));
        setReconciliationState(u ? "loading-local" : "offline-local");
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
        if (!res.changed) return;
        
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

  // ============ On user change: hydrate account + reconcile cloud save ============
  useEffect(() => {
    if (!user) return;
    let cancelledFlag = false;
    // Anti-race: a response for THIS user is only applied while it is still
    // the active identity. A slow fetch that resolves after logout / account
    // switch is dropped instead of poisoning the new identity's state.
    const isStale = () => cancelledFlag || getActiveUserId() !== user.id;
    setReconciliationState("loading-server");

    // Guard against leaking a previous account's local snapshot into a new
    // user's cloud save. If this device previously belonged to a different
    // auth user (admin/other Google account), wipe the in-memory + on-disk
    // profile BEFORE we read `profileRef.current` as a seed for the new
    // user's cloud_saves row.
    const LAST_USER_KEY = "hakaya.profile.userId";
    let switchedUser = false;
    try {
      const prev = typeof localStorage !== "undefined"
        ? localStorage.getItem(LAST_USER_KEY)
        : null;
      if (prev && prev !== user.id) {
        switchedUser = true;
        resetProfileRef.current?.();
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem("hakaya.profile.v2");
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("irth.refclaim.")) localStorage.removeItem(k);
            }
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    (async () => {
      // 0) AUTH READINESS CONTRACT: authenticated queries must wait for readiness.
      await waitForAuthReady();
      if (isStale()) return;

      const started = performance.now();
      recordTrace("sync-forensics", "ACCOUNT_RECONCILIATION_START", JSON.stringify({ 
        userId: user.id.slice(0, 8),
        elapsedFromSwitchStart: Math.round(performance.now() - switchStartRef.current)
      }));
      import("@/lib/diag-trace").then(m => m.recordTrace("logout-audit", "profile-hydrate:start", JSON.stringify({ userId: user.id.slice(0, 8) }))).catch(() => {});
      androidMark("account.hydrate.start", { userId: user.id.slice(0, 8) });
      recordStartupMark("server-reconciliation-started");
      setSyncing(true);
      let reconciled = false;
      // Soft deadline: if server reconciliation has not reached a terminal
      // state within 5s, transition to "offline-local" so consumers (tutorial
      // engine, hero recommendation) unblock. The work continues in the
      // background and, on eventual success, upgrades to "reconciled".
      const softTimer = setTimeout(() => {
        if (isStale() || reconciled) return;
        recordStartupMark("server-reconciliation-soft-timeout");
        recordTrace("sync-forensics", "SOFT_TIMEOUT_TRIGGERED", JSON.stringify({ 
          duration: 5000,
          elapsedFromSwitchStart: Math.round(performance.now() - switchStartRef.current)
        }));
        recordStartupMark("offline-local-entered");
        recordTrace("hearts-audit", "HEARTS_SYNC_COMPLETE", "soft-timeout");
        setReconciliationState("offline-local", "soft-timeout");
      }, 5000);
      recordTrace("sync-forensics", "SOFT_TIMEOUT_ARMED", "5000ms");
      try {
        recordTrace("hearts-audit", "HEARTS_CLOUD_FETCH_START", JSON.stringify({ userId: user.id.slice(0, 8) }));
        recordTrace("sync-forensics", "CLOUD_SAVE_FETCH_START");
        recordTrace("sync-forensics", "SERVER_PROFILE_FETCH_START");
        const [acc, save] = await Promise.all([
          fetchAccountProfile(user.id),
          fetchCloudSave(user.id),
        ]);
        if (isStale()) return;
        
        recordTrace("hearts-audit", "HEARTS_CLOUD_FETCH_RESULT", JSON.stringify({
          hasSave: !!save,
          hearts: save?.data?.hearts,
          heartsAt: save?.data?.heartsAt,
          elapsed: performance.now() - started
        }));

        import("@/lib/diag-trace").then(m => m.recordTrace("logout-audit", "profile-hydrate:result", JSON.stringify({
          name: acc?.display_name,
          username: acc?.username,
          hasSave: !!save
        }))).catch(() => {});

        setAccount(acc);
        if (!androidStable) void touchLastActive(user.id);

        // Phase 2 (Referrals removal): signup referral reward claim was
        // deleted. New accounts get their +300 Dinar starting balance from
        // profile seed defaults, not from referral RPCs.


        if (!save) {
          // No cloud save yet. If we just switched from another auth user,
          // ensure the seed is a clean starter profile — never the previous
          // account's XP/coins/progress. For a genuinely fresh install
          // (no previous user recorded) keep the guest local snapshot so
          // anonymous progress carries forward.
          if (switchedUser) {
            resetProfileRef.current?.();
          }
          if (androidStable) {
            autoPushEnabled.current = false;
          } else {
            await pushSave(user.id, profileRef.current);
            autoPushEnabled.current = true;
            setLastSyncAt(Date.now());
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
            sticky = Array.from((await fetchServerCompletedIds()).ids);
          } catch { /* offline / transient — proceed without ledger */ }
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
          const resolved = await reconcileAvatarOnHydrate(user.id, profileRef.current?.avatarId);
          if (!isStale() && resolved) adoptServerAvatar(resolved);
        } catch { /* keep the merged value — non-fatal */ }

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
          void syncLocalDiscoveriesToServer(user.id);
        } catch { /* noop */ }
        // Merge server-side streak reward claims so they can never be
        // re-claimed after a fresh install / cloud restore.
        try { await hydrateClaimedStreakRewards(); } catch { /* noop */ }
        // Reflective Moments — pull server-mirrored reflections so the
        // "My Reflections" journal restores after reinstall / new device.
        // Fire-and-forget; journal continues to render from local mirror
        // on failure.
        try {
          const { hydrateReflectionsFromServer } = await import("@/lib/reflections");
          void hydrateReflectionsFromServer();
        } catch { /* noop */ }
        // Tutorial server mirror — reconcile local ⇄ server so a
        // reinstalled/second-device authenticated user does not replay
        // the tour. Priority-Zero (2026-07).
        try {
          const { hydrateOnboardingFromServer } = await import("@/lib/tutorial/persistence");
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
          setReconciliationState("failed", e instanceof Error ? e.message : String(e));
        }



        // Identity → never show "ضيف" once authenticated. Prefer display_name.
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
            const r = await cloudUpdateDisplayName(repair);
            if (r.ok && r.value) setAccount((prev) => prev ? { ...prev, display_name: r.value! } : prev);
          } catch { /* ignore */ }
        }
        if (reconciled && !isStale()) {
          setReconciliationState("reconciled");
          recordTrace("hearts-audit", "HEARTS_SYNC_COMPLETE", JSON.stringify({ duration: Math.round(performance.now() - started) }));
        }

      } catch (e) {
        if (!isStale()) {
          import("@/lib/diag-trace").then(m => m.recordTrace("logout-audit", "profile-hydrate:error", String(e))).catch(() => {});
          setReconciliationState("failed", e instanceof Error ? e.message : String(e));
        }
      } finally {
        const duration = performance.now() - started;
        import("@/lib/diag-trace").then(m => m.recordTrace("logout-audit", "sync:end", `${Math.round(duration)}ms`)).catch(() => {});
        clearTimeout(softTimer);
        androidMeasure("account.hydrate", started);
        if (!isStale()) setSyncing(false);
      }
    })();
    return () => {
      cancelledFlag = true;

    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, androidStable]);

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
    if (!user || !autoPushEnabled.current || !isReady) return;
    if (androidStable) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      // Never push a profile that now belongs to a different identity.
      if (getActiveUserId() !== user.id) return;
      setSyncing(true);
      pushSave(user.id, profileRef.current)
        .then((ok) => { if (ok) setLastSyncAt(Date.now()); })
        .then(() => pushPublicStats(user.id, profileRef.current))
        .then(() => {
          // The push itself triggered the profiles UPDATE; the realtime echo
          // will carry the value we just sent, which matches local — safe to
          // release the guard so future admin edits apply immediately.
          lastLocalChangeRef.current = 0;
        })
        .finally(() => setSyncing(false));
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [profile, user, androidStable]);

  // ============ Re-sync when network returns ============
  // pushSave is the only writer to cloud_saves and runs on a debounce
  // when local state changes. If rewards were earned offline and no
  // further mutations happen after reconnect, the queue would sit idle.
  // On 'online', force one push so offline-earned XP/dinars/hearts/
  // streak land server-side without waiting for the next gameplay event.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    // On sign-in, drain any queued offline mutations for THIS user.
    void flushOutbox(uid);
    const onOnline = () => {
      // Drain the durable outbox first so completions land before we push
      // the profile blob. Both are idempotent server-side.
      void flushOutbox(uid).finally(() => {
        if (!autoPushEnabled.current || getActiveUserId() !== uid) return;
        setSyncing(true);
        pushSave(uid, profileRef.current)
          .then((ok) => { if (ok) setLastSyncAt(Date.now()); })
          .then(() => pushPublicStats(uid, profileRef.current))
          .catch(() => { /* ignore */ })
          .finally(() => setSyncing(false));
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user]);


  // Server `profiles` row is authoritative for xp/dinars/hearts/streak. If an
  // admin adjusts a balance (or any other server-side mutation occurs), mirror
  // it into the local profile so the player sees the new value immediately —
  // no logout, no manual refresh. While local has unpushed changes (within
  // REALTIME_GUARD_MS of the last local mutation), suppress the apply: the
  // incoming row is older than local state and would clobber a freshly
  // earned reward or a just-lost heart.
  const REALTIME_GUARD_MS = 4000;
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;

    // Cold-start reconciliation: pull the current authoritative row once.
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_my_profile");
        if (cancelled || getActiveUserId() !== uid || error || !data) return;
        // Skip if local has unpushed gameplay changes that just happened.
        if (Date.now() - lastLocalChangeRef.current < REALTIME_GUARD_MS) return;
        const row = data as { xp?: number; dinars?: number; hearts?: number; streak?: number };
        applyServerStats({
          xp: row.xp ?? null,
          dinars: row.dinars ?? null,
          hearts: row.hearts ?? null,
          streak: row.streak ?? null,
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
          if (getActiveUserId() !== uid) return;
          if (Date.now() - lastLocalChangeRef.current < REALTIME_GUARD_MS) {
            // Local has unpushed changes — the broadcast row is stale.
            return;
          }
          const row = (payload.new ?? {}) as { xp?: number; dinars?: number; hearts?: number; streak?: number };
          applyServerStats({
            xp: row.xp ?? null,
            dinars: row.dinars ?? null,
            hearts: row.hearts ?? null,
            streak: row.streak ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id, applyServerStats]);




  const signUp = useCallback<AccountCtx["signUp"]>(async ({ email, password, username, displayName }) => {
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً" };
    if (password.length < 8) return { ok: false, error: "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" };
    const { data, error } = await signUpWithEmail({ email, password, username: u, displayName });
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
  }, []);

  const signIn = useCallback<AccountCtx["signIn"]>(async (email, password) => {
    const { error } = await signInWithEmail(email, password);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signOutFn = useCallback(async () => {
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
      if (currentUser) {
        try {
          await pushSave(currentUser.id, profileRef.current);
          await pushPublicStats(currentUser.id, profileRef.current);
        } catch (err) {
          console.warn("[account] final flush before signOut failed", err);
        }
        // Priority-Zero §5: drain the durable outbox so queued chapter
        // progress / tutorial completions / etc. reach the server BEFORE
        // the auth token clears. Bounded timeout so sign-out never hangs.
        try {
          const { flushOutboxWithTimeout } = await import("./offline/logout-flush");
          const res = await flushOutboxWithTimeout(currentUser.id, 4000);
          if (res.pendingAfter > 0) {
            console.warn("[account] signOut leaving pending outbox ops", res);
          }
        } catch (err) {
          console.warn("[account] logout-flush errored", err);
        }
      }

      const { resetNativePkceClient } = await import("@/lib/native-auth");
      
      // Atomic identity switch back to this device's guest space. The auth
      // listener also calls this (idempotent) — doing it here guarantees the
      // swap has completed before signOut() resolves, so no frame can render
      // the previous account's data.
      await resetForIdentityChange({ nextUserId: null, reason: "sign-out" });
      
      // V13 Bug 2: Nullify the native PKCE transport reference so the next 
      // login uses a fresh instance, avoiding "code verifier not found".
      resetNativePkceClient();

      await cloudSignOut();
      setUser(null);
      setAccount(null);
      setLastSyncAt(null);
    } catch (e) {
      console.error("[account] signOut error", e);
    } finally {
      setIsAuthResetting(false);
    }
  }, [user]);

  const syncNow = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    try {
      // Flush both cloud save (profile blob) and public stats (comparison projection)
      const [saveOk] = await Promise.all([
        pushSave(user.id, profileRef.current),
        pushPublicStats(user.id, profileRef.current)
      ]);
      if (saveOk) setLastSyncAt(Date.now());
      // Re-release the realtime guard if we just forced a push
      lastLocalChangeRef.current = 0;
      return saveOk;
    } finally {
      setSyncing(false);
    }
  }, [user]);

  const updateDisplayNameFn = useCallback<AccountCtx["updateDisplayName"]>(async (name) => {
    const r = await cloudUpdateDisplayName(name);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.value) {
      setAccount((prev) => prev ? { ...prev, display_name: r.value! } : prev);
      login(r.value);
    }
    return { ok: true };
  }, [login]);

  const updateUsernameFn = useCallback<AccountCtx["updateUsername"]>(async (username) => {
    const r = await cloudUpdateUsername(username);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.value) {
      setAccount((prev) => prev ? { ...prev, username: r.value! } : prev);
    }
    return { ok: true, value: r.value };
  }, []);

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
    signUp,
    signIn,
    signOut: signOutFn,
    syncNow,
    updateDisplayName: updateDisplayNameFn,
    updateUsername: updateUsernameFn,
    isUsernameAvailable: isUsernameAvailableFn,
  }), [user, account, displayName, loadingSession, syncing, isAuthResetting, lastSyncAt, signUp, signIn, signOutFn, syncNow, updateDisplayNameFn, updateUsernameFn, isUsernameAvailableFn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}