// ============================================================
// Social Comments — Guided, Learning-Focused Discourse (P6 Step 2)
// ------------------------------------------------------------
// FROZEN contracts. Anchor-agnostic (`social_anchor_type`).
// All I/O is RPC-only; the `social_comments` table has RLS on
// and no policies — nothing reads or writes it directly.
//
// Philosophy invariants (do not soften):
//   * ONLINE-ONLY. No outbox, no optimistic fake success.
//     Callers gate on `useOnline()`.
//   * Max 300 chars, plain text, max 3 per player per anchor.
//   * ONE level of replies only (V17-07B). A reply carries its
//     parent's anchor; the client never chooses a reply's anchor.
//     Replies never enter the top-level feed, its cursor, or
//     `total_visible`.
//   * Default order: Editor's Notes → Most Helpful → Newest.
//     "Most Popular" does not exist and must never be added.
//   * Editing is only allowed inside the server-decided window
//     (`edit_deadline_at`). No client override.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { SocialAnchorType } from "@/lib/social/reactions";

/** Frozen sort keys — never add "popular". */
export type CommentSort = "editors_helpful_new" | "newest";

/** Frozen shape returned by list/add/edit RPCs. */
export interface SocialCommentRow {
  id: string;
  anchor_type: SocialAnchorType;
  anchor_id: string;
  author_id: string;
  body_text: string;
  status: "visible" | "hidden" | "removed" | "pending";
  helpful_count: number;
  editors_note: boolean;
  editors_note_rank: number | null;
  edit_deadline_at: string;
  edited_at: string | null;
  created_at: string;
  /** Display name of the author (attribution only — never a profile link). */
  author_name?: string | null;
  is_mine?: boolean;
  /**
   * Whether the CURRENT viewer has hearted ("استزدتُ") this comment.
   * Server-computed by `list_comments_v2` — never inferred client-side.
   * Absent (undefined) for guests and for rows returned by add/edit.
   */
  my_heart?: boolean;

  // ── One-level replies (V17-07B) ───────────────────────────
  /** NULL on a top-level reflection; the parent's id on a reply. */
  parent_comment_id?: string | null;
  /** Total VISIBLE replies under this top-level comment. */
  reply_count?: number;
  /** First 3 visible replies, oldest → newest. Server-supplied. */
  replies?: SocialCommentRow[];
}

export interface CommentThread {
  ok: true;
  anchor_type: SocialAnchorType;
  anchor_id: string;
  anchor_title: string;
  /** True when the parent was soft-deleted by its author (tombstone). */
  removed: boolean;
  parent: SocialCommentRow;
}

export interface CommentsPage {
  ok: true;
  sort: CommentSort;
  editors_notes: SocialCommentRow[];
  items: SocialCommentRow[];
  next_cursor: string | null;
  total_visible: number;
}

export interface CommentsError {
  ok: false;
  reason: string;
}

/** Enumerated reasons the RPCs can return — surface Arabic copy per reason. */
export type AddCommentReason =
  | "auth_required"
  | "empty"
  | "too_long"
  | "anchor_not_found"
  | "anchor_limit_reached"
  | "rate_limited"
  // Reply-only reasons (V17-07B).
  | "parent_not_found"
  | "parent_not_available"
  | "nested_reply_not_allowed"
  | "reply_limit_reached"
  | "unsupported_anchor"
  | "unknown";

export interface AddCommentResult {
  ok: boolean;
  reason?: AddCommentReason;
  comment?: SocialCommentRow;
}

