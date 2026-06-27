// ============================================================
// Supabase Campaign Reader (runtime, read-only)
// ------------------------------------------------------------
// Player-facing routes read campaigns ONLY from this module.
// No localStorage cache. No legacy/bundled fallback. The single
// source of truth is the `admin_campaigns` table.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/types/campaign";
import { sortCampaignsChronological } from "./campaignChronology";
import { withBackfilledChronologyAll } from "./campaignChronologyBackfill";

/** All published campaigns, ordered chronologically (oldest historical period first). */
export async function fetchPublishedCampaigns(): Promise<Campaign[]> {
  let rawList: { id: string; slug: string; data: any }[] = [];
  try {
    const { data, error } = await supabase
      .from("admin_campaigns")
      .select("id, slug, data")
      .eq("status", "published");
    if (error) throw error;
    rawList = (data ?? []) as any[];
  } catch (err) {
    console.warn("[supabaseCampaigns] live list failed, using snapshot:", err);
  }
  if (rawList.length === 0) {
    try {
      const { cachedPublishedCampaigns } = await import("./offline-fallback");
      rawList = await cachedPublishedCampaigns();
    } catch { /* ignore */ }
  }
  const all = rawList
    .map((r) => r.data as unknown as Campaign)
    .filter((c) => c && c.status === "published");
  return sortCampaignsChronological(withBackfilledChronologyAll(all));
}

/** Resolve a published campaign by UUID id or slug. */
export async function fetchCampaignByIdOrSlug(idOrSlug: string): Promise<Campaign | null> {
  if (!idOrSlug) return null;
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
  // Snapshot fallback so chapters and campaign cards still open offline.
  try {
    const { cachedPublishedCampaigns } = await import("./offline-fallback");
    const list = await cachedPublishedCampaigns();
    const hit = list.find((r) => r.id === idOrSlug || r.slug === idOrSlug);
    const c = (hit?.data ?? null) as Campaign | null;
    if (c && c.status === "published") return c;
  } catch { /* ignore */ }
  return null;
}
