import { supabase } from "@/integrations/supabase/client";
import type { ProfileState } from "./profile";

/**
 * Cloud Save module — Accounts & Cloud Save v1
 *
 * Storage model:
 *   - `public.profiles`: per-user identity (username, email, join, last_active)
 *   - `public.cloud_saves`: single JSONB row per user holding the full
 *     `ProfileState` snapshot (level/xp, dinars, hearts, streak, badges,
 *     artifacts, museum, campaigns, investigations, season, encyclopedia
 *     discovery, bio, favorites, etc.).
 *
 * Sync strategy:
 *   - On login: fetch cloud save and let the caller resolve conflict
 *     against the current local snapshot.
 *   - After resolution: subsequent local mutations are mirrored to cloud
 *     via `pushSave()` (debounced upstream).
 *
 * The module is intentionally untyped against the generated `Database` so
 * new game-state fields can be added without regenerating types.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

export interface AccountProfile {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  join_date: string;
  last_active: string;
}

export interface CloudSaveRow {
  user_id: string;
  data: ProfileState;
  client_updated_at: string | null;
  updated_at: string;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function fetchAccountProfile(_userId: string): Promise<AccountProfile | null> {
  // Direct SELECT on private profile columns (join_date, last_active) is no
  // longer permitted for authenticated; go through the owner-only RPC.
  const { data, error } = await db.rpc("get_my_profile");
  if (error) {
    console.error("[cloud-save] fetchAccountProfile", error);
    return null;
  }
  if (!data) return null;
  const row = data as { id: string; username: string; display_name: string | null; join_date: string; last_active: string };
  const { data: emailVal } = await db.rpc("get_my_email");
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    join_date: row.join_date,
    last_active: row.last_active,
    email: (emailVal as string | null) ?? null,
  };
}


/** Update display_name via RPC (auth-only, doesn't touch other columns). */
export async function updateDisplayName(name: string): Promise<{ ok: boolean; value?: string; error?: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "الاسم لا يمكن أن يكون فارغاً" };
  const { data, error } = await db.rpc("set_my_display_name", { p_name: clean });
  if (error) return { ok: false, error: error.message };
  // Best-effort: also mirror to auth user metadata.
  try {
    await supabase.auth.updateUser({ data: { display_name: clean, full_name: clean } });
  } catch { /* ignore */ }
  return { ok: true, value: (data as string) ?? clean };
}

/**
 * Validate (client-side) and persist a new username. Returns friendly
 * Arabic errors. The server is the source of truth — the same checks run
 * in `public.set_my_username` and the response message maps known codes
 * back to user-friendly Arabic.
 */
const USERNAME_PATTERN = /^[A-Za-z0-9_.\-\u0600-\u06FF]+$/;

export function validateUsernameLocal(value: string): { ok: boolean; error?: string; clean?: string } {
  const clean = value.trim();
  if (!clean) return { ok: false, error: "اسم المستخدم لا يمكن أن يكون فارغاً" };
  if (clean.length < 3) return { ok: false, error: "اسم المستخدم قصير جداً (٣ أحرف على الأقل)" };
  if (clean.length > 24) return { ok: false, error: "اسم المستخدم طويل جداً (٢٤ حرفاً كحد أقصى)" };
  if (!USERNAME_PATTERN.test(clean)) return { ok: false, error: "حروف غير مسموح بها — استخدم الحروف والأرقام و . _ -" };
  return { ok: true, clean };
}

export async function isUsernameAvailable(value: string): Promise<boolean> {
  const v = validateUsernameLocal(value);
  if (!v.ok || !v.clean) return false;
  const { data, error } = await db.rpc("is_username_available", { p_username: v.clean });
  if (error) return false;
  return data === true;
}

export async function updateUsername(value: string): Promise<{ ok: boolean; value?: string; error?: string }> {
  const v = validateUsernameLocal(value);
  if (!v.ok || !v.clean) return { ok: false, error: v.error };
  const { data, error } = await db.rpc("set_my_username", { p_username: v.clean });
  if (error) {
    const code = String(error.message ?? "");
    const map: Record<string, string> = {
      username_taken: "اسم المستخدم مستخدم بالفعل",
      username_too_short: "اسم المستخدم قصير جداً",
      username_too_long: "اسم المستخدم طويل جداً",
      username_invalid_chars: "حروف غير مسموح بها",
      empty_username: "اسم المستخدم فارغ",
      unauthenticated: "يجب تسجيل الدخول",
    };
    const friendly = Object.entries(map).find(([k]) => code.includes(k))?.[1];
    return { ok: false, error: friendly ?? "تعذّر تغيير اسم المستخدم" };
  }
  return { ok: true, value: (data as string) ?? v.clean };
}


export async function touchLastActive(userId: string): Promise<void> {
  await db.from("profiles").update({ last_active: new Date().toISOString() }).eq("id", userId);
}

export async function fetchCloudSave(userId: string): Promise<CloudSaveRow | null> {
  const { data, error } = await db
    .from("cloud_saves")
    .select("user_id, data, client_updated_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[cloud-save] fetchCloudSave", error);
    return null;
  }
  return (data as CloudSaveRow) ?? null;
}

export async function pushSave(userId: string, profile: ProfileState): Promise<boolean> {
  const payload = {
    user_id: userId,
    data: profile,
    client_updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("cloud_saves").upsert(payload, { onConflict: "user_id" });
  if (error) {
    console.error("[cloud-save] pushSave", error);
    return false;
  }
  return true;
}

export async function signUpWithEmail(args: { email: string; password: string; username: string; displayName?: string }) {
  const { email, password, username, displayName } = args;
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
  const name = (displayName ?? username).trim();

  // Phase 2 (Referrals removal): `referralCode` was removed from the signup
  // contract. Auth email pipelines no longer propagate a referral code.
  const mode = ((import.meta.env.VITE_AUTH_EMAIL_MODE as string | undefined) ?? "custom").toLowerCase();
  if (mode === "custom") {
    const { requestSignupEmail } = await import("@/lib/auth-emails");
    try {
      await requestSignupEmail({
        email: email.trim(),
        password,
        username: username.trim(),
        displayName: name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: { user: null, session: null }, error: { message } as { message: string } };
    }
    return { data: { user: null, session: null }, error: null };
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        username: username.trim(),
        display_name: name,
        full_name: name,
      },
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/** Lightweight "is local progress meaningful enough to ask about?" heuristic. */
export function hasLocalProgress(p: ProfileState): boolean {
  return (
    p.points > 0 ||
    p.streak > 0 ||
    p.storiesRead.length > 0 ||
    p.campaignsCompleted.length > 0 ||
    p.investigationsCompleted.length > 0 ||
    p.missionsCompleted.length > 0 ||
    p.artifactsFound.length > 0 ||
    p.charactersUnlocked.length > 0 ||
    p.badges.length > 0 ||
    p.titlesEarned.length > 0
  );
}