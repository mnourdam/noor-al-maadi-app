// Public taxonomy whitelist — the ONLY values a player is allowed to see in
// Encyclopedia filters, category counts, and browsing lists. Admin tools keep
// full access to legacy / archived / migration values via the taxonomy tables
// directly; this module is strictly a player-facing curation layer.
//
// Nothing here removes data from the database. Non-approved values are simply
// hidden from the public Encyclopedia UI.

import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

// ------------------------------------------------------------
// Approved canonical STATES (14). Legacy / geographic / stub
// state entities are hidden from public lists.
// ------------------------------------------------------------
// NOTE: `buyid`, `fatimid` and `safavid` are intentionally absent — they must
// never appear as a state card, category, filter or world. Their figures,
// cities, battles, events and artifacts remain fully visible.
export const APPROVED_STATE_SLUGS = [
  "prophetic",
  "rashidun",
  "umayyad",
  "abbasid",
  "andalus",
  "seljuk",
  "zengid",
  "ayyubid",
  "mamluk",
  "ottoman",
  "mongols",
  "timurid",
  // V16 — approved product decision: مملكة غرناطة is public Encyclopedia
  // content (canonical row `nasrid-kingdom-of-granada`). Added explicitly,
  // NOT aliased onto `andalus`, so it keeps its own canonical identity.
  "nasrid-kingdom-of-granada",
] as const;

// Alias variants → canonical state slug. Extend here if the database stores
// legacy compound slugs for a canonical state.
const STATE_ALIAS: Record<string, string> = {
  "rashidun-caliphate": "rashidun",
  "umayyad-caliphate": "umayyad",
  "umayyad-state": "umayyad",
  "abbasid-caliphate": "abbasid",
  "abbasid-state": "abbasid",
  "fatimid-caliphate": "fatimid",
  "fatimid-state": "fatimid",
  "andalus-state": "andalus",
  "al-andalus": "andalus",
  "seljuk-empire": "seljuk",
  "seljuk-state": "seljuk",
  "ayyubid-state": "ayyubid",
  "ayyubid-sultanate": "ayyubid",
  "mamluk-sultanate": "mamluk",
  mamluks: "mamluk",
  "ottoman-empire": "ottoman",
  "ottoman-state": "ottoman",
  ottomans: "ottoman",
  "mongol-empire": "mongols",
  mongol: "mongols",
  ilkhanid: "mongols",
  ilkhanate: "mongols",
  "golden-horde": "mongols",
  "timurid-empire": "timurid",
  "timurid-state": "timurid",
  "safavid-empire": "safavid",
  "safavid-state": "safavid",
};

const APPROVED_STATE_SET = new Set<string>(APPROVED_STATE_SLUGS);

export function canonicalStateSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  if (APPROVED_STATE_SET.has(s)) return s;
  const aliased = STATE_ALIAS[s];
  return aliased && APPROVED_STATE_SET.has(aliased) ? aliased : null;
}

export function isPublicStateSlug(slug: string | null | undefined): boolean {
  return canonicalStateSlug(slug) !== null;
}

// ------------------------------------------------------------
// Approved canonical WORLDS (12). Mirrors WORLD_HUBS.
// ------------------------------------------------------------
export const APPROVED_WORLD_SLUGS = [
  "prophetic",
  "rashidun",
  "umayyad",
  "abbasid",
  "seljuk",
  "zengid",
  "ayyubid-state",
  "mamluk-sultanate",
  "andalus",
  "ottoman",
  "mongols",
  "timurid",
] as const;

const APPROVED_WORLD_SET = new Set<string>(APPROVED_WORLD_SLUGS);

export function isPublicWorldSlug(slug: string | null | undefined): boolean {
  return !!slug && APPROVED_WORLD_SET.has(slug.trim().toLowerCase());
}

// ------------------------------------------------------------
// Public entity filter — enforces per-type whitelists in one place.
// Non-approved state entities are removed from player-facing lists.
// (Era filtering is handled via toCanonicalEra where used.)
// ------------------------------------------------------------
export function isPublicEntity(entity: SupabaseEncyclopediaEntity): boolean {
  if (entity.entity_type === "state") {
    return isPublicStateSlug(entity.slug);
  }
  return true;
}
