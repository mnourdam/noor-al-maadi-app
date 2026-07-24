// ============================================================
// Offline Emblem Pack — local-first source of truth
// ------------------------------------------------------------
// The 10 approved Premium Historical Emblems are bundled with
// the web build under /public/emblems/<id>_<size>.webp and are
// served from the app origin. This means Picker, Profile, HUD,
// ShareCard and Public Profile all resolve emblem art without
// waiting on the CDN — critical for airplane-mode, weak network,
// and APK first-launch.
//
// The manifest (/emblems/manifest.json) carries SHA-256, size,
// version and asset count so we can integrity-check any future
// downloaded pack against a known-good baseline.
// ============================================================

import type { EmblemSize } from "./asset-manifest";

// Every emblem_id present in the bundled offline pack. Kept in a
// single frozen set so callers can decide local-first vs CDN in
// O(1) without importing the full manifest JSON.
export const OFFLINE_EMBLEM_IDS: ReadonlySet<string> = new Set([
  // Signature 10 (Style v1 benchmark)
  "banner_abbasid", "banner_umayyad", "banner_rashidun", "banner_andalus",
  "banner_ottoman", "sword", "shield", "book", "scholar", "star",
  // Batch 1 · Knowledge & Tools (25 new)
  "scroll", "ink_pot", "reed_pen", "parchment_stack", "wax_seal",
  "bound_folio", "illuminated_page", "writing_desk_kit", "paper_maker_screen",
  "book_stand", "library_ladder", "codex_chained", "encyclopedia_stack",
  "compass_dividers", "brass_astrolabe", "celestial_globe", "water_clock",
  "sundial_portable", "balance_scale", "mortar_pestle", "alembic",
  "glass_vial_set", "hourglass_bronze", "qibla_compass", "surveyor_rod",
]);

/** Local path (same origin as the app) for a bundled emblem asset. */
export function localEmblemPath(id: string, size: EmblemSize): string | null {
  if (!OFFLINE_EMBLEM_IDS.has(id)) return null;
  return `/emblems/${id}_${size}.webp`;
}

/** True when the app has a locally-served copy — no CDN needed. */
export function hasOfflineEmblem(id: string): boolean {
  return OFFLINE_EMBLEM_IDS.has(id);
}
