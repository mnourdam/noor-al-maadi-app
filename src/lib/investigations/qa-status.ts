// ============================================================
// Investigation QA / Review workflow — ADMIN ONLY
// ------------------------------------------------------------
// This status lives in its own table (`investigation_qa_status`)
// and is NEVER part of the investigation payload:
//  - not exported in JSON/CSV bundles
//  - not imported from JSON
//  - never read by the player app
//  - never affects ordering or gameplay
// It exists purely to organize the editorial review workshop.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type QaStatus = "needs_review" | "in_review" | "golden" | "needs_rebuild";

export const QA_STATUSES: QaStatus[] = [
  "needs_review",
  "in_review",
  "golden",
  "needs_rebuild",
];

/** Default for any investigation that has no explicit review record yet. */
export const QA_DEFAULT: QaStatus = "needs_review";

export const QA_LABEL: Record<QaStatus, string> = {
  needs_review: "يحتاج مراجعة",
  in_review: "قيد المراجعة",
  golden: "مطابق للقالب الذهبي",
  needs_rebuild: "يحتاج إعادة بناء",
};

export const QA_DOT: Record<QaStatus, string> = {
  needs_review: "🟠",
  in_review: "🟡",
  golden: "🟢",
  needs_rebuild: "🔴",
};

export const QA_CLASS: Record<QaStatus, string> = {
  needs_review: "border-orange-400/40 bg-orange-500/10 text-orange-200",
  in_review: "border-yellow-400/40 bg-yellow-500/10 text-yellow-100",
  golden: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  needs_rebuild: "border-red-400/40 bg-red-500/10 text-red-200",
};

/** Workshop ordering: unfinished work first, golden last. */
export const QA_WORK_ORDER: Record<QaStatus, number> = {
  needs_rebuild: 0,
  needs_review: 1,
  in_review: 2,
  golden: 3,
};

export function normalizeQaStatus(v: unknown): QaStatus {
  return QA_STATUSES.includes(v as QaStatus) ? (v as QaStatus) : QA_DEFAULT;
}

export interface QaRow {
  investigation_id: string;
  status: QaStatus;
  note: string | null;
  updated_at: string;
}

/** Load the whole review board. Returns an empty map on any failure. */
export async function loadQaStatuses(): Promise<Map<string, QaRow>> {
  const map = new Map<string, QaRow>();
  try {
    const { data, error } = await supabase.rpc("admin_list_investigation_qa_status" as any);
    if (error) throw error;
    for (const r of (data as any[]) ?? []) {
      if (!r?.investigation_id) continue;
      map.set(r.investigation_id, {
        investigation_id: r.investigation_id,
        status: normalizeQaStatus(r.status),
        note: r.note ?? null,
        updated_at: r.updated_at,
      });
    }
  } catch {
    /* review board is best-effort — never block the admin list */
  }
  return map;
}

/** Set the review status for one investigation. Throws on failure. */
export async function setQaStatus(
  investigationId: string,
  status: QaStatus,
  note?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_investigation_qa_status" as any, {
    p_id: investigationId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
}
