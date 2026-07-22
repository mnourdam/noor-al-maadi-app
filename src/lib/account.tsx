import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { pushPublicStats, claimSignupReferral, REFERRAL_REWARDS } from "./social";
import { androidMark, androidMeasure, isAndroidUltraStableMode, recordAndroidAction } from "./androidFreezeDiagnostics";
import { flushOutbox } from "./offline/flush";

interface AccountCtx {
  user: User | null;
  account: AccountProfile | null;
  displayName: string;
  loadingSession: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  signUp: (args: { email: string; password: string; username: string; displayName?: string; referralCode?: string }) => Promise<{ ok: boolean; error?: string }>;
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
  const { profile, mergeCloudSave, applyServerStats, addDinars, awardBadge, login, resetProfile, hydrateClaimedStreakRewards } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

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
  useEffect(() => {
    let alive = true;
    androidMark("account.session.start");
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      recordAndroidAction("account.session.resolved", { hasUser: !!data.session?.user });
      setUser(data.session?.user ?? null);
      setLoadingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "SIGNED_OUT") {
        autoPushEnabled.current = false;
        setAccount(null);
        setLastSyncAt(null);
        // Clear cached profile (XP, dinars, hearts, name) so UI returns to guest state.
        try { resetProfileRef.current?.(); } catch { /* ignore */ }
        try {
          if (typeof localStorage !== "undefined") {
            // Strip user-scoped keys that survive the profile reset and the
            // stored profile snapshot itself, so the NEXT sign-in cannot
            // inherit the previous user's XP/coins/progress.
            localStorage.removeItem("hakaya.profile.v2");
            localStorage.removeItem("hakaya.profile.userId");
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("irth.refclaim.")) localStorage.removeItem(k);
            }
          }
        } catch { /* ignore */ }
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
    let cancelled = false;

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
      const started = performance.now();
      androidMark("account.hydrate.start", { userId: user.id.slice(0, 8) });
      setSyncing(true);
      try {
        const [acc, save] = await Promise.all([
          fetchAccountProfile(user.id),
          fetchCloudSave(user.id),
        ]);
        if (cancelled) return;
        setAccount(acc);
        if (!androidStable) void touchLastActive(user.id);

        // One-time signup referral rewards (idempotent server-side).
        if (!androidStable) {
          try {
            const claim = await claimSignupReferral();
            if (claim.ok) {
              const flagKey = `irth.refclaim.${user.id}`;
              if (!localStorage.getItem(flagKey)) {
                addDinars(REFERRAL_REWARDS.newPlayer.dinars);
                awardBadge(REFERRAL_REWARDS.newPlayer.badge);
                localStorage.setItem(flagKey, "1");
              }
            }
          } catch { /* ignore */ }
        }

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
            sticky = Array.from(await fetchServerCompletedIds());
          } catch { /* offline / transient — proceed without ledger */ }
          mergeCloudSave(save.data, { stickyCampaignIds: sticky });
          autoPushEnabled.current = true;
          setLastSyncAt(Date.now());
        }

        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(LAST_USER_KEY, user.id);
          }
        } catch { /* ignore */ }
        // Merge server-side streak reward claims so they can never be
        // re-claimed after a fresh install / cloud restore.
        try { await hydrateClaimedStreakRewards(); } catch { /* noop */ }
        // Tutorial server mirror — reconcile local ⇄ server so a
        // reinstalled/second-device authenticated user does not replay
        // the tour. Priority-Zero (2026-07).
        try {
          const { hydrateOnboardingFromServer } = await import("@/lib/tutorial/persistence");
          await hydrateOnboardingFromServer("irth-first-time");
        } catch { /* silent — engine has bounded local fallback */ }

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
      } finally {
        androidMeasure("account.hydrate", started);
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
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
    if (!user || !autoPushEnabled.current) return;
    if (androidStable) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
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
        if (!autoPushEnabled.current) return;
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
        if (cancelled || error || !data) return;
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




  const signUp = useCallback<AccountCtx["signUp"]>(async ({ email, password, username, displayName, referralCode }) => {
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً" };
    if (password.length < 8) return { ok: false, error: "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" };
    const { data, error } = await signUpWithEmail({ email, password, username: u, displayName, referralCode });
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
    await cloudSignOut();
    setUser(null);
    setAccount(null);
    setLastSyncAt(null);
    try { resetProfileRef.current?.(); } catch { /* ignore */ }
  }, [user]);

  const syncNow = useCallback(async () => {
    if (!user) return false;
    setSyncing(true);
    try {
      const ok = await pushSave(user.id, profileRef.current);
      if (ok) setLastSyncAt(Date.now());
      return ok;
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
    lastSyncAt,
    signUp,
    signIn,
    signOut: signOutFn,
    syncNow,
    updateDisplayName: updateDisplayNameFn,
    updateUsername: updateUsernameFn,
    isUsernameAvailable: isUsernameAvailableFn,
  }), [user, account, displayName, loadingSession, syncing, lastSyncAt, signUp, signIn, signOutFn, syncNow, updateDisplayNameFn, updateUsernameFn, isUsernameAvailableFn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}