// ============================================================
// Phase 5 — Approved plan builder + checksum.
//
// Turns a set of approved PreviewRow entries into the JSON envelope
// the server RPC admin_run_import_batch expects, and computes stable
// checksums for idempotency + Dry-Run staleness detection.
// ============================================================
import type { PreviewRow } from "./engines";
import { applyAcceptedRepairs } from "./relations-report";

export interface PlanItem {
  index: number;
  action: "new" | "update" | "skip" | "alias";
  data: unknown;
  target_key?: Record<string, unknown>;
  version_signal?: string | null;
  accepted_repairs?: unknown;
  classification?: string;
  issues?: unknown;
  incoming_id?: string;
  incoming_slug?: string;
}

export interface ApprovedPlan {
  content_type: string;
  file_name?: string | null;
  original_payload_hash: string;
  approved_plan_hash: string;
  overwrite: boolean;
  publish: boolean;
  metadata?: Record<string, unknown>;
  items: PlanItem[];
}

/** Small, stable, non-cryptographic hash (FNV-1a 64) for browser use. */
export function stableHash(input: string): string {
  // FNV-1a 32-bit doubled — good enough for idempotency keys.
  let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = (h1 * 16777619) >>> 0;
    h2 ^= input.charCodeAt(input.length - 1 - i);
    h2 = (h2 * 16777619) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Deterministic JSON stringify — sorted object keys. */
export function canonicalJSON(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** Extract a target key from the row for lookup on commit. */
function encyclopediaTargetKey(data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  return { entity_type: d.entity_type, slug: d.slug };
}

/** Version signal captured at preview time; null when we don't have one yet. */
function versionSignalFromRow(row: PreviewRow): string | null {
  const cands = row.candidates ?? [];
  const target = cands.find((c) => c.severity === "exact") ?? cands[0];
  return (target as unknown as { updatedAt?: string } | undefined)?.updatedAt ?? null;
}

/**
 * Build a plan for the encyclopedia engine.
 * Rows already carry admin overrides + accepted relation repairs.
 */
export function buildEncyclopediaPlan(rows: PreviewRow[], meta: {
  contentType: string;
  fileName?: string | null;
  originalPayloadHash: string;
  overwrite: boolean;
  publish: boolean;
}): ApprovedPlan {
  const items: PlanItem[] = [];
  for (const r of rows) {
    const action: PlanItem["action"] =
      r.override ?? (r.status === "blocked" ? "skip" : r.status);
    const patched = r.relations ? applyAcceptedRepairs(r.data, r.relations) : r.data;
    items.push({
      index: r.index,
      action,
      data: patched,
      target_key: encyclopediaTargetKey(patched),
      version_signal: versionSignalFromRow(r),
      accepted_repairs: r.relations ? { count: r.relations.counts?.remapped ?? 0 } : null,
      classification: r.status,
      issues: r.issues,
      incoming_slug: (patched as { slug?: string })?.slug,
      incoming_id: undefined,
    });
  }
  const canonical = canonicalJSON({ contentType: meta.contentType, items });
  const planHash = stableHash(canonical);
  return {
    content_type: meta.contentType,
    file_name: meta.fileName ?? null,
    original_payload_hash: meta.originalPayloadHash,
    approved_plan_hash: planHash,
    overwrite: meta.overwrite,
    publish: meta.publish,
    metadata: { row_count: rows.length },
    items,
  };
}
