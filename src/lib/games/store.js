import { supabase } from "@/integrations/supabase/client";
import { localDateKey } from "@/lib/daily-quest";
import { epochDayFromDateKey, selectDailyRotation } from "./dailyRotation";
const SELECT_COLS = "id, slug, mode, title, description, difficulty, estimated_time, xp_reward, coin_reward, hearts_penalty, related_entities, metadata, stages, status, published_at, created_at, updated_at";
export async function listGamesByMode(mode) {
    const { data, error } = await supabase
        .from("games")
        .select(SELECT_COLS)
        .eq("mode", mode)
        .order("updated_at", { ascending: false });
    if (error)
        return { rows: [], error: error.message };
    return { rows: (data ?? []), error: null };
}
export async function listPublishedGames() {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
        return [];
    const { data } = await supabase
        .from("games")
        .select(SELECT_COLS)
        .eq("status", "published")
        .order("published_at", { ascending: false });
    return (data ?? []);
}
/** Synchronous local-first list of published games from OfflineSnapshot. */
export function localListPublishedGames() {
    try {
        const { localPublishedGames } = require("@/lib/local-first-store");
        return localPublishedGames();
    }
    catch {
        return [];
    }
}
export async function listPublishedGamesByMode(mode) {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
        return [];
    const { data } = await supabase
        .from("games")
        .select(SELECT_COLS)
        .eq("mode", mode)
        .eq("status", "published")
        .order("published_at", { ascending: false });
    return (data ?? []);
}
export async function getGameBySlug(slug) {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
        return null;
    const { data } = await supabase
        .from("games")
        .select(SELECT_COLS)
        .eq("slug", slug)
        .maybeSingle();
    return data ?? null;
}
// Daily picks — deterministic per day so all players see the same featured.
export function pickDailyFeatured(items, count = 2) {
    if (!items.length)
        return [];
    const day = new Date();
    const seed = day.getUTCFullYear() * 10000 + (day.getUTCMonth() + 1) * 100 + day.getUTCDate();
    const out = [];
    const used = new Set();
    let s = seed;
    while (out.length < Math.min(count, items.length)) {
        s = (s * 9301 + 49297) % 233280;
        const idx = s % items.length;
        if (used.has(idx))
            continue;
        used.add(idx);
        out.push(items[idx]);
    }
    return out;
}
export async function fetchDailyFeaturedGames(count = 2) {
    const published = await listPublishedGames();
    return pickDailyFeatured(published, count);
}
// Fetch ids of games the current player already completed. Returns empty set
// if not signed in or on error — daily picks should still work for guests.
export async function fetchMyCompletedGameIds() {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
        return new Set();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid)
        return new Set();
    const { data } = await supabase
        .from("game_progress")
        .select("game_id, completed")
        .eq("user_id", uid)
        .eq("completed", true);
    return new Set((data ?? []).map((r) => r.game_id));
}
/**
 * Fetch game_ids the player has completed *today* (UTC — matches the
 * deterministic UTC-day daily pick seed). This is what the Home / Adventure
 * "Daily Challenge" surface uses to decide whether today's picks are done.
 * An older completion of a game that happens to be today's pick must NOT
 * mark the challenge as already-completed for today: the daily reset must
 * make the challenge playable again the moment the calendar day rolls over.
 */
export async function fetchMyDailyCompletedGameIds() {
    if (typeof navigator !== "undefined" && navigator.onLine === false)
        return new Set();
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid)
        return new Set();
    const now = new Date();
    const startOfDayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const { data } = await supabase
        .from("game_progress")
        .select("game_id, completed, last_played_at")
        .eq("user_id", uid)
        .eq("completed", true)
        .gte("last_played_at", startOfDayUtc);
    return new Set((data ?? []).map((r) => r.game_id));
}
export async function selectDailyChallenges(count = 2, opts = {}) {
    const published = await listPublishedGames();
    const totalPublished = published.length;
    if (!totalPublished) {
        return { picks: [], allCompleted: false, totalPublished: 0, reasons: [] };
    }
    const completed = opts.completedIds ?? new Set();
    const epochDay = epochDayFromDateKey(opts.dateKey ?? localDateKey());
    const rotatable = published.map((g) => ({
        ...g,
        era: typeof g.metadata?.era === "string" ? g.metadata.era : null,
    }));
    const result = selectDailyRotation(epochDay, rotatable, {
        completedIds: completed,
        count,
    });
    const picks = result.picks.map((p) => published.find((g) => g.id === p.game.id)).filter(Boolean);
    return {
        picks,
        allCompleted: picks.length === 0,
        totalPublished,
        reasons: result.picks.map((p) => p.reason),
    };
}
