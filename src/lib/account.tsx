import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAccountProfile,
  fetchCloudSave,
  hasLocalProgress,
  pushSave,
  signInWithEmail,
  signOut as cloudSignOut,
  signUpWithEmail,
  touchLastActive,
  type AccountProfile,
} from "./cloud-save";
import { useProfile, type ProfileState } from "./profile";
import { pushPublicStats, claimSignupReferral, REFERRAL_REWARDS } from "./social";

export type ConflictChoice = "local" | "cloud";

interface PendingConflict {
  localSnapshot: ProfileState;
  cloudSnapshot: ProfileState;
}

interface AccountCtx {
  user: User | null;
  account: AccountProfile | null;
  loadingSession: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  conflict: PendingConflict | null;
  signUp: (args: { email: string; password: string; username: string; referralCode?: string }) => Promise<{ ok: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<boolean>;
  resolveConflict: (choice: ConflictChoice) => Promise<void>;
  dismissConflict: () => void;
}

const Ctx = createContext<AccountCtx | null>(null);

const PUSH_DEBOUNCE_MS = 1500;

export function AccountProvider({ children }: { children: ReactNode }) {
  const { profile, replaceProfile, addDinars, awardBadge } = useProfile();
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);

  // Block auto-push while we're resolving a conflict or initial hydration.
  const autoPushEnabled = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // ============ Initial session + auth state listener ============
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoadingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "SIGNED_OUT") {
        autoPushEnabled.current = false;
        setAccount(null);
        setConflict(null);
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
      setSyncing(true);
      try {
        const [acc, save] = await Promise.all([
          fetchAccountProfile(user.id),
          fetchCloudSave(user.id),
        ]);
        if (cancelled) return;
        setAccount(acc);
        void touchLastActive(user.id);

        // One-time signup referral rewards (idempotent server-side).
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

        const localSnap = profileRef.current;
        if (!save) {
          // No cloud save yet — push current local progress as the seed.
          await pushSave(user.id, localSnap);
          autoPushEnabled.current = true;
          setLastSyncAt(Date.now());
        } else if (hasLocalProgress(localSnap)) {
          // Both exist → ask the user which to keep.
          setConflict({ localSnapshot: localSnap, cloudSnapshot: save.data });
        } else {
          // Local is empty/fresh — restore cloud automatically.
          replaceProfile(save.data);
          autoPushEnabled.current = true;
          setLastSyncAt(Date.now());
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ============ Debounced auto-push while signed in ============
  useEffect(() => {
    if (!user || !autoPushEnabled.current) return;
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

  const signUp = useCallback<AccountCtx["signUp"]>(async ({ email, password, username, referralCode }) => {
    const u = username.trim();
    if (u.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً" };
    if (password.length < 6) return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" };
    const { data, error } = await signUpWithEmail({ email, password, username: u, referralCode });
    if (error) return { ok: false, error: error.message };
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

  const resolveConflict = useCallback<AccountCtx["resolveConflict"]>(async (choice) => {
    if (!user || !conflict) return;
    setSyncing(true);
    try {
      if (choice === "local") {
        await pushSave(user.id, conflict.localSnapshot);
      } else {
        replaceProfile(conflict.cloudSnapshot);
      }
      autoPushEnabled.current = true;
      setLastSyncAt(Date.now());
      setConflict(null);
    } finally {
      setSyncing(false);
    }
  }, [user, conflict, replaceProfile]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  const value = useMemo<AccountCtx>(() => ({
    user,
    account,
    loadingSession,
    syncing,
    lastSyncAt,
    conflict,
    signUp,
    signIn,
    signOut: signOutFn,
    syncNow,
    resolveConflict,
    dismissConflict,
  }), [user, account, loadingSession, syncing, lastSyncAt, conflict, signUp, signIn, signOutFn, syncNow, resolveConflict, dismissConflict]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}