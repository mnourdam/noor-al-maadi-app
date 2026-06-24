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

/** All published campaigns, ordered chronologically (oldest historical period first). */
export async function fetchPublishedCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("admin_campaigns")
    .select("id, slug, data")
    .eq("status", "published");
  if (error) {
    console.warn("[supabaseCampaigns] list failed:", error.message);
    return [];
  }
  const all = (data ?? [])
    .map((r) => r.data as unknown as Campaign)
    .filter((c) => c && c.status === "published");
  return sortCampaignsChronological(all);
}

/** Resolve a published campaign by UUID id or slug. */
export async function fetchCampaignByIdOrSlug(idOrSlug: string): Promise<Campaign | null> {
  if (!idOrSlug) return null;
  // Try id first.
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
  if (row.error) {
    console.warn("[supabaseCampaigns] resolve failed:", row.error.message);
    return null;
  }
  const c = (row.data?.data ?? null) as Campaign | null;
  if (!c || c.status !== "published") return null;
  return c;
}
