/**
 * Snapshot validation. Pure, runs against an in-memory OfflineSnapshot.
 *
 * Checks:
 *  - all required collections present and non-empty
 *  - no unexpected collection keys (admin/private leakage)
 *  - no duplicate ids per collection
 *  - no draft / unverified rows for published-only collections
 *  - referential integrity for atlas → encyclopedia links
 */
import type { OfflineSnapshot } from "./offline-storage";
import { COLLECTIONS, REQUIRED_COLLECTION_KEYS } from "./offline-snapshot";

export interface ValidationIssue {
  level: "error" | "warning";
  collection?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

const ALLOWED_KEYS = new Set(COLLECTIONS.map((c) => c.key));

export function validateSnapshot(snap: OfflineSnapshot | null): ValidationReport {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue["level"], message: string, collection?: string) =>
    issues.push({ level, message, collection });

  if (!snap) {
    add("error", "لا توجد لقطة لتحقّقها.");
    return finalize(issues);
  }

  if (typeof snap.snapshot_version !== "number") add("error", "snapshot_version مفقود.");
  if (typeof snap.schema_version !== "number") add("error", "schema_version مفقود.");
  if (!snap.generated_at) add("error", "generated_at مفقود.");
  if (!snap.collections || typeof snap.collections !== "object") {
    add("error", "collections مفقودة.");
    return finalize(issues);
  }

  // Required collections present + non-empty.
  for (const key of REQUIRED_COLLECTION_KEYS) {
    const rows = snap.collections[key];
    if (!Array.isArray(rows)) add("error", `مجموعة مطلوبة مفقودة: ${key}`, key);
    else if (rows.length === 0) add("error", `مجموعة مطلوبة فارغة: ${key}`, key);
  }

  // No unexpected (potentially private) collections.
  for (const k of Object.keys(snap.collections)) {
    if (!ALLOWED_KEYS.has(k as any)) {
      add("error", `مجموعة غير مسموح بها في اللقطة العامة: ${k}`, k);
    }
  }

  // Per-collection checks.
  const encIds = new Set<string>();
  for (const [key, rows] of Object.entries(snap.collections)) {
    if (!Array.isArray(rows)) continue;

    // Duplicate id detection.
    const seen = new Set<string>();
    for (const r of rows) {
      const id = (r as any)?.id;
      if (id == null) continue;
      if (seen.has(String(id))) add("error", `id مكرر في ${key}: ${id}`, key);
      seen.add(String(id));
    }

    if (key === "encyclopedia_entities") {
      for (const r of rows) {
        const id = (r as any)?.id;
        if (id) encIds.add(String(id));
        if ((r as any)?.enabled === false) add("warning", "إدخال موسوعة معطّل ضمن اللقطة.", key);
      }
    }
    if (key === "admin_campaigns") {
      for (const r of rows) {
        if ((r as any)?.status && (r as any).status !== "published") {
          add("error", `حملة غير منشورة في اللقطة: ${(r as any)?.slug ?? (r as any)?.id}`, key);
        }
      }
    }
    if (key === "atlas_entities") {
      for (const r of rows) {
        if ((r as any)?.status !== "published" || (r as any)?.aps_verified !== true) {
          add("error", `أطلس غير موثّق/منشور: ${(r as any)?.slug ?? (r as any)?.id}`, key);
        }
      }
    }
  }

  // Atlas → encyclopedia link integrity.
  const atlas = snap.collections["atlas_entities"];
  if (Array.isArray(atlas) && encIds.size > 0) {
    for (const r of atlas) {
      const link = (r as any)?.encyclopedia_entity_id;
      if (link && !encIds.has(String(link))) {
        add("warning", `رابط موسوعة مفقود لكيان أطلس: ${(r as any)?.slug ?? (r as any)?.id}`, "atlas_entities");
      }
    }
  }

  // Forbidden columns (defense in depth — PII leakage).
  const FORBIDDEN_KEYS = ["email", "password", "phone", "user_id", "ip", "auth_token"];
  for (const [key, rows] of Object.entries(snap.collections)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const sample = rows[0] as Record<string, unknown>;
    for (const f of FORBIDDEN_KEYS) {
      if (f in (sample ?? {})) add("error", `حقل خاص يجب ألا يُصدّر: ${key}.${f}`, key);
    }
  }

  return finalize(issues);
}

function finalize(issues: ValidationIssue[]): ValidationReport {
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  return { ok: errors === 0, errors, warnings, issues };
}
