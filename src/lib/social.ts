import { supabase } from "@/integrations/supabase/client";
import type { ProfileState } from "./profile";
import { levelFor } from "./app-constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

// =========== Types ===========
export interface PublicProfile {
  id: string;
  username: string;
  bio: string | null;
  title: string | null;
  level: number;
  xp: number;
  dinars: number;
  streak: number;
  campaigns_completed: number;
  artifacts_collected: number;
  discovery_pct: number;
  favorite_state_id: string | null;
  favorite_figure_id: string | null;
  avatar_id: string | null;
  referral_code: string | null;
  last_active: string;
  join_date: string;
}

const PUBLIC_COLS =
  "id, username, bio, title, level, xp, dinars, streak, campaigns_completed, artifacts_collected, discovery_pct, favorite_state_id, favorite_figure_id, avatar_id, referral_code, last_active, join_date";

// =========== Public profile reads ===========
export async function fetchPublicProfileById(id: string): Promise<PublicProfile | null> {
  const { data } = await db.from("profiles").select(PUBLIC_COLS).eq("id", id).maybeSingle();
  return (data as PublicProfile) ?? null;
}

export async function fetchPublicProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data } = await db.from("profiles").select(PUBLIC_COLS).ilike("username", username).maybeSingle();
  return (data as PublicProfile) ?? null;
}

export async function fetchPublicProfileByReferral(code: string): Promise<PublicProfile | null> {
  const { data } = await db.from("profiles").select(PUBLIC_COLS).eq("referral_code", code.toUpperCase()).maybeSingle();
  return (data as PublicProfile) ?? null;
}

export async function searchPlayers(q: string): Promise<PublicProfile[]> {
  const term = q.trim();
  if (!term) return [];
  // By id (UUID-ish)
  if (term.length >= 32 && term.includes("-")) {
    const one = await fetchPublicProfileById(term);
    return one ? [one] : [];
  }
  const { data } = await db
    .from("profiles")
    .select(PUBLIC_COLS)
    .ilike("username", `%${term}%`)
    .limit(20);
  return (data as PublicProfile[]) ?? [];
}

// =========== Derive public stats from local profile ===========
export function derivePublicStats(p: ProfileState) {
  const lvl = levelFor(p.points);
  const have = p.charactersUnlocked.length + p.artifactsFound.length;
  const discovery = Math.min(100, have);
  return {
    bio: p.bio ?? "",
    title: p.titlesEarned?.[p.titlesEarned.length - 1] ?? lvl.title,
    level: lvl.level,
    xp: p.points,
    dinars: p.dinars ?? 0,
    streak: p.streak,
    campaigns_completed: p.campaignsCompleted.length,
    artifacts_collected: p.artifactsFound.length,
    discovery_pct: discovery,
    favorite_state_id: p.favoriteStateId || null,
    favorite_figure_id: p.favoriteFigureId || null,
    avatar_id: p.avatarId || null,
  };
}

export async function pushPublicStats(userId: string, p: ProfileState): Promise<void> {
  const stats = derivePublicStats(p);
  // Route through SECURITY DEFINER RPC; direct UPDATE on economy columns is revoked.
  await db.rpc("sync_my_public_stats", { p_stats: stats as never });
}

// =========== Friendships ===========
export interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
  requester: string;
  status: "pending" | "accepted";
  created_at: string;
}

export interface FriendEntry {
  row: FriendshipRow;
  other: PublicProfile;
  direction: "incoming" | "outgoing" | "accepted";
}

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function listFriendships(userId: string): Promise<FriendEntry[]> {
  const { data: rows } = await db
    .from("friendships")
    .select("*")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  const list = (rows as FriendshipRow[]) ?? [];
  if (!list.length) return [];
  const otherIds = list.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  const { data: profiles } = await db.from("profiles").select(PUBLIC_COLS).in("id", otherIds);
  const byId: Record<string, PublicProfile> = {};
  for (const p of (profiles as PublicProfile[]) ?? []) byId[p.id] = p;
  return list
    .map((r) => {
      const otherId = r.user_a === userId ? r.user_b : r.user_a;
      const other = byId[otherId];
      if (!other) return null;
      const direction: FriendEntry["direction"] =
        r.status === "accepted" ? "accepted" : r.requester === userId ? "outgoing" : "incoming";
      return { row: r, other, direction };
    })
    .filter(Boolean) as FriendEntry[];
}

