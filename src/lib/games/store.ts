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
  const { data } = await supabase
    .from("games")
    .select(SELECT_COLS)
    .eq("mode", mode)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []) as unknown as GameRow[];
}

export async function getGameBySlug(slug: string): Promise<GameRow | null> {
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
 * Pick daily challenges for the Home screen.
 *
 * Selection rules (in order):
 *   1. Only games not completed by this player (when `excludeIds` provided).
 *   2. Stable deterministic order per UTC day (same picks across reloads).
 *   3. Prefer different game modes.
 *   4. Falls back to whatever exists if fewer than `count` candidates.
 *
 * Returns `{ picks, allCompleted }` so callers can render a completion state
 * when every published game has been finished.
 */
export interface DailyChallengeSelection {
  picks: GameRow[];
  allCompleted: boolean;
  totalPublished: number;
}

export async function selectDailyChallenges(
  count = 2,
  opts: { excludeIds?: Set<string> } = {},
): Promise<DailyChallengeSelection> {
  const published = await listPublishedGames();
  const totalPublished = published.length;
  if (!totalPublished) {
    return { picks: [], allCompleted: false, totalPublished: 0 };
  }
  const excluded = opts.excludeIds ?? new Set<string>();
  const eligible = published.filter((g) => !excluded.has(g.id));
  const allCompleted = eligible.length === 0 && totalPublished > 0;
  const pool = eligible.length ? eligible : [];
  if (!pool.length) {
    return { picks: [], allCompleted, totalPublished };
  }
  // Stable per-day ordering by hashing (slug + daily seed).
  const ordered = [...pool].sort(
    (a, b) => dayHash(a.slug) - dayHash(b.slug),
  );
  const picks: GameRow[] = [];
  const usedModes = new Set<GameMode>();
  // Pass 1: prefer distinct modes.
  for (const g of ordered) {
    if (picks.length >= count) break;
    if (usedModes.has(g.mode)) continue;
    picks.push(g);
    usedModes.add(g.mode);
  }
  // Pass 2: fill remaining slots ignoring mode preference.
  for (const g of ordered) {
    if (picks.length >= count) break;
    if (picks.includes(g)) continue;
    picks.push(g);
  }
  return { picks, allCompleted, totalPublished };
}
