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

import type { Campaign } from "@/types/campaign";
import { asCampaignSectionKey, type CampaignSectionKey } from "./sections";

/** Discriminator persisted inside `admin_campaigns.data`. */
export const DIVIDER_KIND = "divider" as const;

/** Raw storage row shape (superset — callers may select fewer columns). */
export interface RawCampaignRow {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  status?: string | null;
  data?: unknown;
  [k: string]: unknown;
}

/**
 * Section divider — organizational only. Deliberately minimal: adding a
 * campaign-shaped field here (rewards, chapters, keyArt, progress…) is a
 * design error, not a feature.
 */
export interface CampaignSectionDivider {
  readonly type: "divider";
  id: string;
  title: string;
  subtitle?: string;
  era?: string;
  /**
   * Explicit, authored ambience section key. Never inferred from era/title.
   * `null` ⇒ the section uses the default campaign ambience.
   */
  sectionKey: CampaignSectionKey | null;
  /** Shared ordering axis with campaigns. */
  order: number | null;
}


/** Tagged campaign entity. `type` makes the discriminated union exhaustive. */
export interface CampaignEntity {
  readonly type: "campaign";
  campaign: Campaign;
  row: RawCampaignRow;
}

export type TimelineEntity =
  | CampaignEntity
  | { readonly type: "divider"; divider: CampaignSectionDivider };

// ---------------------------------------------------------------
// Predicates — the single source of truth for "is this a divider?"
// ---------------------------------------------------------------

/** True when a `data` payload describes a section divider. */
export function isDividerPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.kind === DIVIDER_KIND || d.type === DIVIDER_KIND || d.entity_type === DIVIDER_KIND;
}

/** True when a raw storage row is a section divider row. */
export function isDividerRow(row: RawCampaignRow | null | undefined): boolean {
  if (!row) return false;
  if (isDividerPayload(row.data)) return true;
  // Defensive: some projections select only `id`/`title` and no `data`.
  return typeof row.id === "string" && row.id.startsWith("div_");
}

/** True when a raw storage row is a real, playable campaign row. */
export function isCampaignRow(row: RawCampaignRow | null | undefined): boolean {
  return !!row && !isDividerRow(row);
}

// ---------------------------------------------------------------
// Selectors — every consumer of campaign collections uses these
// ---------------------------------------------------------------

/** Playable campaign rows only. Dividers are dropped. */
export function selectCampaignRows<T>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter((r) => isCampaignRow(r as RawCampaignRow));
}

/** Divider rows only, normalized into the minimal divider model. */
export function selectDividers(rows: readonly RawCampaignRow[] | null | undefined): CampaignSectionDivider[] {
  return (rows ?? []).filter((r) => isDividerRow(r)).map(toDivider);
}

/** Split raw rows into the two entity families in a single pass. */
export function partitionCampaignRows<T>(
  rows: readonly T[] | null | undefined,
): { campaigns: T[]; dividers: CampaignSectionDivider[] } {
  const campaigns: T[] = [];
  const dividers: CampaignSectionDivider[] = [];
  for (const r of rows ?? []) {
    if (isDividerRow(r as RawCampaignRow)) dividers.push(toDivider(r as RawCampaignRow));
    else campaigns.push(r);
  }
  return { campaigns, dividers };
}

/**
 * Normalize a raw row into the divider model, dropping every campaign-only
 * field. A divider produced here CANNOT carry rewards / chapters / key art
 * even if the stored JSON contains them.
 */
export function toDivider(row: RawCampaignRow): CampaignSectionDivider {
  const d = (row?.data ?? {}) as Record<string, unknown>;
  const rawOrder = d.chronological_order;
  const order =
    typeof rawOrder === "number" && Number.isFinite(rawOrder) ? rawOrder : null;
  return {
    type: "divider",
    id: String(row?.id ?? ""),
    title: String(d.title ?? row?.title ?? "عصر جديد"),
    subtitle: typeof d.subtitle === "string" && d.subtitle.trim() ? d.subtitle : undefined,
    era: typeof d.era === "string" && d.era.trim() ? d.era : undefined,
    sectionKey: asCampaignSectionKey(d.section_key) ?? asCampaignSectionKey(d.sectionKey),
    order,
  };
}

/** Storage payload for a divider — only the five allowed fields (+ order metadata). */
export function dividerPayload(input: {
  title: string;
  subtitle?: string;
  era?: string;
  sectionKey?: CampaignSectionKey | null;
  order?: number | null;
}): Record<string, unknown> {
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
export function assertNotDivider(value: unknown, context: string): void {
  if (!isDividerPayload(value)) return;
  const msg = `[campaign-entities] Section divider entered campaign pipeline: ${context}`;
  if (import.meta.env?.DEV) throw new Error(msg);
  console.error(msg);
}
