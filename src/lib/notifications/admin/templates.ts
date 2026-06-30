/**
 * Reusable notification templates. Selecting one prefills the composer;
 * the admin can still edit every field. Pure data — adding a template
 * is a new object literal.
 */

import type { NotificationCategoryKey } from "@/lib/notifications/categories";

export type TemplatePriority = "low" | "normal" | "high";

export interface NotificationTemplate {
  id: string;
  label: string;
  description: string;
  title: string;
  body: string;
  icon: string;             // matches ICON_CATALOG[].name
  category: NotificationCategoryKey;
  priority: TemplatePriority;
  /** Optional deep-link definition id from DEEP_LINKS, with prefilled params. */
  deepLink?: { id: string; params?: Record<string, string> };
}

export const TEMPLATES: NotificationTemplate[] = [
  {
    id: "new_campaign",
    label: "حملة جديدة",
    description: "إطلاق حملة جديدة في إرث.",
    title: "حملة جديدة في إرث",
    body: "انطلقت حملة جديدة. هل أنت مستعدّ للرحلة؟",
    icon: "crown", category: "campaign", priority: "high",
    deepLink: { id: "campaigns.home" },
  },
  {
    id: "today_in_history",
    label: "في مثل هذا اليوم",
    description: "ذكّر اللاعبين بحدث تاريخي وقع في مثل هذا اليوم.",
    title: "في مثل هذا اليوم",
    body: "اكتشف ما الذي حدث في مثل هذا اليوم من التاريخ.",
    icon: "calendar-clock", category: "today_in_history", priority: "normal",
    deepLink: { id: "timeline.today" },
  },
  {
    id: "achievement_unlocked",
    label: "إنجاز جديد",
    description: "إشعار فتح إنجاز.",
    title: "تهانينا — إنجاز جديد",
    body: "لقد فتحت إنجازًا جديدًا في إرث.",
    icon: "trophy", category: "achievement", priority: "high",
    deepLink: { id: "profile.achievements" },
  },
  {
    id: "friend_request",
    label: "طلب صداقة",
    description: "طلب صداقة جديد بانتظارك.",
    title: "طلب صداقة جديد",
    body: "هناك طلب صداقة بانتظارك.",
    icon: "user-plus", category: "friend", priority: "normal",
    deepLink: { id: "community.friends" },
  },
  {
    id: "friend_accepted",
    label: "قبول صداقة",
    description: "صديق جديد انضمّ إلى قائمتك.",
    title: "تمت إضافة صديق",
    body: "قَبِل صديقك طلبك. ابدأ المنافسة على لوحة الترتيب.",
    icon: "user-check", category: "friend", priority: "normal",
    deepLink: { id: "community.friends" },
  },
  {
    id: "daily_challenge",
    label: "تحدّي يومي",
    description: "تذكير بالتحدّي اليومي.",
    title: "تحدّي اليوم بانتظارك",
    body: "أكمل تحدّي اليوم واحصد المكافأة.",
    icon: "flame", category: "daily_reminder", priority: "normal",
    deepLink: { id: "campaigns.home" },
  },
  {
    id: "investigation_available",
    label: "تحقيق جديد",
    description: "تحقيق تاريخي جديد متاح.",
    title: "تحقيق جديد",
    body: "تحقيق تاريخي جديد بانتظار حلّك.",
    icon: "search", category: "investigation", priority: "normal",
    deepLink: { id: "encyclopedia.home" },
  },
  {
    id: "hearts_restored",
    label: "استعادة القلوب",
    description: "إخبار اللاعب بامتلاء القلوب.",
    title: "استعادت قلوبك امتلاءها",
    body: "كل قلوبك ممتلئة الآن. عُد للعب.",
    icon: "heart", category: "daily_reminder", priority: "low",
    deepLink: { id: "campaigns.home" },
  },
  {
    id: "museum_reward",
    label: "مكافأة المتحف",
    description: "قطعة جديدة في المتحف.",
    title: "قطعة جديدة في متحفك",
    body: "أُضيفت قطعة جديدة إلى متحفك.",
    icon: "gem", category: "museum", priority: "normal",
    deepLink: { id: "museum.home" },
  },
  {
    id: "admin_announcement",
    label: "إعلان إداري",
    description: "إعلان رسمي لجميع المستخدمين.",
    title: "إعلان من فريق إرث",
    body: "اقرأ آخر المستجدّات من فريق إرث.",
    icon: "megaphone", category: "admin", priority: "high",
  },
  {
    id: "maintenance",
    label: "صيانة",
    description: "إشعار صيانة مجدولة.",
    title: "صيانة مجدولة",
    body: "ستجري عملية صيانة قصيرة قريبًا. شكرًا لتفهّمكم.",
    icon: "alert-triangle", category: "system", priority: "high",
  },
  {
    id: "new_encyclopedia",
    label: "محتوى موسوعي جديد",
    description: "إضافة مادة جديدة إلى الموسوعة.",
    title: "محتوى جديد في الموسوعة",
    body: "تمت إضافة شخصيات ومدن جديدة إلى الموسوعة.",
    icon: "book-open", category: "encyclopedia", priority: "normal",
    deepLink: { id: "encyclopedia.home" },
  },
];

export function findTemplate(id: string): NotificationTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
