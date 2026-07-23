// ============================================================
// Moderation — Admin queue & actions (P6 Step 5)
// ------------------------------------------------------------
// FROZEN contracts. Admin-only RPCs. All server-authoritative.
// Actions on a comment: hide, restore, remove, pin_note, unpin_note.
// 'remove' is a permanent soft-remove — body cleared, terminal.
// Every action + dismissal is written to admin_audit_log.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { SocialAnchorType } from "@/lib/social/reactions";
import type { ReportReason } from "@/lib/social/reports";

export type ModerationAction = "hide" | "restore" | "remove" | "pin_note" | "unpin_note";
export type ReportStatus = "open" | "actioned" | "dismissed";

export interface QueueItem {
  comment_id: string;
  last_report_at: string;
  report_count: number;
  top_reason: ReportReason;
  author_id: string | null;
  anchor_type: SocialAnchorType | null;
  anchor_id: string | null;
  comment_status: "visible" | "hidden" | "removed" | "pending" | null;
  body_text: string | null;
  comment_created_at: string | null;
  editors_note: boolean | null;
  moderated_at: string | null;
  moderated_by: string | null;
}

export interface QueuePage {
  ok: true;
  items: QueueItem[];
  next_cursor: string | null;
}

export interface ReportRow {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AuditRow {
  id: string;
  action: string;                // 'social_comment.hide', 'social_report.dismiss', etc.
  actor_id: string | null;
  actor_email: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

type Err = { ok: false; reason: string };
type Ok<T> = { ok: true } & T;

export async function listModeratorQueue(
  status: ReportStatus | "all" = "open",
  cursor: string | null = null,
  limit = 30,
): Promise<QueuePage | Err> {
  const { data, error } = await supabase.rpc("list_moderator_queue_v2" as never, {
    p_status: status,
    p_cursor: cursor,
    p_limit: limit,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return data as QueuePage;
}

export async function listCommentReports(commentId: string): Promise<Ok<{ items: ReportRow[] }> | Err> {
  const { data, error } = await supabase.rpc("list_comment_reports_v2" as never, {
    p_comment_id: commentId,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return data as Ok<{ items: ReportRow[] }>;
}

export async function listModerationHistory(commentId: string): Promise<Ok<{ items: AuditRow[] }> | Err> {
  const { data, error } = await supabase.rpc("list_moderation_history_v2" as never, {
    p_comment_id: commentId,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return data as Ok<{ items: AuditRow[] }>;
}

export async function moderateComment(
  commentId: string,
  action: ModerationAction,
  reason?: string | null,
  rank?: number | null,
): Promise<{ ok: boolean; reason?: string; resolution?: string }> {
  const { data, error } = await supabase.rpc("moderate_comment_v2" as never, {
    p_comment_id: commentId,
    p_action: action,
    p_reason: reason ?? null,
    p_rank: rank ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string; resolution?: string };
}

export async function dismissReport(reportId: string, note?: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("dismiss_report_v2" as never, {
    p_report_id: reportId,
    p_note: note ?? null,
  } as never);
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "unknown" }) as { ok: boolean; reason?: string };
}

export function actionLabelAr(action: string): string {
  switch (action) {
    case "social_comment.hide": return "إخفاء";
    case "social_comment.restore": return "استعادة";
    case "social_comment.remove": return "إزالة نهائية";
    case "social_comment.pin_note": return "تثبيت كملاحظة محرّر";
    case "social_comment.unpin_note": return "إلغاء تثبيت";
    case "social_report.dismiss": return "تجاهل البلاغ";
    default: return action;
  }
}
