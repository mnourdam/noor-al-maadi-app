// ============================================================
// Phase C — Structured Investigation Editor plan builder.
//
// Builds a one-item transactional import plan for updating an
// existing investigation. Reuses the same server RPC
// (admin_run_import_batch) as /admin/import — the only supported
// safe write path. There is NO direct SELECT / INSERT / UPDATE /
// DELETE fallback anywhere in the editor: if the RPC fails,
// the save fails.
//
// The editor is edits-only in Phase C. Slug is immutable. The
// server-side validator (admin_validate_investigation_payload)
// and stable-ID merge (admin_merge_investigation_stable_ids)
// remain the authoritative gatekeepers; this module only
// prepares the JSON envelope the RPC expects.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import {
  buildTransactionalPlan,
  stableHash,
  canonicalJSON,
  type ApprovedPlan,
} from "@/lib/import/plan";
import type { PreviewRow } from "@/lib/import/engines";
import { normalizeInvestigationRow } from "@/lib/investigations-normalize";

export interface EditorPlanInput {
  /** Existing DB row id. */
  id: string;
  /** Immutable slug (from the row loaded via admin_get_investigation_full). */
  slug: string;
  /** Editor draft (already client-side validated). */
  draft: Record<string, unknown>;
  /** updated_at seen when the editor loaded the row. */
  versionSignal: string | null;
  /** Explicit approval to drop existing nested step ids on update. */
  allowRemovals: boolean;
  /** Optional file-name-ish label surfaced in the audit log. */
  fileName?: string | null;
}

export interface EditorPlanResult {
  plan: ApprovedPlan;
  originalHash: string;
  planHash: string;
  normalized: Record<string, unknown>;
}

/** Build the single-item plan that admin_run_import_batch consumes. */
export function buildInvestigationEditorPlan(input: EditorPlanInput): EditorPlanResult {
  const { data: normalized } = normalizeInvestigationRow(input.draft as Record<string, unknown>);
  // Force the immutable slug — the editor never renames.
  normalized.slug = input.slug;

  const row: PreviewRow = {
    index: 0,
    status: "update",
    issues: [],
    title: (normalized.title as string) ?? input.slug,
    subtitle: input.slug,
    render: null,
    data: normalized,
    key: `inv|${input.slug}`,
    existingId: input.id,
    existingVersionSignal: input.versionSignal,
  };

  const canonical = canonicalJSON(normalized);
  const originalHash = stableHash(canonical);

  const plan = buildTransactionalPlan([row], {
    contentType: "investigations",
    fileName: input.fileName ?? `editor:${input.slug}`,
    originalPayloadHash: originalHash,
    overwrite: true,
    publish: false,
    allowRemovals: input.allowRemovals,
  });

  return { plan, originalHash, planHash: plan.approved_plan_hash, normalized };
}

export interface RunResult {
  ok: boolean;
  status?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  batch_id?: string | null;
  error?: string | null;
  stale?: boolean;
  raw?: unknown;
}

/**
 * Dry-run the plan. Returns { ok:true } on success — required before commit.
 * Does not modify the database.
 */
export async function dryRunInvestigationEditor(plan: ApprovedPlan): Promise<RunResult> {
  const { data, error } = await supabase.rpc("admin_run_import_batch" as any, {
    plan: plan as any,
    p_mode: "dry_run",
  });
  if (error) return { ok: false, error: error.message, raw: null };
  const res = (data ?? {}) as any;
  const stale = detectStale(res);
  const failed = res.status === "failed";
  return {
    ok: !failed,
    status: res.status,
    created: res.created ?? 0,
    updated: res.updated ?? 0,
    skipped: res.skipped ?? 0,
    failed: res.failed ?? 0,
    batch_id: res.batch_id ?? null,
    error: failed ? (res.error ?? "فشل التشغيل التجريبي.") : null,
    stale,
    raw: data,
  };
}

/**
 * Commit the plan. FAIL-CLOSED: on any error/failed status, the
 * caller must NOT fall back to a direct table write. There is no
 * such fallback anywhere in this file.
 */
export async function commitInvestigationEditor(plan: ApprovedPlan): Promise<RunResult> {
  const { data, error } = await supabase.rpc("admin_run_import_batch" as any, {
    plan: plan as any,
    p_mode: "commit",
  });
  if (error) return { ok: false, error: error.message, raw: null };
  const res = (data ?? {}) as any;
  const stale = detectStale(res);
  const failed = res.status === "failed";
  return {
    ok: !failed,
    status: res.status,
    created: res.created ?? 0,
    updated: res.updated ?? 0,
    skipped: res.skipped ?? 0,
    failed: res.failed ?? 0,
    batch_id: res.batch_id ?? null,
    error: failed ? (res.error ?? "فشل الحفظ داخل معاملة الخادم.") : null,
    stale,
    raw: data,
  };
}

function detectStale(res: any): boolean {
  if (!res) return false;
  const msg = String(res.error ?? "").toLowerCase();
  const code = String(res.code ?? "").toLowerCase();
  if (code.includes("stale") || code.includes("version")) return true;
  return /stale|version[_\s-]?signal|updated.*by another|modified.*by another/.test(msg);
}
