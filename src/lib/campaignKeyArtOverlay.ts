// ============================================================
// Campaign Key Art Overlay
// ------------------------------------------------------------
// WHY THIS EXISTS
// The offline snapshot bundled in the build (and every snapshot
// generated before the Key Art migration) stores campaign rows
// WITHOUT the `key_art_*` columns. Player reads are local-first,
// so `fetchPublishedCampaigns()` returns those snapshot rows and
// every surface saw `key_art_path === null` — the Home Hero then
// fell back to a random hero-pool image while rendering the
// campaign's own title / progress / CTA.
//
// This module is the ONE place that repairs that gap: a tiny
// `id, slug, key_art_*` projection of `campaigns_public`, cached
// in memory + localStorage so it survives reloads and works
// offline. It never fetches campaign content — only artwork
// pointers — so it is cheap enough to await on every read.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export interface KeyArtOverlayRow {
  key_art_path: string | null;
  key_art_square_path: string | null;
  key_art_credit: string | null;
}

const LS_KEY = "irth.campaign-key-art.overlay.v1";
const TTL_MS = 1000 * 60 * 10;

type OverlayMap = Record<string, KeyArtOverlayRow>;

let cache: OverlayMap | null = null;
let cachedAt = 0;
let inflight: Promise<OverlayMap> | null = null;

function readPersisted(): OverlayMap | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; map: OverlayMap };
    if (!parsed?.map) return null;
    return parsed.map;
  } catch {
    return null;
  }
}

function persist(map: OverlayMap): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), map }));
  } catch { /* ignore */ }
}

async function fetchOverlay(): Promise<OverlayMap> {
  const { data, error } = await supabase
    .from("campaigns_public" as any)
    .select("id, slug, key_art_path, key_art_square_path, key_art_credit");
  if (error || !data) throw new Error(error?.message ?? "overlay_failed");
  const map: OverlayMap = {};
  // Section dividers never carry key art.
  for (const r of selectCampaignRows(data as any[])) {
    const row: KeyArtOverlayRow = {
      key_art_path: r.key_art_path ?? null,
      key_art_square_path: r.key_art_square_path ?? null,
      key_art_credit: r.key_art_credit ?? null,
    };
    if (!row.key_art_path && !row.key_art_square_path) continue;
    if (r.id) map[String(r.id)] = row;
    if (r.slug) map[String(r.slug)] = row;
  }
  return map;
}

/** Cached overlay map keyed by BOTH campaign id and slug. */
export async function getCampaignKeyArtOverlay(): Promise<OverlayMap> {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  if (!cache) {
    const persisted = readPersisted();
    if (persisted) cache = persisted; // serve stale immediately
  }

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return cache ?? {};

  inflight = (async () => {
    try {
      const map = await fetchOverlay();
      cache = map;
      cachedAt = Date.now();
      persist(map);
      return map;
    } catch {
      return cache ?? {};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Synchronous best-effort read (already-warm cache only). */
export function peekCampaignKeyArtOverlay(): OverlayMap {
  if (cache) return cache;
  const persisted = readPersisted();
  if (persisted) cache = persisted;
  return cache ?? {};
}

/** Drop cached artwork pointers so the next read re-fetches. Called
 *  after an admin upload / replace / delete. */
export function invalidateCampaignKeyArtOverlay(): void {
  cache = null;
  cachedAt = 0;
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

/** Merge overlay artwork onto a campaign-shaped object. Existing
 *  non-null values on the row always win (fresh network reads). */
export function applyKeyArtOverlay<T extends {
  id?: string;
  slug?: string;
  key_art_path?: string | null;
  key_art_square_path?: string | null;
  key_art_credit?: string | null;
}>(row: T, map: OverlayMap): T {
  if (row.key_art_path || row.key_art_square_path) return row;
  const hit = (row.id && map[row.id]) || (row.slug && map[row.slug]) || null;
  if (!hit) return row;
  return {
    ...row,
    key_art_path: hit.key_art_path,
    key_art_square_path: hit.key_art_square_path,
    key_art_credit: hit.key_art_credit ?? row.key_art_credit ?? null,
  };
}
