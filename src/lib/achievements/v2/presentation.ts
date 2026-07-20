/**
 * Shared v2 presentation metadata.
 *
 * Single source of truth for category labels/icons, rarity styling, and
 * the "earned" predicate used by every player-facing achievement surface.
 * Do NOT duplicate CATEGORY_META / CATEGORY_ICON / RARITY_STYLE anywhere else.
 */

import {
  BookOpen, Compass, Coins, Crown, Flame, Landmark,
  Map as MapIcon, ScrollText, Search, Star, Swords,
} from "lucide-react";
import type { AchievementCategory, AchievementRarity, AchievementView } from "./types";

export const CATEGORY_ICON: Record<AchievementCategory, typeof BookOpen> = {
  campaigns:      Swords,
  investigations: Search,
  encyclopedia:   BookOpen,
  museum:         Landmark,
  atlas:          MapIcon,
  worlds:         Compass,
  economy:        Coins,
  level:          Star,
  daily:          Flame,
  collection:     Landmark,
  special:        Crown,
  seasonal:       ScrollText,
};

export const CATEGORY_META: Record<AchievementCategory, { name: string; tagline: string; icon: string }> = {
  campaigns:      { name: "الحملات التاريخية", tagline: "إنجاز الحملات الكبرى", icon: "⚔️" },
  investigations: { name: "التحقيقات",          tagline: "قضايا وأسرار",         icon: "🔍" },
  encyclopedia:   { name: "الموسوعة",           tagline: "الشخصيات والعصور",     icon: "📖" },
  museum:         { name: "المتحف",             tagline: "قطع الأثر والتراث",    icon: "🏛️" },
  atlas:          { name: "الأطلس",             tagline: "الأقاليم والأقطار",    icon: "🗺️" },
  worlds:         { name: "العوالم",            tagline: "استكمال العوالم",      icon: "🌌" },
  economy:        { name: "الثروة والخبرة",    tagline: "الدنانير والنقاط",     icon: "💎" },
  level:          { name: "المستوى",            tagline: "رحلة التقدم",          icon: "⭐" },
  daily:          { name: "المثابرة اليومية",   tagline: "السلاسل والتحديات",    icon: "🔥" },
  collection:     { name: "الجامع",             tagline: "بناء المجموعة",        icon: "📦" },
  special:        { name: "خاصة",               tagline: "الإنجازات المميزة",    icon: "👑" },
  seasonal:       { name: "المواسم",            tagline: "إنجازات المواسم",      icon: "🍁" },
};

export const CATEGORY_ORDER: AchievementCategory[] = [
  "campaigns", "investigations", "museum", "encyclopedia", "atlas",
  "collection", "level", "economy", "daily", "worlds", "special", "seasonal",
];

export const RARITY_STYLE: Record<AchievementRarity, { ring: string; chip: string; label: string }> = {
  common:    { ring: "border-white/15",      chip: "bg-white/10 text-foreground/70",   label: "عادي" },
  rare:      { ring: "border-sky-400/40",    chip: "bg-sky-400/10 text-sky-200",       label: "نادر" },
  epic:      { ring: "border-violet-400/40", chip: "bg-violet-400/10 text-violet-200", label: "ملحمي" },
  legendary: { ring: "border-gold/60",       chip: "bg-gold/15 text-gold",             label: "أسطوري" },
};

export const SECRET_STYLE = {
  ring: "border-rose-400/40",
  chip: "bg-rose-400/10 text-rose-200",
  label: "سرّي",
};

/** Canonical "earned" predicate. */
export function isEarned(v: AchievementView): boolean {
  return v.state === "unlocked" || v.state === "claimed";
}

/** Canonical Profile → Achievements deep link. */
export const ACHIEVEMENTS_ROUTE = "/profile" as const;
export const ACHIEVEMENTS_SEARCH = { tab: "achievements" } as const;
