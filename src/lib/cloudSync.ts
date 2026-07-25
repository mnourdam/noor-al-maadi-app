// ============================================================
// Cloud Sync — Lovable Cloud (Supabase) adapter
// ------------------------------------------------------------
// Bridges the existing sync localStorage API to the
// `admin_campaigns` and `content_registry` tables. Strategy:
//   • Reads stay synchronous, served from localStorage.
//   • Writes update localStorage immediately AND fire-and-forget
//     to the cloud, so the admin panel stays snappy.
//   • `pullAllFromCloud()` refreshes the local cache from the DB
//     and is called on app mount + by the admin migration button.
//   • `pushAllToCloud()` is the one-time migration helper.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/types/campaign";
import { selectCampaignRows } from "@/lib/campaigns/entities";
import type { ContentRegistryItem } from "@/types/contentRegistry";
import {
  listCampaigns,
  saveCampaigns,
  CAMPAIGNS_KEY,
} from "@/lib/campaignStorage";
import {
  listRegistry,
  saveRegistry,
  REGISTRY_KEY,
} from "@/lib/contentRegistryStorage";

// Internal flag so writes triggered by a cloud pull don't loop back.
let suppressPush = false;
export function isSuppressingPush() { return suppressPush; }

// ------------------------- Pull -------------------------

export async function pullCampaignsFromCloud(): Promise<Campaign[] | null> {
  // Read through the public safe view. Draft-only rows are intentionally
  // absent; the local admin UIs load full rows via admin_get_campaign_full.
  const { data, error } = await supabase
    .from("campaigns_public" as any)
    .select("id, data")
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[cloudSync] pull campaigns failed:", error.message);
    return null;
  }
  // Dividers share this table but are a different entity type — drop them.
  const rows = selectCampaignRows(((data as any[]) ?? []) as any[])
    .map((r) => r.data as unknown as Campaign);
  suppressPush = true;
  try { saveCampaigns(rows); } finally { suppressPush = false; }
  return rows;
}


export async function pullRegistryFromCloud(): Promise<ContentRegistryItem[] | null> {
  const { data, error } = await supabase
    .from("content_registry")
    .select("id, data")
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[cloudSync] pull registry failed:", error.message);
    return null;
  }
  const rows = (data ?? []).map(r => r.data as unknown as ContentRegistryItem);
  suppressPush = true;
  try { saveRegistry(rows); } finally { suppressPush = false; }
  return rows;
}

export async function pullAllFromCloud(): Promise<{ campaigns: number; registry: number } | null> {
  const [c, r] = await Promise.all([pullCampaignsFromCloud(), pullRegistryFromCloud()]);
  if (c === null && r === null) return null;
  return { campaigns: c?.length ?? 0, registry: r?.length ?? 0 };
}

// ------------------------- Push (single) -------------------------

export async function pushCampaign(c: Campaign): Promise<void> {
  if (suppressPush) return;
  const { error } = await supabase
    .from("admin_campaigns")
    .upsert({
      id: c.id,
      slug: c.slug ?? null,
      title: c.title,
      status: c.status,
      data: c as any,
    }, { onConflict: "id" });
  if (error) console.warn("[cloudSync] push campaign failed:", error.message);
}

export async function pushRegistryItem(item: ContentRegistryItem): Promise<void> {
  if (suppressPush) return;
  const { error } = await supabase
    .from("content_registry")
    .upsert({
      id: item.id,
      type: item.type,
      name: item.name,
      data: item as any,
    }, { onConflict: "id" });
  if (error) console.warn("[cloudSync] push registry item failed:", error.message);
}

export async function deleteCampaignFromCloud(id: string): Promise<void> {
  if (suppressPush) return;
  const { error } = await supabase.from("admin_campaigns").delete().eq("id", id);
  if (error) console.warn("[cloudSync] delete campaign failed:", error.message);
}

export async function deleteRegistryItemFromCloud(id: string): Promise<void> {
  if (suppressPush) return;
  const { error } = await supabase.from("content_registry").delete().eq("id", id);
  if (error) console.warn("[cloudSync] delete registry item failed:", error.message);
}

// ------------------------- One-time migration -------------------------

export interface MigrationReport {
  campaignsUploaded: number;
  registryUploaded: number;
  errors: string[];
}

export async function pushAllToCloud(): Promise<MigrationReport> {
  const errors: string[] = [];
  const campaigns = listCampaigns();
  const registry = listRegistry();

  let campaignsUploaded = 0;
  let registryUploaded = 0;

  if (campaigns.length) {
    const { error } = await supabase
      .from("admin_campaigns")
      .upsert(
        campaigns.map(c => ({
          id: c.id,
          slug: c.slug ?? null,
          title: c.title,
          status: c.status,
          data: c as any,
        })),
        { onConflict: "id" },
      );
    if (error) errors.push(`campaigns: ${error.message}`);
    else campaignsUploaded = campaigns.length;
  }

  if (registry.length) {
    const { error } = await supabase
      .from("content_registry")
      .upsert(
        registry.map(i => ({
          id: i.id,
          type: i.type,
          name: i.name,
          data: i as any,
        })),
        { onConflict: "id" },
      );
    if (error) errors.push(`registry: ${error.message}`);
    else registryUploaded = registry.length;
  }

  return { campaignsUploaded, registryUploaded, errors };
}

// Re-export storage keys for the admin migration UI to reference.
export const STORAGE_KEYS = { CAMPAIGNS_KEY, REGISTRY_KEY } as const;
