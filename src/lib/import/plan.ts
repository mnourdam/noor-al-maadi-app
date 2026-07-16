// ============================================================
// Phase 5 / 5.5a — Approved plan builder + checksum.
//
// Turns a set of approved PreviewRow entries into the JSON envelope
// the server RPC admin_run_import_batch expects, and computes stable
// checksums for idempotency + Dry-Run staleness detection.
//
// Phase 5.5a adds a generic plan builder for every non-campaign
// content type. Simple types (daily_facts, today_in_history_events,
// notifications, investigations) use { id } as the target key on
// update — populated from PreviewRow.existingId, which the legacy
// engine attaches during classify().
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

function encyclopediaTargetKey(data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  return { entity_type: d.entity_type, slug: d.slug };
}

function versionSignalFromEncyclopedia(row: PreviewRow): string | null {
  const cands = row.candidates ?? [];
  const target = cands.find((c) => c.severity === "exact") ?? cands[0];
  return (target as unknown as { updatedAt?: string } | undefined)?.updatedAt ?? null;
}

// ------------------------------------------------------------
// Content-type-aware target key + version signal.
// ------------------------------------------------------------

/**
 * Content types that route through the transactional server RPC.
 * Campaigns are intentionally excluded — Phase 5.5c introduces the
 * dedicated campaign RPC and stable-ID protection.
 */
export const TRANSACTIONAL_CONTENT_TYPES = [
  "encyclopedia",
  "daily_facts",
  "today_in_history_events",
  "notifications",
  "investigations",
  "campaigns",
] as const;
export type TransactionalContentType = typeof TRANSACTIONAL_CONTENT_TYPES[number];

export function isTransactionalContentType(x: string): x is TransactionalContentType {
  return (TRANSACTIONAL_CONTENT_TYPES as readonly string[]).includes(x);
}

function simpleTargetKey(row: PreviewRow): Record<string, unknown> | undefined {
  if (!row.existingId) return undefined;
  return { id: row.existingId };
}

function campaignTargetKey(row: PreviewRow): Record<string, unknown> | undefined {
  // Campaigns use text ids that live inside the payload itself.
  const d = (row.data ?? {}) as { id?: string };
  return d.id ? { id: d.id } : undefined;
}

/**
 * Build an approved plan for any transactional content type.
 * Rows already carry admin overrides + accepted relation repairs;
 * legacy engine classify() populates existingId + existingVersionSignal
 * for simple types so updates target the correct DB row.
 */
export function buildTransactionalPlan(rows: PreviewRow[], meta: {
  contentType: TransactionalContentType;
  fileName?: string | null;
  originalPayloadHash: string;
  overwrite: boolean;
  publish: boolean;
  /** Phase 5.5b/c: explicit approval to drop existing nested step/chapter IDs on update. */
  allowRemovals?: boolean;
}): ApprovedPlan {
  const items: PlanItem[] = [];
  for (const r of rows) {
    const action: PlanItem["action"] =
      r.override ?? (r.status === "blocked" ? "skip" : r.status);
    const patched = r.relations ? applyAcceptedRepairs(r.data, r.relations) : r.data;

    let targetKey: Record<string, unknown> | undefined;
    let versionSignal: string | null = null;
    if (meta.contentType === "encyclopedia") {
      targetKey = encyclopediaTargetKey(patched);
      versionSignal = versionSignalFromEncyclopedia(r);
    } else if (meta.contentType === "campaigns") {
      targetKey = campaignTargetKey(r);
      versionSignal = r.existingVersionSignal ?? null;
    } else {
      targetKey = simpleTargetKey(r);
      versionSignal = r.existingVersionSignal ?? null;
    }

    items.push({
      index: r.index,
      action,
      data: patched,
      target_key: targetKey,
      version_signal: versionSignal,
      accepted_repairs: r.relations ? { count: r.relations.counts?.remapped ?? 0 } : null,
      classification: r.status,
      issues: r.issues,
      incoming_slug: (patched as { slug?: string })?.slug,
      incoming_id: undefined,
    });
  }
  const canonical = canonicalJSON({
    contentType: meta.contentType,
    items,
    allowRemovals: !!meta.allowRemovals,
  });
  const planHash = stableHash(canonical);
  return {
    content_type: meta.contentType,
    file_name: meta.fileName ?? null,
    original_payload_hash: meta.originalPayloadHash,
    approved_plan_hash: planHash,
    overwrite: meta.overwrite,
    publish: meta.publish,
    metadata: {
      row_count: rows.length,
      allow_removals: !!meta.allowRemovals,
    },
    items,
  };
}

/** Backwards-compat alias for the previous exported name. */
export function buildEncyclopediaPlan(rows: PreviewRow[], meta: {
  contentType: string;
  fileName?: string | null;
  originalPayloadHash: string;
  overwrite: boolean;
  publish: boolean;
}): ApprovedPlan {
  return buildTransactionalPlan(rows, { ...meta, contentType: "encyclopedia" });
}
