// ============================================================
// Investigation lifecycle admin API (Phase D)
// ------------------------------------------------------------
// Thin wrappers over the SECURITY DEFINER RPCs that own the
// draft / publish / version-history / rollback lifecycle. All
// admin writes go through these — never the base table.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface InvestigationVersionRow {
  version: number;
  title: string | null;
  source: string | null;
  editor_email: string | null;
  note: string | null;
  created_at: string;
}

export interface InvestigationLifecycle {
  content_version: number;
  published_at: string | null;
  has_unpublished_changes: boolean;
  last_editor_email: string | null;
  last_draft_saved_at: string | null;
}

/** Save the editor's draft. Player-visible content is NOT changed. */
export async function saveInvestigationDraft(input: {
  id: string;
  draft: Record<string, unknown>;
  versionSignal: string | null;
  allowRemovals: boolean;
}): Promise<{ ok: true; last_draft_saved_at: string }> {
  const { data, error } = await supabase.rpc("admin_save_investigation_draft" as any, {
    p_id: input.id,
    p_draft: input.draft as any,
    p_version_signal: input.versionSignal,
    p_allow_removals: input.allowRemovals,
  });
  if (error) throw error;
  notifyInvestigationInvalidated(input.id, "draft");
  return data as any;
}

/** Promote the current draft to the published snapshot (atomic + versioned). */
export async function publishInvestigation(input: {
  id: string;
  note?: string | null;
  allowRemovals: boolean;
  versionSignal: string | null;
}): Promise<{ ok: true; mode: "publish" | "noop"; version: number }> {
  const { data, error } = await supabase.rpc("admin_publish_investigation" as any, {
    p_id: input.id,
    p_note: input.note ?? null,
    p_allow_removals: input.allowRemovals,
    p_version_signal: input.versionSignal,
  });
  if (error) throw error;
  notifyInvestigationInvalidated(input.id, "publish");
  return data as any;
}

export async function listInvestigationVersions(id: string): Promise<InvestigationVersionRow[]> {
  const { data, error } = await supabase.rpc("admin_list_investigation_versions" as any, { p_id: id });
  if (error) throw error;
  return (data as InvestigationVersionRow[]) ?? [];
}

export async function getInvestigationVersion(id: string, version: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("admin_get_investigation_version" as any, {
    p_id: id, p_version: version,
  });
  if (error) throw error;
  return (data as Record<string, unknown>) ?? null;
}

export async function restoreInvestigationVersionToDraft(
  id: string, version: number,
): Promise<{ ok: true; restored_from: number }> {
  const { data, error } = await supabase.rpc("admin_restore_investigation_version_to_draft" as any, {
    p_id: id, p_version: version,
  });
  if (error) throw error;
  notifyInvestigationInvalidated(id, "draft");
  return data as any;
}

/**
 * Fires two signals so player views refresh immediately after publish
 * and admin surfaces refresh after any draft change:
 *  1. window custom event for same-tab listeners.
 *  2. BroadcastChannel message for other tabs / the player Capacitor webview.
 * Draft events should refresh admin/editor surfaces only; only "publish"
 * events should invalidate player caches.
 */
export function notifyInvestigationInvalidated(id: string, kind: "draft" | "publish") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("irth:investigation-published", { detail: { id, kind } }));
  } catch { /* noop */ }
  try {
    const ch = new BroadcastChannel("irth-investigations");
    ch.postMessage({ id, kind, at: Date.now() });
    ch.close();
  } catch { /* older browsers */ }
}

// -------------------- Publish-event invalidation --------------------
//
// Mirrors the campaigns pattern (see `onCampaignPublished` in
// `src/lib/supabaseCampaigns.ts`). Consumers subscribe once; the singleton
// listener busts the local in-memory investigation cache so the very next
// `useSupabaseInvestigation(s)` refresh reads freshly-published data from
// Supabase, then fans out to registered listeners (admin list / player
// hooks) for immediate re-render of already-open pages.

type InvestigationPublishListener = (id: string, kind: "draft" | "publish") => void;
const _investigationPublishListeners = new Set<InvestigationPublishListener>();
let _investigationPublishInstalled = false;

function ensureInvestigationPublishListener() {
  if (_investigationPublishInstalled || typeof window === "undefined") return;
  _investigationPublishInstalled = true;
  const handle = async (id: string, kind: "draft" | "publish") => {
    if (id) {
      // Best-effort: bust the local snapshot copy so the next player fetch
      // falls through to Supabase.
      try {
        const { invalidateLocalInvestigation } = await import("@/lib/local-first-store");
        invalidateLocalInvestigation(id);
      } catch { /* noop */ }
    }
    _investigationPublishListeners.forEach((fn) => {
      try { fn(id, kind); } catch { /* noop */ }
    });
  };
  window.addEventListener("irth:investigation-published", (e: any) => {
    handle(e?.detail?.id, e?.detail?.kind ?? "publish");
  });
  try {
    const ch = new BroadcastChannel("irth-investigations");
    ch.onmessage = (m) => handle(m?.data?.id, m?.data?.kind ?? "publish");
  } catch { /* noop */ }
}

/**
 * Subscribe to investigation publish/draft notifications. Returns an
 * unsubscribe function. Mirrors `onCampaignPublished`.
 */
export function onInvestigationPublished(fn: InvestigationPublishListener): () => void {
  ensureInvestigationPublishListener();
  _investigationPublishListeners.add(fn);
  return () => { _investigationPublishListeners.delete(fn); };
}