/**
 * Look up the friendship row between the current user and another user, if any.
 * Returns the row plus the perspective ("incoming" = other sent to me,
 * "outgoing" = I sent to other, "accepted" = friends, null = none).
 */
export async function getFriendshipWith(
  meId: string,
  otherId: string,
): Promise<{ row: FriendshipRow; direction: FriendEntry["direction"] } | null> {
  if (meId === otherId) return null;
  const [a, b] = orderPair(meId, otherId);
  const { data } = await db
    .from("friendships")
    .select("*")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();
  const row = (data as FriendshipRow | null) ?? null;
  if (!row) return null;
  const direction: FriendEntry["direction"] =
    row.status === "accepted" ? "accepted" : row.requester === meId ? "outgoing" : "incoming";
  return { row, direction };
}

export async function sendFriendRequest(meId: string, otherId: string): Promise<{ ok: boolean; error?: string }> {
  if (meId === otherId) return { ok: false, error: "لا يمكنك إضافة نفسك" };
  const [a, b] = orderPair(meId, otherId);
  const { error } = await db
    .from("friendships")
    .insert({ user_a: a, user_b: b, requester: meId, status: "pending" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function acceptFriend(id: string): Promise<boolean> {
  const { error } = await db.from("friendships").update({ status: "accepted" }).eq("id", id);
  return !error;
}

export async function removeFriend(id: string): Promise<boolean> {
  const { error } = await db.from("friendships").delete().eq("id", id);
  return !error;
}

// =========== Referrals ===========
export interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  code: string;
  stage: number;
  stage1_at: string | null;
  stage2_at: string | null;
  stage3_at: string | null;
  stage4_at: string | null;
  created_at: string;
}

export async function listMyReferrals(userId: string): Promise<{ row: ReferralRow; friend: PublicProfile | null }[]> {
  const { data: rows } = await db
    .from("referrals")
    .select("*")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });
  const list = (rows as ReferralRow[]) ?? [];
  if (!list.length) return [];
  const ids = list.map((r) => r.referred_id);
  const { data: profiles } = await db.from("profiles").select(PUBLIC_COLS).in("id", ids);
  const byId: Record<string, PublicProfile> = {};
  for (const p of (profiles as PublicProfile[]) ?? []) byId[p.id] = p;
  return list.map((r) => ({ row: r, friend: byId[r.referred_id] ?? null }));
}

export async function fetchMyReferrer(userId: string): Promise<ReferralRow | null> {
  const { data } = await db.from("referrals").select("*").eq("referred_id", userId).maybeSingle();
  return (data as ReferralRow) ?? null;
}

export async function claimSignupReferral(): Promise<{ ok: boolean; referrer_id?: string }> {
  const { data, error } = await db.rpc("claim_signup_referral_rewards");
  if (error || !data?.ok) return { ok: false };
  return { ok: true, referrer_id: data.referrer_id };
}

export async function advanceReferralStage(stage: 2 | 3 | 4, p: ProfileState): Promise<{ ok: boolean }> {
  // Sync server-side stats first so the RPC can verify eligibility against profiles.*
  try { await pushPublicStats((await db.auth.getUser()).data.user?.id ?? "", p); } catch { /* ignore */ }
  const { data } = await db.rpc("advance_referral_stage", { p_stage: stage });
  return { ok: !!data?.ok };
}

// =========== Stage reward definitions (client applies to local profile) ===========
export const REFERRAL_REWARDS = {
  newPlayer: { dinars: 100, badge: "welcome_irth" },
  stage1: { dinars: 50 }, // referrer when friend registers
  stage2: { dinars: 100, artifact: "ref_artifact_lantern" }, // friend reaches L5
  stage3: { badge: "ref_carrier", title: "حامل الإرث" }, // friend finishes first campaign
  stage4: { title: "ناشر الإرث" }, // friend stays active 7 days
} as const;

export function buildReferralLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://irth-app.lovable.app";
  return `${origin}/auth?ref=${encodeURIComponent(code)}`;
}