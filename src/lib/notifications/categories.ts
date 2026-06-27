/**
 * Notification category catalog.
 *
 * Centralised so the admin composer, deep-link resolver, in-app banner,
 * notification center and (future) preferences screen all share a single
 * source of truth. New categories only need to be added here.
 */

import {
  Bell,
  CalendarClock,
  Crown,
  BookOpen,
  Compass,
  Flame,
  Coins,
  Trophy,
  Megaphone,
  Search,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

export type NotificationCategoryKey =
  | "daily_reminder"
  | "today_in_history"
  | "campaign"
  | "encyclopedia"
  | "investigation"
  | "achievement"
  | "reward"
  | "museum"
  | "admin"
  | "system"
  | "friend";

export interface NotificationCategoryDef {
  key: NotificationCategoryKey;
  label: string;
  icon: LucideIcon;
  /** Tailwind class for accent text/icons. */
  accent: string;
  /** Tailwind class for accent backgrounds. */
  accentBg: string;
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategoryKey, NotificationCategoryDef> = {
  daily_reminder:   { key: "daily_reminder",   label: "تذكير يومي",       icon: Flame,        accent: "text-orange-300", accentBg: "bg-orange-500/15" },
  today_in_history: { key: "today_in_history", label: "في مثل هذا اليوم", icon: CalendarClock, accent: "text-amber-200",  accentBg: "bg-amber-500/15" },
  campaign:         { key: "campaign",         label: "حملة",            icon: Crown,        accent: "text-gold",       accentBg: "bg-gold/15" },
  encyclopedia:     { key: "encyclopedia",     label: "الموسوعة",         icon: BookOpen,     accent: "text-sky-200",    accentBg: "bg-sky-500/15" },
  investigation:    { key: "investigation",    label: "تحقيق",           icon: Search,       accent: "text-violet-200", accentBg: "bg-violet-500/15" },
  achievement:      { key: "achievement",      label: "إنجاز",           icon: Trophy,       accent: "text-yellow-300", accentBg: "bg-yellow-500/15" },
  reward:           { key: "reward",           label: "مكافأة",          icon: Coins,        accent: "text-gold",       accentBg: "bg-gold/15" },
  museum:           { key: "museum",           label: "المتحف",          icon: ImageIcon,    accent: "text-emerald-200",accentBg: "bg-emerald-500/15" },
  admin:            { key: "admin",            label: "إعلان",           icon: Megaphone,    accent: "text-rose-200",   accentBg: "bg-rose-500/15" },
  system:           { key: "system",           label: "النظام",          icon: Bell,         accent: "text-muted-foreground", accentBg: "bg-white/10" },
  friend:           { key: "friend",           label: "الأصدقاء",         icon: Compass,      accent: "text-cyan-200",   accentBg: "bg-cyan-500/15" },
};

/**
 * Map an arbitrary backend `type`/`category` string onto a known category.
 * Falls back to "system" so the UI never crashes on unknown values.
 */
export function resolveCategory(input?: string | null): NotificationCategoryDef {
  if (!input) return NOTIFICATION_CATEGORIES.system;
  const key = input.toLowerCase().replace(/-/g, "_") as NotificationCategoryKey;
  if (key in NOTIFICATION_CATEGORIES) return NOTIFICATION_CATEGORIES[key];

  // Heuristics for legacy `type` values.
  const legacy: Record<string, NotificationCategoryKey> = {
    manual: "admin",
    system_update: "system",
    campaign_update: "campaign",
    incomplete_campaign: "campaign",
    daily_fact: "today_in_history",
    referral: "reward",
    season: "reward",
    reengagement: "daily_reminder",
    daily: "today_in_history",
  };
  const mapped = legacy[input];
  return mapped ? NOTIFICATION_CATEGORIES[mapped] : NOTIFICATION_CATEGORIES.system;
}

export const ALL_CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategoryKey[];