export async function listComments(
  anchorType: SocialAnchorType,
  anchorId: string,
  opts: { sort?: CommentSort; cursor?: string | null; limit?: number } = {},
): Promise<CommentsPage | CommentsError> {
  try {
    const { data, error } = await supabase.rpc("list_comments_v2" as never, {
      p_anchor_type: anchorType,
      p_anchor_id: anchorId,
      p_sort: opts.sort ?? "editors_helpful_new",
      p_cursor: opts.cursor ?? null,
      p_limit: opts.limit ?? 20,
    } as never);
    if (error) return { ok: false, reason: error.message };
    return data as CommentsPage;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function addComment(
  anchorType: SocialAnchorType,
  anchorId: string,
  body: string,
): Promise<AddCommentResult> {
  try {
    const { data, error } = await supabase.rpc("add_story_comment_v2" as never, {
      p_anchor_type: anchorType,
      p_anchor_id: anchorId,
      p_body: body,
    } as never);
    if (error) return { ok: false, reason: "unknown" };
    return (data ?? { ok: false, reason: "unknown" }) as AddCommentResult;
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

export async function editComment(
  commentId: string,
  body: string,
): Promise<AddCommentResult> {
  try {
    const { data, error } = await supabase.rpc("edit_story_comment_v2" as never, {
      p_comment_id: commentId,
      p_body: body,
    } as never);
    if (error) return { ok: false, reason: "unknown" };
    return (data ?? { ok: false, reason: "unknown" }) as AddCommentResult;
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

export async function deleteOwnComment(commentId: string): Promise<{ ok: boolean }> {
  try {
    const { data, error } = await supabase.rpc("delete_own_comment_v2" as never, {
      p_comment_id: commentId,
    } as never);
    if (error) return { ok: false };
    return (data ?? { ok: false }) as { ok: boolean };
  } catch {
    return { ok: false };
  }
}

/**
 * Post a ONE-LEVEL reply under a visible top-level comment.
 * The server derives the anchor from the parent — the caller never sends it.
 * Online-only, exactly like every other social write: no outbox, no queue.
 */
export async function addCommentReply(
  parentCommentId: string,
  body: string,
): Promise<AddCommentResult> {
  try {
    const { data, error } = await supabase.rpc("add_comment_reply_v1" as never, {
      p_parent_comment_id: parentCommentId,
      p_body: body,
    } as never);
    if (error) return { ok: false, reason: "unknown" };
    return (data ?? { ok: false, reason: "unknown" }) as AddCommentResult;
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

/**
 * Direct thread lookup for `?comment=<parentId>` deep links, so a link never
 * depends on the parent landing inside page 1 of the keyset feed.
 */
export async function getCommentThread(
  parentCommentId: string,
): Promise<CommentThread | CommentsError> {
  try {
    const { data, error } = await supabase.rpc("get_comment_thread_v1" as never, {
      p_parent_comment_id: parentCommentId,
    } as never);
    if (error) return { ok: false, reason: error.message };
    return (data ?? { ok: false, reason: "unavailable" }) as CommentThread | CommentsError;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** True if `edit_deadline_at` is still in the future. */
export function isWithinEditWindow(row: Pick<SocialCommentRow, "edit_deadline_at">) {
  const t = Date.parse(row.edit_deadline_at);
  return Number.isFinite(t) && t > Date.now();
}

/** Human copy in Arabic for RPC failure reasons. */
export function commentErrorCopyAr(reason?: string): string {
  switch (reason) {
    case "auth_required":
      return "سجّل الدخول لإضافة تأمّلك.";
    case "empty":
      return "اكتب فكرة قبل النشر.";
    case "too_long":
      return "الحدّ الأقصى 300 حرف.";
    case "anchor_limit_reached":
      return "لك ثلاث مساهمات كحدٍّ أقصى على هذه القصة.";
    case "rate_limited":
      return "أبطئ قليلًا؛ حاول بعد قليل.";
    case "edit_window_closed":
      return "انتهت مهلة التعديل.";
    case "not_editable":
      return "لا يمكن تعديل هذه المساهمة.";
    case "forbidden":
      return "غير مسموح.";
    case "editors_note_locked":
      return "لا يمكن حذف ملاحظة محرّر مثبّتة. اطلب من مشرف إلغاء التثبيت أولًا.";
    case "pin_cap_reached":
      return "لا يمكن تثبيت أكثر من ثلاث ملاحظات محرّر لهذه المرساة.";
    case "not_visible":
      return "لا يمكن تثبيت مساهمة غير ظاهرة.";
    case "parent_not_found":
    case "parent_not_available":
      return "لم تعد هذه المساهمة متاحة.";
    case "nested_reply_not_allowed":
      return "لا يمكن الرد على ردّ.";
    case "reply_limit_reached":
      return "لك ثلاثة ردود كحدٍّ أقصى على هذه المساهمة.";
    case "unsupported_anchor":
      return "الردود متاحة على مواد الموسوعة فقط.";
    case "cannot_pin_reply":
      return "لا يمكن تثبيت ردّ كملاحظة محرّر.";
    case "anchor_not_found":
      return "القصة غير متاحة الآن.";
    default:
      return "تعذّر إتمام العملية، حاول مرة أخرى.";
  }
}
