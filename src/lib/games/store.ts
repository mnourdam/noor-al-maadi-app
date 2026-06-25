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
