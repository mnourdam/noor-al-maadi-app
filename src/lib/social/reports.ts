// ============================================================
// Social Reports — Reader-side report contract (P6 Step 5)
// ------------------------------------------------------------
// FROZEN contracts. Two-tap max. Reasons enum from DB.
// Signed-in only. Reporter cannot report their own comment.
// Rate-limited server-side (20/hour). Idempotent per reporter.
// Never surfaces moderation state to players.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type ReportReason =
  | "spam"
  | "harassment"
  | "off_topic"
  | "misinformation"
  | "inappropriate"
  | "other";

export interface ReportReasonOption {
  value: ReportReason;
  labelAr: string;
}

/** Frozen ordering — do not reorder. */
export const REPORT_REASONS: ReportReasonOption[] = [
  { value: "spam", labelAr: "إزعاج أو دعاية" },
  { value: "harassment", labelAr: "تحرّش أو إساءة" },
  { value: "off_topic", labelAr: "خارج الموضوع" },
  { value: "misinformation", labelAr: "معلومة غير دقيقة" },
  { value: "inappropriate", labelAr: "محتوى غير لائق" },
  { value: "other", labelAr: "سبب آخر" },
];

export type ReportReasonCode =
  | "auth_required"
  | "note_too_long"
  | "cannot_report_own"
  | "rate_limited"
  | "not_found"
  | "unknown";

export interface ReportResult {
  ok: boolean;
  reason?: ReportReasonCode;
}

export async function reportComment(
  commentId: string,
  reason: ReportReason,
  note?: string | null,
): Promise<ReportResult> {
  try {
    const { data, error } = await supabase.rpc("report_comment_v2" as never, {
      p_comment_id: commentId,
      p_reason: reason,
      p_note: note ?? null,
    } as never);
    if (error) return { ok: false, reason: "unknown" };
    return (data ?? { ok: false, reason: "unknown" }) as ReportResult;
  } catch {
    return { ok: false, reason: "unknown" };
  }
}

export function reportErrorCopyAr(code?: string): string {
  switch (code) {
    case "auth_required": return "سجّل الدخول للإبلاغ.";
    case "cannot_report_own": return "لا يمكنك الإبلاغ عن مساهمتك.";
    case "rate_limited": return "تجاوزت عدد البلاغات لهذه الساعة.";
    case "not_found": return "المساهمة لم تعد متاحة.";
    case "note_too_long": return "الملاحظة طويلة جدًا.";
    default: return "تعذّر إرسال البلاغ.";
  }
}
