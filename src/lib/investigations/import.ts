// ============================================================
// Investigation Editorial Import (v2)
// ------------------------------------------------------------
// Round-trip contract:
//   Export → external editing → re-import → same investigation
//   updated in place.
//
//  * Identity priority: id, then slug. Never a new id for an
//    existing investigation, never a duplicate row.
//  * Partial-safe: only the keys present in the file are written;
//    drafts, publication timestamps, version history, editor
//    metadata and play/progress data are untouched.
//  * Nested gameplay (steps and their clues / options / hints /
//    explanations) is replaced deterministically by stable id.
//  * Two phases: dry_run (no writes, full diff) then commit
//    (single transaction inside the RPC).
//
// All logic lives in `public.admin_import_investigations_v2`
// (SECURITY DEFINER, content-editor gated). This file is a thin
// typed wrapper plus file parsing.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { notifyInvestigationInvalidated } from "@/lib/investigations/adminApi";

export type ImportAction = "create" | "update" | "noop" | "blocked";

export interface ImportItemResult {
  action: ImportAction;
  id: string | null;
  slug: string | null;
  title: string | null;
  matched_by: "id" | "slug" | null;
  updated_fields: string[];
  added: { steps?: string[]; related_entities?: string[] };
  removed: { steps?: string[]; related_entities?: string[] };
  warnings: string[];
  errors: string[];
  counts?: { steps: number; related_entities: number };
}

export interface ImportRunResult {
  ok: boolean;
  mode: "dry_run" | "commit";
  allow_removals: boolean;
  totals: {
    items: number;
    created: number;
    updated: number;
    unchanged: number;
    blocked: number;
  };
  items: ImportItemResult[];
}

/** Arabic labels for the diffed columns, for the dry-run summary. */
export const FIELD_LABELS: Record<string, string> = {
  slug: "المعرّف النصي (slug)",
  world_slug: "العالم",
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  description: "الوصف",
  difficulty: "الصعوبة",
  enabled: "حالة التفعيل",
  reward: "المكافآت",
  steps: "خطوات اللعب",
  related_entities: "المراجع المرتبطة",
};

export interface ParsedImportFile {
  /** Normalized array of investigation objects. */
  investigations: Record<string, unknown>[];
  /** Envelope shape detected in the file. */
  shape: "bundle" | "array" | "single";
  warnings: string[];
}

/**
 * Accepts any of the shapes the export pipeline can produce:
 *   { kind: "irth.investigations.export", investigations: [...] }
 *   { investigation: {...} } · [ {...} ] · {...}
 */
export function parseImportFile(text: string): ParsedImportFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`ملف JSON غير صالح: ${e?.message ?? "خطأ في التحليل"}`);
  }

  const warnings: string[] = [];
  let shape: ParsedImportFile["shape"] = "single";
  let list: unknown[];

  if (Array.isArray(json)) {
    shape = "array";
    list = json;
  } else if (json && typeof json === "object" && Array.isArray((json as any).investigations)) {
    shape = "bundle";
    list = (json as any).investigations;
    const kind = (json as any).kind;
    if (kind && kind !== "irth.investigations.export") {
      warnings.push(`نوع الملف غير معتاد: ${String(kind)}`);
    }
  } else if (json && typeof json === "object" && (json as any).investigation) {
    list = [(json as any).investigation];
  } else if (json && typeof json === "object") {
    list = [json];
  } else {
    throw new Error("بنية الملف غير مدعومة.");
  }

  const investigations = list.filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x),
  );
  if (investigations.length === 0) throw new Error("الملف لا يحتوي أي تحقيق.");
  if (investigations.length !== list.length) {
    warnings.push(`تم تجاهل ${list.length - investigations.length} عنصرًا غير صالح.`);
  }
  if (investigations.some((x) => !x.id && !x.slug)) {
    warnings.push("بعض العناصر لا تحتوي id ولا slug — ستُعالج كتحقيقات جديدة.");
  }

  return { investigations, shape, warnings };
}

async function run(
  investigations: Record<string, unknown>[],
  mode: "dry_run" | "commit",
  allowRemovals: boolean,
): Promise<ImportRunResult> {
  const { data, error } = await supabase.rpc("admin_import_investigations_v2" as any, {
    p_payload: { investigations } as any,
    p_options: { mode, allow_removals: allowRemovals } as any,
  });
  if (error) throw error;
  return data as unknown as ImportRunResult;
}

/** Phase 1 — compute the diff. Writes nothing. */
export function previewInvestigationImport(
  investigations: Record<string, unknown>[],
  allowRemovals: boolean,
): Promise<ImportRunResult> {
  return run(investigations, "dry_run", allowRemovals);
}

/** Phase 2 — apply the approved plan in one transaction. */
export async function commitInvestigationImport(
  investigations: Record<string, unknown>[],
  allowRemovals: boolean,
): Promise<ImportRunResult> {
  const result = await run(investigations, "commit", allowRemovals);
  for (const item of result.items) {
    if (item.id && (item.action === "create" || item.action === "update")) {
      notifyInvestigationInvalidated(item.id, "publish");
    }
  }
  return result;
}
