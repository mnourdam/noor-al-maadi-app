// ============================================================
// Campaign Entity Model — STRUCTURAL SEPARATION
// ------------------------------------------------------------
// A Campaign and a Section Divider are two DIFFERENT entity types.
// They happen to share one storage table (`admin_campaigns`) purely
// because they share the `chronological_order` axis — but they are
// NOT the same model and must never flow through the same pipeline.
//
//   Campaign          → playable content (chapters, rewards, progress,
//                       key art, unlocks, statistics, player surfaces)
//   CampaignSectionDivider → organizational only
//                       (id, title, subtitle?, era?, order). Nothing else.
//
// HARD INVARIANT
//   Every place that consumes a campaign collection MUST first pass the
//   raw rows through `selectCampaignRows()` / `partitionCampaignRows()`.
//   Dividers must never enter: sorting, progress, continue journey,
//   worlds, hero, search, achievements, recommendations, statistics,
//   counts, import/export validation, or ordering algorithms.
//
// This module is the ONLY sanctioned boundary between raw storage rows
// and typed campaign / divider collections.
// ============================================================
import { asCampaignGroupKey, asCampaignSectionKey } from "./sections";
/** Discriminator persisted inside `admin_campaigns.data`. */
export const DIVIDER_KIND = "divider";
// ---------------------------------------------------------------
// Predicates — the single source of truth for "is this a divider?"
// ---------------------------------------------------------------
/** True when a `data` payload describes a section divider. */
export function isDividerPayload(data) {
    if (!data || typeof data !== "object")
        return false;
    const d = data;
    return d.kind === DIVIDER_KIND || d.type === DIVIDER_KIND || d.entity_type === DIVIDER_KIND;
}
/** True when a raw storage row is a section divider row. */
export function isDividerRow(row) {
    if (!row)
        return false;
    if (isDividerPayload(row.data))
        return true;
    // Defensive: some projections select only `id`/`title` and no `data`.
    return typeof row.id === "string" && row.id.startsWith("div_");
}
/** True when a raw storage row is a real, playable campaign row. */
export function isCampaignRow(row) {
    return !!row && !isDividerRow(row);
}
// ---------------------------------------------------------------
// Selectors — every consumer of campaign collections uses these
// ---------------------------------------------------------------
/** Playable campaign rows only. Dividers are dropped. */
export function selectCampaignRows(rows) {
    return (rows ?? []).filter((r) => isCampaignRow(r));
}
/** Divider rows only, normalized into the minimal divider model. */
export function selectDividers(rows) {
    return (rows ?? []).filter((r) => isDividerRow(r)).map(toDivider);
}
/** Split raw rows into the two entity families in a single pass. */
export function partitionCampaignRows(rows) {
    const campaigns = [];
    const dividers = [];
    for (const r of rows ?? []) {
        if (isDividerRow(r))
            dividers.push(toDivider(r));
        else
            campaigns.push(r);
    }
    return { campaigns, dividers };
}
/**
 * Normalize a raw row into the divider model, dropping every campaign-only
 * field. A divider produced here CANNOT carry rewards / chapters / key art
 * even if the stored JSON contains them.
 */
export function toDivider(row) {
    const d = (row?.data ?? {});
    const rawOrder = d.chronological_order;
    const order = typeof rawOrder === "number" && Number.isFinite(rawOrder) ? rawOrder : null;
    return {
        type: "divider",
        id: String(row?.id ?? ""),
        title: String(d.title ?? row?.title ?? "عصر جديد"),
        subtitle: typeof d.subtitle === "string" && d.subtitle.trim() ? d.subtitle : undefined,
        era: typeof d.era === "string" && d.era.trim() ? d.era : undefined,
        sectionKey: asCampaignSectionKey(d.section_key) ?? asCampaignSectionKey(d.sectionKey),
        rawSectionKey: asCampaignGroupKey(d.section_key) ?? asCampaignGroupKey(d.sectionKey),
        order,
    };
}
/** Storage payload for a divider — only the five allowed fields (+ order metadata). */
export function dividerPayload(input) {
    return {
        kind: DIVIDER_KIND,
        title: input.title,
        subtitle: input.subtitle?.trim() || undefined,
        era: input.era?.trim() || undefined,
        section_key: asCampaignSectionKey(input.sectionKey) ?? undefined,
        chronological_order: typeof input.order === "number" ? input.order : 0,
        order_status: "manual",
        order_updated_at: new Date().toISOString(),
    };
}
// ---------------------------------------------------------------
// Dev-time guard
// ---------------------------------------------------------------
/**
 * Throws in dev when a divider leaks into campaign logic. Use at the entry
 * of any function that assumes a playable campaign.
 */
export function assertNotDivider(value, context) {
    if (!isDividerPayload(value))
        return;
    const msg = `[campaign-entities] Section divider entered campaign pipeline: ${context}`;
    if (import.meta.env?.DEV)
        throw new Error(msg);
    console.error(msg);
}
