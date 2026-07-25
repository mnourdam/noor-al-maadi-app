// ============================================================
// resolveProfileEmblem — single entry point for every surface
// ------------------------------------------------------------
// Rules (frozen):
//  1. Preserve the saved `avatar_id`; never force a player to re-pick.
//  2. Resolve legacy / pre-pack ids to the closest Premium raster emblem.
//  3. Fall back only to another Premium raster emblem, never legacy art.
// No caller is ever forced to re-pick a saved avatar_id.
// ============================================================

import { DEFAULT_AVATAR_ID, getAvatar } from "@/lib/avatars";
import { EMBLEM_REGISTRY, getEmblemRecord } from "./registry";
import { hasAnyAsset } from "./asset-manifest";
import type { ResolvedEmblem } from "./types";

export const DEFAULT_PREMIUM_EMBLEM_ID = "crescent_medallion";

/**
 * Visual compatibility map for IDs that existed before the frozen Premium
 * pack. These aliases preserve stored profile.avatar_id values while ensuring
 * every surface renders a Style v1 raster from /public/emblems first.
 */
export const LEGACY_PREMIUM_EMBLEM_ALIASES: Record<string, string> = {
  crescent_star: "crescent_medallion",
  crescent: "crescent_medallion",
  calligraphy: "royal_tughra",
  rosette: "eight_point_star",
  prayer_bead: "waqf_deed",
  lantern: "mosque_lamp",
  spear: "spear_lance",
  bow: "war_bow",
  dagger: "dagger_khanjar",
  axe: "battle_axe",
  helmet: "helm_conical",
  armor: "chain_mail",
  ring: "signet_ring",
  manuscript: "illuminated_page",
  abbasid_book: "book",
  quill: "reed_pen",
  hikma: "scholar_robe",
  library: "library_ladder",
  ink: "ink_pot",
  tablet: "parchment_stack",
  explorer: "explorer_kit",
  cartographer: "cartographer_tools",
  museum_curator: "curator_gloves",
  historian: "historian_desk",
  horseman: "horseman_bridle",
  mosque: "mihrab_niche",
  kaaba: "hajj_mahmal",
  aqsa: "mihrab_niche",
  minaret: "minaret_tower",
  mihrab: "mihrab_niche",
  palm: "oasis_palm",
  olive: "oasis_palm",
  dome: "mihrab_niche",
  castle: "desert_fortress",
  gate: "souk_gate",
  fortress: "desert_fortress",
  tower: "minaret_tower",
  compass: "qibla_compass",
  astrolabe: "brass_astrolabe",
  hourglass: "hourglass_bronze",
  map: "cartographer_tools",
  telescope: "astronomer_kit",
  scale: "balance_scale",
  key: "wax_seal",
  abacus: "mathematics_treatise",
  scissors: "tiraz_textile",
  magnifier: "historian_desk",
  horse: "arabian_horse_portrait",
  camel: "camel_saddlebag",
  falcon: "falcon_hood",
  lion: "round_shield_leather",
  desert: "desert_fortress",
  oasis: "oasis_palm",
  caravan: "caravan_pack",
  well: "sabil_fountain",
  coin: "gold_dinar_coin",
  incense: "incense_burner",
  crown: "caliph_throne",
  torch: "brass_lantern",
};

function toResolved(record: NonNullable<ReturnType<typeof getEmblemRecord>>): ResolvedEmblem {
  return {
    record,
    hasPremiumAsset: hasAnyAsset(record),
  };
}

function getPremiumCompatibleRecord(id: string) {
  const aliased = LEGACY_PREMIUM_EMBLEM_ALIASES[id] ?? id;
  const aliasRecord = getEmblemRecord(aliased);
  if (aliasRecord && hasAnyAsset(aliasRecord)) return aliasRecord;

  const direct = getEmblemRecord(id);
  if (direct && hasAnyAsset(direct)) return direct;

  return aliasRecord ?? direct;
}

export function resolveProfileEmblem(avatarId?: string | null): ResolvedEmblem {
  // 1) direct or premium-compatible visual alias
  if (avatarId) {
    const direct = getPremiumCompatibleRecord(avatarId);
    if (direct) {
      return toResolved(direct);
    }
    // 2) legacy id remap — reuse the historical map in getAvatar()
    const legacy = getAvatar(avatarId);
    const remapped = getPremiumCompatibleRecord(legacy.id);
    if (remapped) {
      return toResolved(remapped);
    }
  }
  // 3) safe Premium default
  const fallback =
    getPremiumCompatibleRecord(DEFAULT_AVATAR_ID) ??
    getEmblemRecord(DEFAULT_PREMIUM_EMBLEM_ID) ??
    EMBLEM_REGISTRY[0];
  return toResolved(fallback);
}
