// ============================================================
// Games export/import serialization (admin)
// ------------------------------------------------------------
// One shared service for every game mode. Bulk export always
// reads the FULL server-side set for the mode (paged), never the
// rows currently rendered in the admin table, so filters, search
// and pagination cannot truncate the file.
//
// Output is round-trip compatible with the per-mode importer:
//   • a bulk envelope  { envelope_version, mode, games: [...] }
//   • a bare array     [ {...}, {...} ]
//   • a single object  { slug, mode, ... }
// are all accepted by `parseGamesImportPayload`.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { GameMode } from "./types";
import type { GameRow } from "./store";

export const GAMES_EXPORT_KIND = "irth.games.export";
export const GAMES_EXPORT_VERSION = 2;

const SELECT_COLS =
  "id, slug, mode, title, description, difficulty, estimated_time, xp_reward, coin_reward, hearts_penalty, related_entities, metadata, stages, status, published_at, created_at, updated_at";

/** Canonical single-game envelope. Lossless: keeps id, slug, status and all fields. */
export function serializeGame(g: GameRow): Record<string, unknown> {
  const meta = { ...((g.metadata ?? {}) as Record<string, unknown>) };
  const museum = Array.isArray(meta.museum_unlocks) ? (meta.museum_unlocks as string[]) : [];
  // Museum unlocks are surfaced under rewards; drop the metadata copy so
  // a re-imported envelope stays canonical (importer re-writes metadata).
  delete meta.museum_unlocks;
  return {
    id: g.id,
    slug: g.slug,
    mode: g.mode,
    title: g.title,
    description: g.description ?? undefined,
    difficulty: g.difficulty,
    estimated_time: g.estimated_time,
    hearts_penalty: g.hearts_penalty,
    related_entities: g.related_entities ?? [],
    metadata: meta,
    stages: g.stages ?? [],
    status: g.status,
    published_at: g.published_at ?? null,
    created_at: g.created_at ?? null,
    updated_at: g.updated_at ?? null,
    rewards: {
      xp: g.xp_reward,
      coins: g.coin_reward,
      ...(museum.length ? { museum_unlocks: museum } : {}),
    },
  };
}

export interface GamesExportBundle {
  envelope_version: number;
  kind: string;
  mode: GameMode;
  exported_at: string;
  count: number;
  games: Record<string, unknown>[];
}

export function buildGamesExportBundle(mode: GameMode, rows: GameRow[]): GamesExportBundle {
  return {
    envelope_version: GAMES_EXPORT_VERSION,
    kind: GAMES_EXPORT_KIND,
    mode,
    exported_at: new Date().toISOString(),
    count: rows.length,
    games: rows.map(serializeGame),
  };
}

/** irth-games-{mode}-YYYYMMDD-HHmm.json */
export function gamesExportFileName(mode: GameMode, at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}` +
    `-${p(at.getHours())}${p(at.getMinutes())}`;
  return `irth-games-${mode}-${stamp}.json`;
}

const PAGE = 500;

/**
 * Read EVERY game of the given mode from the server, paged.
 * Independent of any UI filter / search / pagination state.
 */
export async function fetchAllGamesByMode(
  mode: GameMode,
): Promise<{ rows: GameRow[]; error: string | null }> {
  const out: GameRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("games")
      .select(SELECT_COLS)
      .eq("mode", mode)
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    const batch = (data ?? []) as unknown as GameRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows: out, error: null };
}

export function downloadJsonFile(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Normalize any accepted import shape into a flat list of game envelopes.
 * Accepts a single object, a bare array, or the bulk export bundle.
 */
export function parseGamesImportPayload(
  raw: unknown,
):
  | { ok: true; items: unknown[]; bulk: boolean }
  | { ok: false; error: string } {
  if (Array.isArray(raw)) {
    if (!raw.length) return { ok: false, error: "الملف لا يحتوي على أي لعبة." };
    return { ok: true, items: raw, bulk: true };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.games)) {
      if (!obj.games.length) return { ok: false, error: "الملف لا يحتوي على أي لعبة." };
      return { ok: true, items: obj.games, bulk: true };
    }
    return { ok: true, items: [obj], bulk: false };
  }
  return { ok: false, error: "بنية JSON غير مدعومة." };
}
