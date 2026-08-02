import { supabase } from "@/integrations/supabase/client";
import type { ProfileState } from "./profile";
import { levelFor } from "./app-constants";

// Phase 2 (Referrals removal): all referral-facing exports (REFERRAL_REWARDS,
// buildReferralLink, ReferralRow, listMyReferrals, fetchMyReferrer,
// claimSignupReferral, advanceReferralStage, fetchMyReferralCode) were
// deleted. Legacy RPCs remain callable but return a disabled response.
// The `referral_code` field on PublicProfile is retained as inactive
// legacy data — never populated for new users.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

// =========== Types ===========
// Public profile data exposed to other authenticated users. Sensitive fields
// (xp, dinars, streak, hearts, last_active, join_date, referral_code,
// account_status, marketing_opt_in, locale, referred_by) are intentionally
// NOT exposed here — they are owner-only or admin-only. The fields are kept
// as `?` so legacy call sites compile; for non-owner reads they are absent.
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  title: string | null;
  level: number;
  xp?: number;
  campaigns_completed: number;
  artifacts_collected: number;
  discovery_pct: number;
  favorite_state_id: string | null;
  favorite_figure_id: string | null;
  avatar_id: string | null;
  // Owner-only / unavailable through the public view.
  dinars?: number;
  streak?: number;
  referral_code?: string | null;
  last_active?: string;
  join_date?: string;
}


// Only safe, intentionally public columns. Backed by the
// `list_public_profiles` SECURITY DEFINER RPC (authenticated-only, curated
// column list) — never read from the base `profiles` table for non-owner
// queries, and never through a view that could widen the column set.
const PUBLIC_COLS =
  "id, username, display_name, bio, title, level, xp, campaigns_completed, artifacts_collected, discovery_pct, favorite_state_id, favorite_figure_id, avatar_id";

/** Allow-list of columns the public surface may ever expose. */
export const PUBLIC_PROFILE_COLUMNS = PUBLIC_COLS.split(",").map((c) => c.trim());

async function listPublicProfiles(args: {
  ids?: string[];
  username?: string;
  search?: string;
  excludeId?: string;
  limit?: number;
}): Promise<PublicProfile[]> {
  const { data, error } = await db.rpc("list_public_profiles", {
    p_ids: args.ids ?? null,
    p_username: args.username ?? null,
    p_search: args.search ?? null,
    p_exclude_id: args.excludeId ?? null,
    p_limit: args.limit ?? 20,
  });
  if (error) {
    console.error("[social] listPublicProfiles", error);
    return [];
  }
  return (data as PublicProfile[]) ?? [];
}

// =========== Public profile reads ===========
export async function fetchPublicProfileById(id: string): Promise<PublicProfile | null> {
  const rows = await listPublicProfiles({ ids: [id], limit: 1 });
  return rows[0] ?? null;
}

export async function fetchPublicProfileByUsername(username: string): Promise<PublicProfile | null> {
  const rows = await listPublicProfiles({ username, limit: 1 });
  return rows[0] ?? null;
}


/**
 * Friendship-gated profile fetchers. Returns the full public profile only
 * when the viewer is the same user or an accepted friend. For anyone else
 * the RPC returns NULL — enforced server-side in `get_gated_public_profile`.
 */
export async function fetchGatedProfileById(id: string): Promise<PublicProfile | null> {
  const { data } = await db.rpc("get_gated_public_profile", { p_user_id: id });
  return (data as PublicProfile | null) ?? null;
}

export async function fetchGatedProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data } = await db.rpc("get_gated_public_profile_by_username", { p_username: username });
  return (data as PublicProfile | null) ?? null;
}

/**
 * Owner-only helper for fetching the current user's referral code. Goes
 * through the `get_my_profile` SECURITY DEFINER RPC because direct SELECT
 * on private profile columns is no longer permitted to authenticated.
 */
