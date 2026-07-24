// App-wide neutral constants — separated from legacy content datasets.
// Only safe app-level enums, level math, achievements, and seasons live here.
// Content (stories, investigations, decisions, timelines, characters, etc.)
// is sourced exclusively from Supabase tables.

// ============================================================
// ERAS — canonical Islamic history era taxonomy used across UI
// ============================================================
export type Era =
  | "seerah"
  | "rashidun"
  | "umayyad"
  | "abbasid"
  | "andalus"
  | "seljuk"
  | "ayyubid"
  | "mamluk"
  | "ottoman"
  | "modern"
  | "crusades"
  | "zengid"
  | "mongols"
  | "byzantine"
  | "taifa"
  | "timurid"
  | "buyid"
  | "fatimid"
  | "safavid";

export const ERAS: { id: Era; name: string; years: string; tagline: string }[] = [
  { id: "seerah", name: "عصر النبوة", years: "570 – 632 م", tagline: "نور النبوّة وميلاد أمّة" },
  { id: "rashidun", name: "الخلافة الراشدة", years: "632 – 661 م", tagline: "عدلٌ وفتوحٌ ومجدٌ تأسيسي" },
  { id: "umayyad", name: "الدولة الأموية", years: "661 – 750 م", tagline: "من دمشق إلى أطراف الأرض" },
  { id: "abbasid", name: "الدولة العباسية", years: "750 – 1258 م", tagline: "بغداد عاصمة الحضارة" },
  { id: "fatimid", name: "الدولة الفاطمية", years: "909 – 1171 م", tagline: "من المهدية إلى القاهرة" },
  { id: "buyid", name: "العصر البويهي", years: "934 – 1062 م", tagline: "نفوذ البويهيين في المشرق" },
  { id: "andalus", name: "الأندلس", years: "711 – 1492 م", tagline: "زهرة الغرب الإسلامي" },
  { id: "taifa", name: "عصر ملوك الطوائف", years: "1031 – 1091 م", tagline: "تفتّت الأندلس إلى ممالك" },
  { id: "seljuk", name: "السلاجقة", years: "1037 – 1194 م", tagline: "حماة المشرق الإسلامي" },
  { id: "byzantine", name: "العصر البيزنطي", years: "330 – 1453 م", tagline: "الجارة الرومية للعالم الإسلامي" },
  { id: "crusades", name: "عصر الحروب الصليبية", years: "1096 – 1291 م", tagline: "قرنان من الصراع على الشام" },
  { id: "zengid", name: "الزنكيون", years: "1127 – 1250 م", tagline: "نور الدين وإعداد التحرير" },
  { id: "ayyubid", name: "الدولة الأيوبية", years: "1171 – 1260 م", tagline: "صلاح الدين وتحرير القدس" },
  { id: "mongols", name: "المغول", years: "1219 – 1335 م", tagline: "عاصفة اجتاحت المشرق" },
  { id: "mamluk", name: "دولة المماليك", years: "1250 – 1517 م", tagline: "كاسرو المغول وحماة الحرمين" },
  { id: "timurid", name: "التيموريون", years: "1370 – 1507 م", tagline: "تيمور ووريثوه في ما وراء النهر" },
  { id: "safavid", name: "الدولة الصفوية", years: "1501 – 1736 م", tagline: "الصفويون في إيران" },
  { id: "ottoman", name: "الدولة العثمانية", years: "1299 – 1924 م", tagline: "خلافة امتدّت ستة قرون" },
  { id: "modern", name: "العصر الحديث", years: "1798 – اليوم", tagline: "نهضة، استقلال، وتحوّلات" },
];

// ============================================================
// LEVELS — re-exported from the progression module (single source of truth).
// Kept here for backward compatibility with existing imports.
// ============================================================
import { levelFor } from "./progression";
export { LEVELS, levelFor, MAX_LEVEL, RANK_TITLES } from "./progression";
export type { LevelInfo, LevelLookup, LevelReward, LevelCosmetic, Rank, CosmeticKind } from "./progression";



// ============================================================
// ACHIEVEMENTS
// ============================================================
// The legacy `ACHIEVEMENTS` / `ACHIEVEMENT_CATEGORIES` catalogs and their
// supporting types (`AchievementDef`, `AchievementCategory`,
// `AchievementRarity`, `AchievementReward`, `AchievementRewardKind`) were
// removed in the Achievement Engine v2 finalization (Slice 4).
//
// All achievement content, unlock state, progress, rewards, and UI
// projections now flow through `@/lib/achievements/v2` exclusively:
//   - Definitions       → src/lib/achievements/v2/definitions/all.ts
//   - Retired legacy ids → src/lib/achievements/v2/definitions/retired.ts
//   - Read API for UI    → useAchievementViews() (driver.tsx)
//   - Server persistence → user_achievements + claim_achievements RPC
//
// Do not re-introduce a client-side achievement catalog here. New content
// is added by dropping a definition file under the v2 definitions folder.

// ============================================================
// SEASONS — REMOVED
// ------------------------------------------------------------
// The legacy Seasons demo (SEASONS/CURRENT_SEASON/currentSeason/
// seasonStatus and the Season interface) was removed alongside all
// UI/economy/notification surfaces. The client-side monthly rotation
// was a demo with unsafe local reward grants and no server
// authority. Do NOT re-introduce this model as hidden product
// logic. A genuine server-authoritative Seasons v2 system will be
// designed from scratch and must not inherit this shape.
// ============================================================

