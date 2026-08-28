/**
 * Smart audience segment registry — V16.
 *
 * Resolution goes through the additive `admin_resolve_segment_v16` /
 * `admin_segment_audience_v16` RPCs. The legacy `admin_resolve_segment`
 * RPC is intentionally left in place for V15 and is no longer called
 * from this module.
 *
 * CRITICAL CONTRACT (V16):
 *   A resolver failure is NEVER coerced into an empty audience. Callers
 *   receive a discriminated result and must treat `status: "error"` as a
 *   hard stop — an empty audience is only valid when the resolver
 *   succeeded and genuinely matched nobody.
 */

import { supabase } from "@/integrations/supabase/client";

export type SegmentGroup =
  | "progress" | "activity" | "campaigns" | "hearts"
  | "daily"    | "social"   | "collection";

export interface SegmentDef {
  id: string;
  group: SegmentGroup;
  label: string;
  description: string;
  /** Marked `coming_soon` if SQL isn't implemented yet — picker disables it. */
  coming_soon?: boolean;
}

export const SEGMENT_GROUP_LABEL: Record<SegmentGroup, string> = {
  progress: "التقدّم",
  activity: "النشاط",
  campaigns: "الحملات",
  hearts: "القلوب",
  daily: "النشاط اليومي",
  social: "الاجتماعي",
  collection: "المجموعة",
};

export const SEGMENTS: SegmentDef[] = [
  // Progress
  { id: "level_20_plus",  group: "progress", label: "المستوى 20 فأعلى", description: "اللاعبون الذين بلغوا المستوى 20." },
  { id: "level_50_plus",  group: "progress", label: "المستوى 50 فأعلى", description: "اللاعبون الذين بلغوا المستوى 50." },
  { id: "new_players",    group: "progress", label: "لاعبون جدد (7 أيام)", description: "حسابات أُنشئت خلال الأيام السبعة الماضية." },
  { id: "veteran_players",group: "progress", label: "لاعبون قدامى (60+ يوم)", description: "حسابات أقدم من 60 يومًا." },
  // Activity
  { id: "active_today",   group: "activity", label: "نشيط اليوم", description: "آخر نشاط خلال 24 ساعة." },
  { id: "active_this_week", group: "activity", label: "نشيط هذا الأسبوع", description: "آخر نشاط خلال 7 أيام." },
  { id: "inactive_7d",    group: "activity", label: "غير نشيط (7 أيام)", description: "لم يفتح التطبيق منذ أكثر من أسبوع." },
  { id: "inactive_30d",   group: "activity", label: "غير نشيط (30 يومًا)", description: "لم يفتح التطبيق منذ شهر." },
  // Campaigns
  { id: "campaign_in_progress",   group: "campaigns", label: "توقّف في حملة", description: "لديه حملة بدأها ولم يكملها." },
  { id: "campaign_completed_any", group: "campaigns", label: "أنهى حملة", description: "أكمل حملة واحدة على الأقل." },
  { id: "never_started_campaigns",group: "campaigns", label: "لم يبدأ أي حملة", description: "لا يوجد له أي تقدّم في الحملات." },
  // Hearts
  { id: "low_hearts",   group: "hearts", label: "أقل من 3 قلوب", description: "اللاعبون منخفضو القلوب." },
  { id: "no_hearts",    group: "hearts", label: "بدون قلوب",     description: "وصلوا للصفر." },
  { id: "full_hearts",  group: "hearts", label: "قلوب ممتلئة",   description: "5 قلوب فأكثر." },
  // Social
  { id: "has_pending_friend_requests", group: "social", label: "لديه طلبات صداقة معلّقة", description: "طلبات صداقة مرسلة إليه ولم تُقبل." },
  { id: "no_friends", group: "social", label: "لا أصدقاء بعد", description: "لم يقبل أي صداقة حتى الآن." },
  // Daily / Collection — placeholders for later expansion
  { id: "did_not_play_today",   group: "daily",      label: "لم يلعب اليوم",              description: "لا توجد جلسات اليوم.",         coming_soon: true },
  { id: "did_not_open_today_in_history", group: "daily", label: "لم يفتح \"في مثل هذا اليوم\"", description: "لم يتفاعل مع لوحة اليوم.", coming_soon: true },
  { id: "museum_below_25", group: "collection", label: "اكتمال المتحف < 25%", description: "المتحف ما زال في البداية.", coming_soon: true },
  { id: "museum_above_75", group: "collection", label: "اكتمال المتحف > 75%", description: "مقتنون جادّون.", coming_soon: true },
];

/** Segment ids the V16 resolver actually implements (everything not `coming_soon`). */
export const SUPPORTED_SEGMENT_IDS: string[] = SEGMENTS.filter((s) => !s.coming_soon).map((s) => s.id);

export function findSegment(id: string): SegmentDef | undefined {
  return SEGMENTS.find((s) => s.id === id);
}

// ============ Generic numeric predicate contract (V16) ============