/**
 * Search players by username OR display_name (case-insensitive, Arabic-safe).
 * Excludes the current user server-side. Deduplicates and caps at 20 results.
 */
export async function searchPlayers(q: string, excludeId?: string): Promise<PublicProfile[]> {
  const term = q.trim();
  if (!term) return [];
  // Treat input that looks like a UUID as a direct id lookup.
  if (term.length >= 32 && term.includes("-")) {
    const one = await fetchPublicProfileById(term);
    if (!one || (excludeId && one.id === excludeId)) return [];
    return [one];
  }
  const pattern = `%${term}%`;
  const rows = await listPublicProfiles({ search: pattern, excludeId, limit: 20 });

  const seen = new Set<string>();
  const out: PublicProfile[] = [];
  for (const p of rows) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}


// =========== Derive public stats from local profile ===========
export function derivePublicStats(p: ProfileState) {
  const lvl = levelFor(p.points);
  const have = p.charactersUnlocked.length + p.artifactsFound.length;
  const discovery = Math.min(100, have);
  // Use the committed hearts value (not the effective regenerated one) so the
  // server stores the same source-of-truth the client uses. Regeneration is
  // derived on read on both sides; pushing the effective value would
  // mis-anchor the timer.
  const hearts = Math.max(0, Math.min(5, Math.floor(p.hearts ?? 5)));
  return {
    bio: p.bio ?? "",
    title: p.titlesEarned?.[p.titlesEarned.length - 1] ?? lvl.title,
    level: lvl.level,
    xp: p.points,
    dinars: p.dinars ?? 0,
    hearts,
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
function emitFriendsUpdated() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:friends:updated"));
    }
  } catch { /* no-op */ }
}


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
  const { data: profiles } = await db.from(PUBLIC_VIEW).select(PUBLIC_COLS).in("id", otherIds);
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

  // Best-effort: notify the recipient via the existing notifications pipeline
  // (in-app banner + notification center entry + FCM push). Failure here must
  // not block the request itself.
  try {
    const me = await fetchPublicProfileById(meId);
    const senderName = me?.display_name?.trim() || me?.username || "صديق جديد";
    await db.functions.invoke("send-notification", {
      body: {
        title: "طلب صداقة جديد",
        body: `أرسل إليك ${senderName} طلب صداقة`,
        type: "friend_request",
        target_type: "user",
        target_user_id: otherId,
        deep_link: "/friends?tab=requests",
      },
    });
  } catch {
    // Silently ignore; the friendship row is the source of truth and the
    // recipient's poller will surface the request on next tick.
  }

  emitFriendsUpdated();
  return { ok: true };
}


