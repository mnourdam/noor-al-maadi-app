/**
 * Curated Lucide icon catalog for the notification composer.
 *
 * Only icons that make sense for notifications/inbox UI. Adding a new icon
 * is one entry. The picker exposes both English and Arabic search.
 */

import {
  Bell, BellRing, BookOpen, Scroll, Swords, Trophy, Gift, Shield,
  Map, Users, Calendar, CalendarClock, Flame, Heart, Star, Crown,
  Coins, Compass, Megaphone, Sparkles, Search, Image as ImageIcon,
  Flag, Award, Target, Zap, Castle, Landmark, Gem, ScrollText,
  Activity, Clock, AlertTriangle, CheckCircle2, Info, MessageCircle,
  UserPlus, UserCheck, Mail, Send, RefreshCw, TrendingUp, Eye,
  type LucideIcon,
} from "lucide-react";

export interface IconEntry {
  /** Stored value: the kebab-case Lucide identifier. */
  name: string;
  /** English display label. */
  label: string;
  /** Arabic display label. */
  labelAr: string;
  /** Component for direct rendering. */
  Icon: LucideIcon;
}

export const ICON_CATALOG: IconEntry[] = [
  { name: "bell",            label: "Bell",            labelAr: "جرس",        Icon: Bell },
  { name: "bell-ring",       label: "Bell Ring",       labelAr: "تنبيه",      Icon: BellRing },
  { name: "book-open",       label: "Book Open",       labelAr: "كتاب",       Icon: BookOpen },
  { name: "scroll",          label: "Scroll",          labelAr: "لفافة",      Icon: Scroll },
  { name: "scroll-text",     label: "Scroll Text",     labelAr: "نص قديم",    Icon: ScrollText },
  { name: "swords",          label: "Swords",          labelAr: "سيوف",       Icon: Swords },
  { name: "trophy",          label: "Trophy",          labelAr: "كأس",        Icon: Trophy },
  { name: "gift",            label: "Gift",            labelAr: "هدية",       Icon: Gift },
  { name: "shield",          label: "Shield",          labelAr: "درع",        Icon: Shield },
  { name: "map",             label: "Map",             labelAr: "خريطة",      Icon: Map },
  { name: "users",           label: "Users",           labelAr: "مستخدمون",   Icon: Users },
  { name: "calendar",        label: "Calendar",        labelAr: "تقويم",      Icon: Calendar },
  { name: "calendar-clock",  label: "Calendar Clock",  labelAr: "موعد",       Icon: CalendarClock },
  { name: "flame",           label: "Flame",           labelAr: "شعلة",       Icon: Flame },
  { name: "heart",           label: "Heart",           labelAr: "قلب",        Icon: Heart },
  { name: "star",            label: "Star",            labelAr: "نجمة",       Icon: Star },
  { name: "crown",           label: "Crown",           labelAr: "تاج",        Icon: Crown },
  { name: "coins",           label: "Coins",           labelAr: "دنانير",     Icon: Coins },
  { name: "compass",         label: "Compass",         labelAr: "بوصلة",      Icon: Compass },
  { name: "megaphone",       label: "Megaphone",       labelAr: "إعلان",      Icon: Megaphone },
  { name: "sparkles",        label: "Sparkles",        labelAr: "بريق",       Icon: Sparkles },
  { name: "search",          label: "Search",          labelAr: "بحث",        Icon: Search },
  { name: "image",           label: "Image",           labelAr: "صورة",       Icon: ImageIcon },
  { name: "flag",            label: "Flag",            labelAr: "علم",        Icon: Flag },
  { name: "award",           label: "Award",           labelAr: "وسام",       Icon: Award },
  { name: "target",          label: "Target",          labelAr: "هدف",        Icon: Target },
  { name: "zap",             label: "Zap",             labelAr: "صاعقة",      Icon: Zap },
  { name: "castle",          label: "Castle",          labelAr: "قلعة",       Icon: Castle },
  { name: "landmark",        label: "Landmark",        labelAr: "معلم",       Icon: Landmark },
  { name: "gem",             label: "Gem",             labelAr: "جوهرة",      Icon: Gem },
  { name: "activity",        label: "Activity",        labelAr: "نشاط",       Icon: Activity },
  { name: "clock",           label: "Clock",           labelAr: "ساعة",       Icon: Clock },
  { name: "alert-triangle",  label: "Alert",           labelAr: "تنبيه",      Icon: AlertTriangle },
  { name: "check-circle",    label: "Check",           labelAr: "تم",         Icon: CheckCircle2 },
  { name: "info",            label: "Info",            labelAr: "معلومة",     Icon: Info },
  { name: "message-circle",  label: "Message",         labelAr: "رسالة",      Icon: MessageCircle },
  { name: "user-plus",       label: "User Plus",       labelAr: "إضافة صديق", Icon: UserPlus },
  { name: "user-check",      label: "User Check",      labelAr: "قبول صديق",  Icon: UserCheck },
  { name: "mail",            label: "Mail",            labelAr: "بريد",       Icon: Mail },
  { name: "send",            label: "Send",            labelAr: "إرسال",      Icon: Send },
  { name: "refresh",         label: "Refresh",         labelAr: "تحديث",      Icon: RefreshCw },
  { name: "trending-up",     label: "Trending Up",     labelAr: "ارتفاع",     Icon: TrendingUp },
  { name: "eye",             label: "Eye",             labelAr: "عرض",        Icon: Eye },
];

const BY_NAME = new Map(ICON_CATALOG.map((e) => [e.name, e]));

export function iconByName(name?: string | null): LucideIcon | null {
  if (!name) return null;
  return BY_NAME.get(name)?.Icon ?? null;
}

export function searchIcons(query: string): IconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_CATALOG;
  return ICON_CATALOG.filter(
    (e) =>
      e.name.includes(q) ||
      e.label.toLowerCase().includes(q) ||
      e.labelAr.includes(query.trim()),
  );
}
