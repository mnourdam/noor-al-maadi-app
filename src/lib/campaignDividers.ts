// ============================================================
// Campaign Era Dividers — grouping layer
// ------------------------------------------------------------
// Dividers are a SEPARATE entity type from campaigns (see
// `src/lib/campaigns/entities.ts`). This module only knows how to
// interleave the two ordered collections into display sections.
//
// It never mutates campaigns, never gives a divider campaign
// behaviour, and defensively drops any divider that a caller
// accidentally passes inside a campaign array.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { campaignSortKey } from "./campaignChronology";
import { withBackfilledChronology } from "./campaignChronologyBackfill";
import {
  isDividerPayload,
  isDividerRow,
  selectDividers,
  toDivider,
  type CampaignSectionDivider,
  type RawCampaignRow,
} from "./campaigns/entities";

export type { CampaignSectionDivider } from "./campaigns/entities";
export {
  isDividerPayload,
  isDividerRow,
  isCampaignRow,
  selectCampaignRows,
  selectDividers,
  partitionCampaignRows,
  toDivider,
  dividerPayload,
  assertNotDivider,
  DIVIDER_KIND,
} from "./campaigns/entities";

/** @deprecated legacy alias — use `CampaignSectionDivider`. */
export type CampaignDivider = CampaignSectionDivider;

/** @deprecated legacy alias — use `isDividerPayload`. */
export const isDividerData = isDividerPayload;

export type FeedItem =
  | { type: "divider"; divider: CampaignSectionDivider }
  | { type: "campaign"; campaign: Campaign };

export interface EraSection {
  divider: CampaignSectionDivider | null; // null = uncategorized leading section
  campaigns: Campaign[];
}

/** Sort key for a divider — same axis as campaigns. */
export function dividerSortKey(d: CampaignSectionDivider): number {
  return typeof d.order === "number" && Number.isFinite(d.order)
    ? d.order
    : Number.POSITIVE_INFINITY;
}

/** Build the divider list from raw storage rows. */
export function dividersFromRows(rows: readonly RawCampaignRow[] | null | undefined) {
  return selectDividers(rows);
}

/**
 * Merge campaigns + dividers into a single ordered feed using the shared
 * chronological_order axis. Any divider that sneaks into `campaigns` is
 * dropped — campaign pipelines never carry dividers.
 */
export function buildFeed(
  campaigns: Campaign[],
  dividers: CampaignSectionDivider[],
): FeedItem[] {
  const cs = campaigns
    .filter((c) => !isDividerPayload(c))
    .map((c) => withBackfilledChronology(c));
  const items: { key: number; tiebreak: string; item: FeedItem }[] = [];
  for (const c of cs) {
    items.push({ key: campaignSortKey(c), tiebreak: c.title ?? "", item: { type: "campaign", campaign: c } });
  }
  for (const d of dividers) {
    // Tiny epsilon so a divider whose order equals a campaign's order still
    // sorts BEFORE that campaign (a divider opens the section).
    items.push({ key: dividerSortKey(d) - 0.0001, tiebreak: "", item: { type: "divider", divider: d } });
  }
  items.sort((a, b) => {
    if (a.key !== b.key) return a.key - b.key;
    return a.tiebreak.localeCompare(b.tiebreak, "ar");
  });
  return items.map((x) => x.item);
}

/** Group the feed into era sections for player rendering. */
export function groupFeedIntoSections(feed: FeedItem[]): EraSection[] {
  const sections: EraSection[] = [];
  let current: EraSection = { divider: null, campaigns: [] };
  for (const it of feed) {
    if (it.type === "divider") {
      if (current.divider || current.campaigns.length > 0) sections.push(current);
      current = { divider: it.divider, campaigns: [] };
    } else {
      current.campaigns.push(it.campaign);
    }
  }
  if (current.divider || current.campaigns.length > 0) sections.push(current);
  // Drop empty leading uncategorized section
  return sections.filter((s) => s.divider || s.campaigns.length > 0);
}

// Re-exported for callers that need the raw-row predicate under the old name.
export { isDividerRow as isDividerStorageRow, toDivider as normalizeDivider };
