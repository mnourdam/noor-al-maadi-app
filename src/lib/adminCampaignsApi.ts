// ============================================================
// Admin Campaign CMS — API wrappers
// ------------------------------------------------------------
// Thin client-side layer over the SECURITY DEFINER RPCs added in the
// Campaign Management Studio migration. All writes go through these
// functions so publishing atomically bumps `content_version` and
// snapshots into `admin_campaign_versions`. Player progress lives in
// `user_campaign_progress` / localStorage and is never touched here.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Campaign } from "@/types/campaign";

export interface AdminCampaignRow {
  id: string;
  slug: string | null;
  title: string;
  status: "draft" | "published" | "archived";
  data: any;                 // published (player-visible) snapshot
  draft_data: any | null;    // editor working copy
  content_version: number;
  published_at: string | null;
  updated_by: string | null;
  last_editor_email: string | null;
  has_unpublished_changes: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignVersion {
  version: number;
  title: string | null;
  editor_email: string | null;
  note: string | null;
  created_at: string;
}

export interface CampaignProgressStats {
  total_players: number;
  completed_campaign: number;
  per_chapter_completed: Record<string, number>;
}

// -------------------- Reads --------------------

export async function fetchAdminCampaign(id: string): Promise<AdminCampaignRow | null> {
  const { data, error } = await supabase
    .from("admin_campaigns" as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AdminCampaignRow) ?? null;
}

export async function listCampaignVersions(id: string): Promise<CampaignVersion[]> {
  const { data, error } = await supabase.rpc("admin_list_campaign_versions" as any, { p_id: id });
  if (error) throw error;
  return (data as CampaignVersion[]) ?? [];
}

export async function fetchCampaignVersion(id: string, version: number): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from("admin_campaign_versions" as any)
    .select("data")
    .eq("campaign_id", id)
    .eq("version", version)
    .maybeSingle();
  if (error) throw error;
  return ((data as any)?.data as Campaign) ?? null;
}

export async function fetchCampaignProgressStats(id: string): Promise<CampaignProgressStats> {
  const { data, error } = await supabase.rpc("admin_campaign_progress_stats" as any, { p_id: id });
  if (error) throw error;
  return (data as CampaignProgressStats) ?? {
    total_players: 0,
    completed_campaign: 0,
    per_chapter_completed: {},
  };
}

// -------------------- Writes --------------------

export async function saveCampaignDraft(input: {
  id: string;
  title: string;
  slug: string | null;
  draft: Campaign;
}): Promise<{ ok: boolean; created?: boolean }> {
  const { data, error } = await supabase.rpc("admin_save_campaign_draft" as any, {
    p_id: input.id,
    p_title: input.title,
    p_slug: input.slug,
    p_draft_data: input.draft as any,
  });
  if (error) throw error;
  notifyContentInvalidated(input.id, "draft");
  return data as any;
}

export async function publishCampaign(id: string, note?: string): Promise<{ ok: boolean; version: number }> {
  const { data, error } = await supabase.rpc("admin_publish_campaign" as any, {
    p_id: id,
    p_note: note ?? null,
  });
  if (error) throw error;
  notifyContentInvalidated(id, "publish");
  return data as any;
}

export async function restoreCampaignVersion(
  id: string, version: number, asDraft: boolean,
): Promise<{ ok: boolean; mode: string; new_version?: number }> {
  const { data, error } = await supabase.rpc("admin_restore_campaign_version" as any, {
    p_id: id, p_version: version, p_as_draft: asDraft,
  });
  if (error) throw error;
  notifyContentInvalidated(id, asDraft ? "draft" : "publish");
  return data as any;
}

export async function setCampaignStatus(id: string, status: "draft" | "published" | "archived") {
  const { error } = await supabase
    .from("admin_campaigns" as any)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  notifyContentInvalidated(id, "publish");
}

// -------------------- Cache invalidation --------------------

/**
 * Fires two signals so player views refresh immediately after publish:
 *  1. A `window` custom event for same-tab listeners (react-query invalidate).
 *  2. A BroadcastChannel message for other tabs / the player Capacitor webview.
 */
export function notifyContentInvalidated(id: string, kind: "draft" | "publish") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("irth:campaign-published", { detail: { id, kind } }));
  } catch { /* noop */ }
  try {
    const ch = new BroadcastChannel("irth-campaigns");
    ch.postMessage({ id, kind, at: Date.now() });
    ch.close();
  } catch { /* older browsers */ }
}
