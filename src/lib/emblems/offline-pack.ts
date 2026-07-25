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
  // Batch 3 · Places & Cultural Heritage (25 new)
  "minaret_tower", "mihrab_niche", "desert_fortress", "caravanserai", "souk_gate",
  "madrasa", "observatory_dome", "hammam", "sabil_fountain", "oasis_palm",
  "lighthouse_pharos", "horseshoe_arch", "oud_instrument", "tambourine_daf",
  "geometric_panel", "muqarnas_fragment", "incense_burner", "crescent_medallion",
  "eight_point_star", "royal_tughra", "signet_ring", "persian_carpet",
  "silk_bolt", "ceramic_tile", "brass_lantern",
  // Batch 4 · Trade, Seafaring & Scientific Heritage (25 new)
  "gold_dinar_coin", "silver_dirham_coin", "trade_ledger", "merchant_seal_stamp",
  "spice_chest", "saffron_pouch", "date_basket", "frankincense_resin",
  "myrrh_bundle", "coffee_dallah", "dhow_ship", "anchor_stone",
  "kamal_navigator", "mariners_astrolabe", "pearl_diver_basket",
  "water_skin_qirba", "wind_rose_chart", "star_chart_manuscript",
  "silk_road_map", "mathematics_treatise", "medical_herbarium",
  "arabian_horse_portrait", "falcon_hood", "desert_rose_crystal",
  "camel_saddlebag",
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