export const FILTER_FIELDS = ["level", "xp", "streak", "hearts", "account_age_days"] as const;
export const FILTER_OPERATORS = ["=", ">", ">=", "<", "<="] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface NumericFilter {
  field: FilterField;
  op: FilterOperator;
  value: number;
}

export const FILTER_FIELD_LABEL: Record<FilterField, string> = {
  level: "المستوى",
  xp: "نقاط الخبرة",
  streak: "الحماسة",
  hearts: "القلوب",
  account_age_days: "عمر الحساب (أيام)",
};

/** Validate a numeric filter client-side; returns an Arabic error or null. */
export function validateNumericFilter(f: NumericFilter | undefined | null): string | null {
  if (!f) return "حدّد قاعدة رقمية.";
  if (!FILTER_FIELDS.includes(f.field)) return "الحقل غير مدعوم.";
  if (!FILTER_OPERATORS.includes(f.op)) return "المُعامل غير مدعوم.";
  if (typeof f.value !== "number" || !Number.isFinite(f.value)) return "القيمة الرقمية غير صالحة.";
  return null;
}

/** Stable identifier persisted as `target_segment_id` for filter audiences. */
export function filterSegmentId(f: NumericFilter): string {
  return `filter:${f.field}${f.op}${f.value}`;
}

// ============ Resolution ============

export interface AudienceOk {
  status: "ok";
  userIds: string[];
  matchingUsers: number;
  reachableUsers: number;
  deviceCount: number;
}
export interface AudienceError {
  status: "error";
  message: string;
}
export type AudienceResult = AudienceOk | AudienceError;

function errorMessage(err: unknown): string {
  const raw = (err as { message?: string } | null)?.message ?? String(err ?? "");
  if (/unknown_segment/i.test(raw)) return "الشريحة غير معروفة أو غير مدعومة في هذا الإصدار.";
  if (/invalid_filter_field/i.test(raw)) return "الحقل المستخدم في القاعدة غير مدعوم.";
  if (/invalid_filter_operator/i.test(raw)) return "المُعامل المستخدم في القاعدة غير مدعوم.";
  if (/invalid_filter_value/i.test(raw)) return "القيمة الرقمية في القاعدة غير صالحة.";
  if (/invalid_request/i.test(raw)) return "طلب تحديد الجمهور غير صالح.";
  if (/forbidden/i.test(raw)) return "لا تملك صلاحية تحديد الجمهور.";
  if (/unauthenticated/i.test(raw)) return "انتهت الجلسة — سجّل الدخول من جديد.";
  return `تعذّر تحديد الجمهور: ${raw || "خطأ غير معروف"}`;
}

interface AudienceRpcPayload {
  user_ids: string[] | null;
  matching_users: number;
  reachable_users: number;
  device_count: number;
}

/**
 * Resolve a predefined segment OR a numeric filter into a full audience
 * breakdown. Never throws; returns a discriminated result so the caller
 * can tell a resolver failure apart from a legitimate zero audience.
 */
export async function resolveAudience(
  input: { segmentId?: string | null; filter?: NumericFilter | null },
): Promise<AudienceResult> {
  const segmentId = input.segmentId ?? null;
  const filter = input.filter ?? null;

  if (!segmentId && !filter) {
    return { status: "error", message: "لم يتم تحديد شريحة أو قاعدة." };
  }
  if (filter) {
    const invalid = validateNumericFilter(filter);
    if (invalid) return { status: "error", message: invalid };
  }
  if (segmentId && !SUPPORTED_SEGMENT_IDS.includes(segmentId)) {
    return { status: "error", message: "الشريحة غير معروفة أو غير مدعومة في هذا الإصدار." };
  }

  try {
    const { data, error } = await supabase.rpc("admin_segment_audience_v16" as never, {
      p_segment_id: segmentId,
      p_filter: filter ?? null,
    } as never);
    if (error) return { status: "error", message: errorMessage(error) };
    const payload = data as unknown as AudienceRpcPayload | null;
    if (!payload || !Array.isArray(payload.user_ids ?? [])) {
      return { status: "error", message: "استجابة غير متوقعة من الخادم." };
    }
    const userIds = (payload.user_ids ?? []).filter(Boolean);
    return {
      status: "ok",
      userIds,
      matchingUsers: Number(payload.matching_users ?? userIds.length),
      reachableUsers: Number(payload.reachable_users ?? 0),
      deviceCount: Number(payload.device_count ?? 0),
    };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

/**
 * Legacy-compatible helper.
 *
 * ⚠️ It THROWS on resolver failure by design — the previous version
 * swallowed errors and returned `[]`, which is exactly how a broken
 * segment looked like "0 مستلم" and how a send could be attempted
 * against an audience nobody had actually resolved.
 */
export async function resolveSegmentUserIds(id: string): Promise<string[]> {
  const res = await resolveAudience({ segmentId: id });
  if (res.status === "error") throw new Error(res.message);
  return res.userIds;
}
