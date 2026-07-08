import { supabase } from "@/integrations/supabase/client";
import type { GameMode, GameStatus } from "./types";

// Stable daily seed (UTC date). Same number for everyone on the same day.
function dailySeed(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

// Deterministic hash combining the daily seed with a stable per-item key.
function dayHash(key: string): number {
  let h = dailySeed() >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

export interface GameRow {
  id: string;
  slug: string;
  mode: GameMode;
  title: string;
  description: string | null;
  difficulty: number;
  estimated_time: number;
  xp_reward: number;
  coin_reward: number;
  hearts_penalty: number;
  related_entities: string[];
  metadata: Record<string, unknown>;
  stages: unknown[];
  status: GameStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "id, slug, mode, title, description, difficulty, estimated_time, xp_reward, coin_reward, hearts_penalty, related_entities, metadata, stages, status, published_at, created_at, updated_at";

export async function listGamesByMode(
  mode: GameMode,
): Promise<{ rows: GameRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("games")
    .select(SELECT_COLS)
    .eq("mode", mode)
    .order("updated_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as GameRow[], error: null };
}

export async function listPublishedGames(): Promise<GameRow[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];
  const { data } = await supabase
    .from("games")
    .select(SELECT_COLS)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []) as unknown as GameRow[];
}

export async function listPublishedGamesByMode(
  mode: GameMode,
): Promise<GameRow[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];
  const { data } = await supabase
    .from("games")
    .select(SELECT_COLS)
    .eq("mode", mode)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []) as unknown as GameRow[];
}

export async function getGameBySlug(slug: string): Promise<GameRow | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const { data } = await supabase
    .from("games")
    .select(SELECT_COLS)
    .eq("slug", slug)
    .maybeSingle();
  return (data as unknown as GameRow) ?? null;
}

// Daily picks — deterministic per day so all players see the same featured.
export function pickDailyFeatured<T>(items: T[], count = 2): T[] {
  if (!items.length) return [];
  const day = new Date();
  const seed =
    day.getUTCFullYear() * 10000 + (day.getUTCMonth() + 1) * 100 + day.getUTCDate();
  const out: T[] = [];
  const used = new Set<number>();
  let s = seed;
  while (out.length < Math.min(count, items.length)) {
    s = (s * 9301 + 49297) % 233280;
    const idx = s % items.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(items[idx]);
  }
  return out;
}

export async function fetchDailyFeaturedGames(count = 2): Promise<GameRow[]> {
  const published = await listPublishedGames();
  return pickDailyFeatured(published, count);
}

// Fetch ids of games the current player already completed. Returns empty set
// if not signed in or on error — daily picks should still work for guests.
export async function fetchMyCompletedGameIds(): Promise<Set<string>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new Set();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return new Set();
  const { data } = await supabase
    .from("game_progress")
    .select("game_id, completed")
    .eq("user_id", uid)
    .eq("completed", true);
  return new Set(((data ?? []) as Array<{ game_id: string }>).map((r) => r.game_id));
}

/**
 * Fetch game_ids the player has completed *today* (UTC — matches the
 * deterministic UTC-day daily pick seed). This is what the Home / Adventure
 * "Daily Challenge" surface uses to decide whether today's picks are done.
 * An older completion of a game that happens to be today's pick must NOT
 * mark the challenge as already-completed for today: the daily reset must
 * make the challenge playable again the moment the calendar day rolls over.
 */
export async function fetchMyDailyCompletedGameIds(): Promise<Set<string>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new Set();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return new Set();
  const now = new Date();
  const startOfDayUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )).toISOString();
  const { data } = await supabase
    .from("game_progress")
    .select("game_id, completed, last_played_at")
    .eq("user_id", uid)
    .eq("completed", true)
    .gte("last_played_at", startOfDayUtc);
  return new Set(((data ?? []) as Array<{ game_id: string }>).map((r) => r.game_id));
}

/**
 * Pick daily challenges for the Home / Adventure screens.
 *
 * Selection rules (in order):
 *   1. Stable per UTC day — same picks across reloads, same for all players.
 *   2. ALWAYS from distinct game modes (sample without replacement on mode).
 *   3. If fewer modes exist than `count`, returns fewer picks (never duplicates a mode).
 *   4. Completed games still appear — callers render a "completed" badge instead
 *      of hiding the card, so the player sees today's pair until the daily reset.
 */
export interface DailyChallengeSelection {
  picks: GameRow[];
  allCompleted: boolean;
  totalPublished: number;
}

export async function selectDailyChallenges(
  count = 2,
  opts: { completedIds?: Set<string> } = {},
): Promise<DailyChallengeSelection> {
  const published = await listPublishedGames();
  const totalPublished = published.length;
  if (!totalPublished) {
    return { picks: [], allCompleted: false, totalPublished: 0 };
  }

  // Group by mode so we can sample without replacement on game type.
  const byMode = new Map<GameMode, GameRow[]>();
  for (const g of published) {
    const arr = byMode.get(g.mode) ?? [];
    arr.push(g);
    byMode.set(g.mode, arr);
  }

  // Deterministic mode order per day, then deterministic pick within each mode.
  const modes = [...byMode.keys()].sort(
    (a, b) => dayHash(`mode:${a}`) - dayHash(`mode:${b}`),
  );

  const picks: GameRow[] = [];
  for (const m of modes) {
    if (picks.length >= count) break;
    const games = byMode.get(m)!;
    const chosen = [...games].sort(
      (a, b) => dayHash(a.slug) - dayHash(b.slug),
    )[0];
    if (chosen) picks.push(chosen);
  }

  const completed = opts.completedIds ?? new Set<string>();
  const allCompleted =
    picks.length > 0 && picks.every((g) => completed.has(g.id));

  return { picks, allCompleted, totalPublished };
}
