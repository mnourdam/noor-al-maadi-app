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
  type AccountProfile,
} from "./cloud-save";
import { useProfile, type ProfileState } from "./profile";
import { pushPublicStats, claimSignupReferral, REFERRAL_REWARDS } from "./social";
import { androidMark, androidMeasure, isAndroidUltraStableMode, recordAndroidAction } from "./androidFreezeDiagnostics";

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
}

const Ctx = createContext<AccountCtx | null>(null);

const PUSH_DEBOUNCE_MS = 1500;

export function AccountProvider({ children }: { children: ReactNode }) {
  const androidStable = isAndroidUltraStableMode();
  const { profile, replaceProfile, addDinars, awardBadge, login, resetProfile } = useProfile();
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

        const localSnap = profileRef.current;
        if (!save) {
          // No cloud save yet — push current local progress as the seed.
          if (androidStable) {
            autoPushEnabled.current = false;
          } else {
            await pushSave(user.id, localSnap);
            autoPushEnabled.current = true;
            setLastSyncAt(Date.now());
          }
        } else {
          // Cloud is authoritative — silently restore the latest cloud save.
          // Manual sync is still available from the account settings.
          replaceProfile(save.data);
          autoPushEnabled.current = true;
          setLastSyncAt(Date.now());
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
        .finally(() => setSyncing(false));
    }, PUSH_DEBOUNCE_MS);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [profile, user]);

  const signUp = useCallback<AccountCtx["signUp"]>(async ({ email, password, username, displayName, referralCode }) => {
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً" };
    if (password.length < 6) return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
    const { data, error } = await signUpWithEmail({ email, password, username: u, displayName, referralCode });
    if (error) return { ok: false, error: error.message };
    // Client-side fallback: if a session was returned, upsert display_name immediately.
    if (data.session?.user) {
      const name = (displayName ?? u).trim();
      try { await cloudUpdateDisplayName(name); } catch { /* ignore */ }
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
    autoPushEnabled.current = false;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    await cloudSignOut();
  }, []);

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
  }), [user, account, displayName, loadingSession, syncing, lastSyncAt, signUp, signIn, signOutFn, syncNow, updateDisplayNameFn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}