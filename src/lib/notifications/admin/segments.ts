/**
 * Smart audience segment registry.
 *
 * Each segment maps to the corresponding `admin_resolve_segment(id)` RPC
 * branch. Adding a new segment is one entry here + one WHEN branch in the
 * SQL function. The architecture intentionally keeps both sides simple so
 * future segments can be wired in without schema redesign.
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

export function findSegment(id: string): SegmentDef | undefined {
  return SEGMENTS.find((s) => s.id === id);
}

/**
 * Resolve a segment to a list of user IDs via the admin-only RPC.
 * Returns [] on any error so the caller can show a friendly message.
 */
export async function resolveSegmentUserIds(id: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("admin_resolve_segment" as never, {
      p_segment_id: id,
    } as never);
    if (error) {
      console.warn("[segments] resolve failed", error);
      return [];
    }
    return ((data as string[] | null) ?? []).filter(Boolean);
  } catch (err) {
    console.warn("[segments] resolve exception", err);
    return [];
  }
}
