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

export async function fetchAccountProfile(userId: string): Promise<AccountProfile | null> {
  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name, join_date, last_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[cloud-save] fetchAccountProfile", error);
    return null;
  }
  if (!data) return null;
  const { data: emailVal } = await db.rpc("get_my_email");
  return { ...(data as Omit<AccountProfile, "email">), email: (emailVal as string | null) ?? null };
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

export async function signUpWithEmail(args: { email: string; password: string; username: string; referralCode?: string }) {
  const { email, password, username, referralCode } = args;
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        username: username.trim(),
        ...(referralCode ? { referral_code: referralCode.trim().toUpperCase() } : {}),
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