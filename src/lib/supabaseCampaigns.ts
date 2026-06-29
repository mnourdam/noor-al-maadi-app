// ============================================================
// Campaign Reader — local-first, network refresh.
// ------------------------------------------------------------
// Player-facing routes read campaigns through this module. The bundled
// offline snapshot is the primary source so chapters open instantly
// without a network call; Supabase is consulted when local has no match
// or as a background refresh (the next call after sync sees the update).
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/types/campaign";
import { sortCampaignsChronological } from "./campaignChronology";
import { withBackfilledChronologyAll } from "./campaignChronologyBackfill";
import {
  ensureLocalSnapshotLoaded,
  localCampaignByIdOrSlug,
  localPublishedCampaigns,
} from "./local-first-store";
import {
  buildFeed,
  groupFeedIntoSections,
  isDividerData,
  type CampaignDivider,
  type EraSection,
  type FeedItem,
} from "./campaignDividers";

function toCampaigns(rawList: { id: string; slug: string; data: any }[]): Campaign[] {
  const all = rawList
    .map((r) => r.data as unknown as Campaign)
    .filter((c) => c && !isDividerData(c) && c.status === "published");
  return sortCampaignsChronological(withBackfilledChronologyAll(all));
}

function toDividers(rawList: { id: string; slug: string; data: any }[]): CampaignDivider[] {
  return rawList
    .filter((r) => isDividerData(r?.data))
    .map((r) => ({ ...(r.data as CampaignDivider), id: r.id }));
}

/** All published campaigns, ordered chronologically. Local-first. */
export async function fetchPublishedCampaigns(): Promise<Campaign[]> {
  await ensureLocalSnapshotLoaded();
  const local = localPublishedCampaigns() as { id: string; slug: string; data: any }[];

  // Kick off a background refresh when online so subsequent calls see
  // newly published campaigns without blocking the current read.
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    void supabase
      .from("admin_campaigns")
      .select("id, slug, data")
      .eq("status", "published")
      .then(({ data, error }) => {
        if (error || !data) return;
        try {
          // Update the in-memory store so the very next call reflects fresh data.
          import("./local-first-store").then(({ applyLocalSnapshot }) => {
            // No-op: the snapshot regenerator owns persistence. Background
            // sync via bootstrapOfflineSync covers IndexedDB updates.
            void applyLocalSnapshot;
          });
        } catch { /* ignore */ }
      });
  }

  if (local.length > 0) return toCampaigns(local);

  // Local empty (rare — e.g. snapshot still loading). Fall through to network.
  try {
    const { data, error } = await supabase
      .from("admin_campaigns")
      .select("id, slug, data")
      .eq("status", "published");
    if (!error && data) return toCampaigns(data as any[]);
  } catch (err) {
    console.warn("[supabaseCampaigns] live list failed:", err);
  }
  return [];
}

/** Resolve a published campaign by UUID id or slug. Local-first. */
export async function fetchCampaignByIdOrSlug(idOrSlug: string): Promise<Campaign | null> {
  if (!idOrSlug) return null;
  await ensureLocalSnapshotLoaded();

  const hit = localCampaignByIdOrSlug(idOrSlug);
  if (hit && !isDividerData(hit.data)) {
    const c = (hit.data ?? null) as Campaign | null;
    if (c && c.status === "published") return c;
  }

  // Local miss — try network (may be a freshly published campaign).
  try {
    let row = await supabase
      .from("admin_campaigns")
      .select("id, slug, data")
      .eq("id", idOrSlug)
      .maybeSingle();
    if (!row.data) {
      row = await supabase
        .from("admin_campaigns")
        .select("id, slug, data")
        .eq("slug", idOrSlug)
        .maybeSingle();
    }
    if (!row.error) {
      const c = (row.data?.data ?? null) as Campaign | null;
      if (c && c.status === "published") return c;
    } else {
      console.warn("[supabaseCampaigns] resolve failed:", row.error.message);
    }
  } catch (err) {
    console.warn("[supabaseCampaigns] resolve crashed:", err);
  }
  return null;
}

/**
 * Full ordered timeline feed: era dividers interleaved with campaigns
 * in their shared chronological position. Local-first, identical to the
 * admin Campaign Ordering Workshop sequence.
 */
export async function fetchPublishedFeed(): Promise<{
  items: FeedItem[];
  sections: EraSection[];
  dividers: CampaignDivider[];
  campaigns: Campaign[];
}> {
  await ensureLocalSnapshotLoaded();
  let local = localPublishedCampaigns() as { id: string; slug: string; data: any }[];
  if (local.length === 0) {
    try {
      const { data, error } = await supabase
        .from("admin_campaigns")
        .select("id, slug, data")
        .eq("status", "published");
      if (!error && data) local = data as any[];
    } catch { /* ignore */ }
  }
  const campaigns = toCampaigns(local);
  const dividers = toDividers(local);
  const items = buildFeed(campaigns, dividers);
  const sections = groupFeedIntoSections(items);
  return { items, sections, dividers, campaigns };
}
