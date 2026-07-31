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

// ------------------------------------------------------------
// Stage 2 — explicit section resolution
// ------------------------------------------------------------
// Resolution order (no inference, ever):
//   1. campaign-level authored override (`section_key`)
//   2. the section key authored on the divider that opens the section
//   3. null → default campaign ambience
// A campaign that belongs to no divider, or a divider with no authored
// key, resolves to null. `worldSlug` / `era` / titles are NEVER consulted.

/** Minimal shapes so this module stays free of campaign/divider imports. */
export interface SectionKeyCarrier {
  section_key?: unknown;
  sectionKey?: unknown;
}

/** Read an authored key off a campaign or divider, strictly. */
export function readSectionKey(
  value: SectionKeyCarrier | null | undefined,
): CampaignSectionKey | null {
  if (!value) return null;
  return (
    asCampaignSectionKey((value as SectionKeyCarrier).section_key) ??
    asCampaignSectionKey((value as SectionKeyCarrier).sectionKey)
  );
}

/**
 * The single sanctioned way to determine a campaign's section.
 * `divider` is the section divider that opens the campaign's section
 * (or null when the campaign sits before any divider).
 */
export function resolveCampaignSection(
  campaign: SectionKeyCarrier | null | undefined,
  divider?: SectionKeyCarrier | null,
): CampaignSectionKey | null {
  return readSectionKey(campaign) ?? readSectionKey(divider) ?? null;
}

// ------------------------------------------------------------
// Progression grouping keys — OPEN set (deliberately not the eight)
// ------------------------------------------------------------
// Ambience uses the CLOSED canonical key set above. Campaign UNLOCK
// grouping must stay open-ended: a brand-new era authored tomorrow from
// the admin panel must group (and unlock) with no code change. So the
// grouping key accepts ANY authored non-empty key, canonical or not.

/** Lenient grouping key: any authored non-empty string, normalised. */
export function asCampaignGroupKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v ? v : null;
}

/** Read a grouping key off a campaign or divider (open set). */
export function readGroupKey(value: SectionKeyCarrier | null | undefined): string | null {
  if (!value) return null;
  return (
    asCampaignGroupKey((value as SectionKeyCarrier).section_key) ??
    asCampaignGroupKey((value as SectionKeyCarrier).sectionKey)
  );
}
