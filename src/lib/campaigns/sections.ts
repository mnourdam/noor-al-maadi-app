// ============================================================
// Campaign Sections — canonical, closed key set
// ------------------------------------------------------------
// Stage 1 of the "Campaign Intros + Section Music" plan.
//
// HARD RULE (frozen by the approved plan):
//   A campaign's section is NEVER inferred from `worldSlug`, `era`,
//   `state`, tags, titles, or any normalisation map. It is an explicit
//   authored value. This module owns the key set and the (stage 2)
//   resolution function; no other module may derive a section.
//
// Stage 1 ships the key set + labels only. `resolveCampaignSection()`
// lands in stage 2 together with the divider/override plumbing.
// ============================================================

export const CAMPAIGN_SECTION_KEYS = [
  "prophetic",
  "rashidun",
  "umayyad",
  "abbasid",
  "andalus",
  "crusades",
  "mongols_mamluks",
  "ottoman",
] as const;

export type CampaignSectionKey = (typeof CAMPAIGN_SECTION_KEYS)[number];

/** Arabic display labels — admin surfaces only, never used for matching. */
export const CAMPAIGN_SECTION_LABELS: Record<CampaignSectionKey, string> = {
  prophetic: "العصر النبوي",
  rashidun: "الخلافة الراشدة",
  umayyad: "الدولة الأموية",
  abbasid: "الدولة العباسية",
  andalus: "الأندلس",
  crusades: "الحروب الصليبية",
  mongols_mamluks: "المغول والمماليك",
  ottoman: "الدولة العثمانية",
};

const KEY_SET = new Set<string>(CAMPAIGN_SECTION_KEYS);

/**
 * Strict validator. Anything that is not one of the eight canonical keys
 * resolves to `null` — which means "no section music", never a guess.
 */
export function asCampaignSectionKey(value: unknown): CampaignSectionKey | null {
  if (typeof value !== "string") return null;
  return KEY_SET.has(value) ? (value as CampaignSectionKey) : null;
}
