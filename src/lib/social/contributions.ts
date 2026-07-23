// ============================================================
// Social Contributions — "ساهمت في تحسين إرث" (P6 Step 7)
// ------------------------------------------------------------
// Editorial-only workflow. Never a social/reward surface.
//
// FROZEN contracts (RPC-only):
//   mark_contribution_v2(comment_id, category, note)
//   unmark_contribution_v2(comment_id, reason)
//   apply_contribution_v2(comment_id, public_notice, editor_note)
//   archive_contribution_v2(comment_id, editor_note)
//   list_contribution_queue_v2(status, cursor, limit)      admin
//   list_public_contributions_v2(anchor_type, anchor_id)   public
//   my_contribution_flags_v2(comment_ids[])                self
//
// Restrictions (NEVER add):
//   * No XP, dinars, achievements, profile score, ranking,
//     leaderboard, public contributor list, popularity metric.
//   * Anonymous transparency only — reader identity is never
//     surfaced anywhere on the client.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { SocialAnchorType } from "@/lib/social/reactions";

export type ContributionCategory =
  | "fact_correction"
  | "additional_context"
  | "source_reference"
  | "translation_nuance"
  | "other";

export type ContributionStatus = "proposed" | "applied" | "archived";

export const CONTRIBUTION_CATEGORIES: {
  key: ContributionCategory;
  label: string;
  hint: string;
}[] = [
  { key: "fact_correction",     label: "تصحيح معلومة", hint: "تعديل حقيقة تاريخية أو تاريخ أو اسم." },
  { key: "additional_context",  label: "سياق إضافي",   hint: "إثراء المحتوى بمعلومة أو ربط تاريخي." },
  { key: "source_reference",    label: "مصدر أو مرجع", hint: "إحالة إلى مصدر يوثّق المحتوى." },
  { key: "translation_nuance",  label: "دقة لغوية",    hint: "تحسين صياغة أو ترجمة أو ضبط لفظي." },
  { key: "other",               label: "أخرى",         hint: "مساهمة تحريرية أخرى." },
];

export function categoryLabelAr(c: ContributionCategory): string {
  return CONTRIBUTION_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

export interface ContributionQueueItem {
  comment_id: string;
  status: ContributionStatus;
  category: ContributionCategory;
  marked_by: string | null;
  marked_at: string;
  note: string | null;
  editor_note: string | null;
  public_notice_text: string | null;
  applied_by: string | null;
  applied_at: string | null;
  archived_by: string | null;
  archived_at: string | null;
  updated_at: string;
  anchor_type: SocialAnchorType;
  anchor_id: string;
  author_id: string | null;
  body_text: string | null;
  comment_status: string | null;
  comment_created_at: string | null;
  editors_note: boolean | null;
}

export interface PublicContributionNotice {
  category: ContributionCategory;
  public_notice_text: string;
  applied_at: string;
}

export interface MyContributionFlag {
  comment_id: string;
  status: ContributionStatus;
  category: ContributionCategory;
  applied_at: string | null;
}

type Err = { ok: false; reason: string };
type Ok<T> = { ok: true } & T;

export async function markContribution(
  commentId: string,
  category: ContributionCategory,
  note?: string | null,
): Promise<{ ok: boolean; reason?: string; first_mark?: boolean }> {
  const { data, error } = await supabase.rpc("mark_contribution_v2" as never, {
    p_comment_id: commentId,
    p_category: category,
    p_note: note ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string; first_mark?: boolean };
}

export async function unmarkContribution(
  commentId: string,
  reason?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("unmark_contribution_v2" as never, {
    p_comment_id: commentId,
    p_reason: reason ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string };
}

export async function applyContribution(
  commentId: string,
  publicNotice: string,
  editorNote?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("apply_contribution_v2" as never, {
    p_comment_id: commentId,
    p_public_notice: publicNotice,
    p_editor_note: editorNote ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string };
}

export async function archiveContribution(
  commentId: string,
  editorNote?: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("archive_contribution_v2" as never, {
    p_comment_id: commentId,
    p_editor_note: editorNote ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string };
}

export async function listContributionQueue(
  status: ContributionStatus | "all" = "proposed",
  cursor: string | null = null,
  limit = 30,
): Promise<Ok<{ items: ContributionQueueItem[]; next_cursor: string | null }> | Err> {
  const { data, error } = await supabase.rpc("list_contribution_queue_v2" as never, {
    p_status: status,
    p_cursor: cursor,
    p_limit: limit,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return data as Ok<{ items: ContributionQueueItem[]; next_cursor: string | null }>;
}

export async function listPublicContributions(
  anchorType: SocialAnchorType,
  anchorId: string,
): Promise<PublicContributionNotice[]> {
  const { data, error } = await supabase.rpc("list_public_contributions_v2" as never, {
    p_anchor_type: anchorType,
    p_anchor_id: anchorId,
  } as never);
  if (error || !data) return [];
  const payload = data as { ok?: boolean; items?: PublicContributionNotice[] };
  return payload.items ?? [];
}

export async function myContributionFlags(
  commentIds: string[],
): Promise<MyContributionFlag[]> {
  if (!commentIds.length) return [];
  const { data, error } = await supabase.rpc("my_contribution_flags_v2" as never, {
    p_comment_ids: commentIds,
  } as never);
  if (error || !data) return [];
  const payload = data as { ok?: boolean; items?: MyContributionFlag[] };
  return payload.items ?? [];
}

export function contributionErrorCopyAr(reason?: string): string {
  switch (reason) {
    case "forbidden": return "لا تملك صلاحية هذا الإجراء.";
    case "not_found": return "المساهمة غير موجودة.";
    case "not_visible": return "لا يمكن تعليم مساهمة مخفيّة.";
    case "terminal_status": return "تمّت معالجة هذه المساهمة سابقًا.";
    case "public_notice_required": return "نص الإشعار الشفّاف مطلوب.";
    case "public_notice_too_long": return "الإشعار الشفّاف طويل جدًا (الحد 240 حرفًا).";
    case "comment_missing": return "المساهمة الأصلية لم تعد متاحة.";
    default: return "تعذّر تنفيذ الإجراء. حاول مجددًا.";
  }
}
