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
];
/** Arabic display labels — admin surfaces only, never used for matching. */
export const CAMPAIGN_SECTION_LABELS = {
    prophetic: "العصر النبوي",
    rashidun: "الخلافة الراشدة",
    umayyad: "الدولة الأموية",
    abbasid: "الدولة العباسية",
    andalus: "الأندلس",
    crusades: "الحروب الصليبية",
    mongols_mamluks: "المغول والمماليك",
    ottoman: "الدولة العثمانية",
};
const KEY_SET = new Set(CAMPAIGN_SECTION_KEYS);
/**
 * Strict validator. Anything that is not one of the eight canonical keys
 * resolves to `null` — which means "no section music", never a guess.
 */
export function asCampaignSectionKey(value) {
    if (typeof value !== "string")
        return null;
    return KEY_SET.has(value) ? value : null;
}
/** Read an authored key off a campaign or divider, strictly. */
export function readSectionKey(value) {
    if (!value)
        return null;
    return (asCampaignSectionKey(value.section_key) ??
        asCampaignSectionKey(value.sectionKey));
}
/**
 * The single sanctioned way to determine a campaign's section.
 * `divider` is the section divider that opens the campaign's section
 * (or null when the campaign sits before any divider).
 */
export function resolveCampaignSection(campaign, divider) {
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
export function asCampaignGroupKey(value) {
    if (typeof value !== "string")
        return null;
    const v = value.trim().toLowerCase();
    return v ? v : null;
}
/** Read a grouping key off a campaign or divider (open set). */
export function readGroupKey(value) {
    if (!value)
        return null;
    return (asCampaignGroupKey(value.section_key) ??
        asCampaignGroupKey(value.sectionKey));
}
