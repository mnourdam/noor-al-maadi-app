// ============================================================
// Campaign Era Dividers
// ------------------------------------------------------------
// Dividers are first-class timeline section objects stored as rows
// in `admin_campaigns` with `data.kind === "divider"`. They share
// the same `chronological_order` axis as campaigns, so admin drag
// ordering, offline snapshot, and player display all reuse the
// existing pipeline — no schema change required.
//
// A divider's role is purely structural: it groups every campaign
// that follows it (until the next divider) into one era section.
// Designed as a reusable timeline section object so we can later
// attach descriptions, artwork, progress, and unlock state.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { campaignSortKey } from "./campaignChronology";
import { withBackfilledChronology } from "./campaignChronologyBackfill";

export interface CampaignDivider {
  kind: "divider";
  id: string;
  title: string;
  subtitle?: string;
  chronological_order?: number;
  /** Reserved for future enrichment (era key, artwork, etc.). */
  era?: string;
  artwork?: string;
  description?: string;
  status?: "published" | "draft";
}

export type FeedItem =
  | { type: "divider"; divider: CampaignDivider }
  | { type: "campaign"; campaign: Campaign };

export interface EraSection {
  divider: CampaignDivider | null; // null = uncategorized leading section
  campaigns: Campaign[];
}

export function isDividerData(d: any): d is CampaignDivider {
  return !!d && typeof d === "object" && d.kind === "divider";
}

/** Sort key for a divider — same axis as campaigns. */
export function dividerSortKey(d: CampaignDivider): number {
  if (typeof d.chronological_order === "number" && Number.isFinite(d.chronological_order)) {
    return d.chronological_order;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Merge campaigns + dividers into a single ordered feed using the shared
 * chronological_order axis. Stable, deterministic — never depends on
 * insertion order or timestamps.
 */
export function buildFeed(campaigns: Campaign[], dividers: CampaignDivider[]): FeedItem[] {
  const cs = campaigns.map((c) => withBackfilledChronology(c));
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
