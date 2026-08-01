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
  // Batch 2 · Arms, Cavalry & Historical Roles (25 new)
  "scimitar", "spear_lance", "war_bow", "arrow_quiver", "dagger_khanjar", "battle_axe", "mace_flanged", "chain_mail", "helm_conical", "round_shield_leather", "saddle_ornate", "stirrup_pair", "scholar_robe", "explorer_kit", "cartographer_tools", "curator_gloves", "historian_desk", "horseman_bridle", "merchant_scales", "poet_diwan", "physician_kit", "astronomer_kit", "judge_seal", "preacher_pulpit", "caravan_pack",
  // Batch 3 · Places & Cultural Heritage (25 — prohibited items removed)
  "minaret_tower", "mihrab_niche", "desert_fortress", "caravanserai", "souk_gate",
  "madrasa", "observatory_dome", "hammam", "sabil_fountain", "oasis_palm",
  "lighthouse_pharos", "horseshoe_arch",
  "geometric_panel", "muqarnas_fragment", "incense_burner", "crescent_medallion",
  "eight_point_star", "royal_tughra", "signet_ring", "persian_carpet",
  "silk_bolt", "ceramic_tile", "brass_lantern",
  // Batch 4 · Trade, Seafaring & Scientific Heritage (25)
  "gold_dinar_coin", "silver_dirham_coin", "trade_ledger", "merchant_seal_stamp",
  "spice_chest", "saffron_pouch", "date_basket", "frankincense_resin",
  "myrrh_bundle", "coffee_dallah", "dhow_ship", "anchor_stone",
  "kamal_navigator", "mariners_astrolabe", "pearl_diver_basket",
  "water_skin_qirba", "wind_rose_chart", "star_chart_manuscript",
  "silk_road_map", "mathematics_treatise", "medical_herbarium",
  "arabian_horse_portrait", "falcon_hood", "desert_rose_crystal",
  "camel_saddlebag",
  // Batch 5 additions · Governance / Documented Islamic artifacts
  "banner_ayyubid", "water_clock_jazari", "pigeon_letter_case",
  // Batch 5 · Governance, Diplomacy, Statehood & Dynastic Identity (25)
  "banner_prophetic", "banner_seljuk", "banner_zengid", "banner_mamluk",
  "ayyubid_eagle", "mamluk_blazon", "seljuk_star_tile",
  "caliph_throne", "royal_firman", "diwan_register",
  "kharaj_scroll", "waqf_deed", "mazalim_petition",
  "hisba_manual", "muhtasib_staff",
  "bayt_al_mal_chest", "province_map",
  "barid_horn", "postal_satchel",
  "vizier_khilaa", "tiraz_textile",
  "hajj_mahmal", "minbar_panel", "mosque_lamp", "fresco_fragment",
  // Atlas set · region / city / battle markers (Premium Style v1)
  "atlas_region", "atlas_city", "atlas_battle",
]);



/**
 * Sizes/formats actually shipped inside the app bundle.
 *
 * APK size pass: the pack used to ship WebP *and* AVIF at 128/256/512/1024
 * (44 MB, ~half the installed APK). AVIF bought nothing — every target
 * WebView already decodes WebP — and 1024 was only ever used by the share
 * card, which draws the emblem far below 512 CSS px. Bundling webp at
 * 128/256/512 costs 9.4 MB and is visually identical on device.
 *
 * The larger/AVIF variants still exist on the CDN and remain reachable via
 * `PREMIUM_EMBLEM_ASSETS`; they are simply not a local (offline) guarantee.
 */
export const BUNDLED_EMBLEM_SIZES: ReadonlySet<number> = new Set([128, 256, 512]);
export const BUNDLED_EMBLEM_FORMAT = "webp" as const;

/**
 * Local path (same origin as the app) for a bundled emblem asset.
 * Returns `null` for any size/format that is NOT in the bundle, so callers
 * transparently fall through to the CDN matrix instead of requesting a
 * file that would 404 on device.
 */
export function localEmblemPath(
  id: string,
  size: EmblemSize,
  format: "webp" | "avif" = "webp",
): string | null {
  if (!OFFLINE_EMBLEM_IDS.has(id)) return null;
  if (format !== BUNDLED_EMBLEM_FORMAT) return null;
  if (!BUNDLED_EMBLEM_SIZES.has(size)) return null;
  return `/emblems/${id}_${size}.${format}`;
}

/** Nearest bundled size at or below `size` (falls back to the largest). */
export function nearestBundledEmblemSize(size: EmblemSize): EmblemSize {
  return (BUNDLED_EMBLEM_SIZES.has(size) ? size : 512) as EmblemSize;
}

/** True when the app has a locally-served copy — no CDN needed. */
export function hasOfflineEmblem(id: string): boolean {
  return OFFLINE_EMBLEM_IDS.has(id);
}