export async function acceptFriend(id: string): Promise<boolean> {
  // Read the row first so we know who the original requester was.
  const { data: existing } = await db
    .from("friendships")
    .select("id,requester,user_a,user_b,status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.from("friendships").update({ status: "accepted" }).eq("id", id);
  if (error) return false;

  // Notify the original requester (in-app banner + center entry + FCM push).
  try {
    const row = existing as { requester?: string; user_a?: string; user_b?: string } | null;
    const requester = row?.requester ?? null;
    if (requester) {
      const { data: sess } = await db.auth.getSession();
      const meId = sess.session?.user?.id ?? null;
      if (meId && requester !== meId) {
        const me = await fetchPublicProfileById(meId);
        const myName = me?.display_name?.trim() || me?.username || "صديقك";
        await db.functions.invoke("send-notification", {
          body: {
            title: "تم قبول طلب الصداقة",
            body: `تم قبول طلب صداقتك من ${myName}`,
            type: "friend_accepted",
            target_type: "user",
            target_user_id: requester,
            deep_link: "/friends?tab=requests",
          },
        });
      }
    }
  } catch {
    // Best-effort only — acceptance still succeeded.
  }

  emitFriendsUpdated();
  return true;
}

export async function removeFriend(id: string): Promise<boolean> {
  const { error } = await db.from("friendships").delete().eq("id", id);
  if (!error) emitFriendsUpdated();
  return !error;

}

// =========== Referrals (Phase 2 removal) ===========
// All referral APIs (ReferralRow, listMyReferrals, fetchMyReferrer,
// claimSignupReferral, advanceReferralStage, REFERRAL_REWARDS,
// buildReferralLink, fetchMyReferralCode) were removed in Phase 2. Legacy
// RPCs (redeem_referral_code, my_referral_stats,
// claim_signup_referral_rewards, advance_referral_stage,
// grant_level5_reward) still exist server-side but return a disabled
// response and perform no writes. Do not re-introduce clients here.


// =========== Global Leaderboard ===========
export interface LeaderboardRow {
  rank: number;
  id: string;
  username: string;
  display_name: string | null;
  avatar_id: string | null;
  level: number;
  xp: number;
  is_me: boolean;
  is_friend: boolean;
  // Populated by the extensible RPCs; legacy shims leave them undefined.
  score?: number;
  metric?: string;
  timeframe?: string;
  period_key?: string | null;
}

/**
 * Whitelisted ranking metrics — backend `leaderboard_resolve_metric` falls back
 * to "xp" for anything outside this set, so adding a new metric requires both
 * a UI entry here and a DB whitelist entry.
 */
export type LeaderboardMetric =
  | "xp"
  | "level"
  | "campaigns"
  | "museum"
  | "investigations"
  | "streak"
  | "longest_streak"
  | "discovery";

/** Supported timeframes. `alltime` reads live profiles; others read snapshots. */
export type LeaderboardTimeframe = "alltime" | "weekly" | "monthly" | "seasonal" | "custom";

export interface LeaderboardQuery {
  metric?: LeaderboardMetric;
  timeframe?: LeaderboardTimeframe;
  periodKey?: string | null;
}

/** Generic top-N query supporting any metric/timeframe combination. */
export async function fetchLeaderboardTop(
  q: LeaderboardQuery = {},
  limit = 50,
  offset = 0,
): Promise<LeaderboardRow[]> {
  const { data } = await (db as any).rpc("leaderboard_top", {
    p_metric: q.metric ?? "xp",
    p_timeframe: q.timeframe ?? "alltime",
    p_period_key: q.periodKey ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  return (data as LeaderboardRow[]) ?? [];
}

/** Generic "rows around me" query for any metric/timeframe combination. */
export async function fetchLeaderboardAround(
  q: LeaderboardQuery = {},
  window = 3,
): Promise<LeaderboardRow[]> {
  const { data } = await (db as any).rpc("leaderboard_around", {
    p_metric: q.metric ?? "xp",
    p_timeframe: q.timeframe ?? "alltime",
    p_period_key: q.periodKey ?? null,
    p_window: window,
  });
  return (data as LeaderboardRow[]) ?? [];
}

// Legacy shims kept for current Friends UI — route through the extensible RPCs.
export async function fetchGlobalLeaderboard(limit = 50, offset = 0): Promise<LeaderboardRow[]> {
  return fetchLeaderboardTop({ metric: "xp", timeframe: "alltime" }, limit, offset);
}

export async function fetchLeaderboardAroundMe(window = 3): Promise<LeaderboardRow[]> {
  return fetchLeaderboardAround({ metric: "xp", timeframe: "alltime" }, window);
}


// =========== Generic unread badges ===========
export interface PendingBadges {
  friend_requests: number;
  notifications: number;
  total: number;
  [key: string]: number;
}

export async function fetchPendingBadges(): Promise<PendingBadges> {
  const { data } = await db.rpc("my_pending_badges");
  const v = (data as Partial<PendingBadges> | null) ?? {};
  return {
    friend_requests: Number(v.friend_requests ?? 0),
    notifications: Number(v.notifications ?? 0),
    total: Number(v.total ?? 0),
    ...v,
  } as PendingBadges;
}
