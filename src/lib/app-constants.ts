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
// SEASONS — 12 monthly seasons, rotated by Gregorian month.
// Targets rebalanced so each season feels like a real month-long
// accomplishment (5k early → 25k advanced). Rewards scale with
// goal: points ≈ goalPoints / 5, plus title/badge always, and
// artifact + dinars on heavier seasons.
// ============================================================
export interface Season {
  id: string;
  name: string;
  tagline: string;
  goalPoints: number;
  endsAt: string;
  reward: { points: number; dinars?: number; artifact?: string; title?: string };
  month?: number;
  theme?: string;
  badge?: string;
}

export const SEASONS: Season[] = [
  { id: "season_seerah",         month: 1,  name: "موسم السيرة النبوية",   tagline: "عش شهرًا في نور النبوّة وأخلاق صاحب الرسالة ﷺ.",                theme: "نور النبوّة",        goalPoints: 5000,  endsAt: "نهاية يناير",   reward: { points: 1000, dinars: 500,  title: "صاحب الرسالة" },         badge: "season_seerah" },
  { id: "season_rashidun",       month: 2,  name: "موسم الراشدين",          tagline: "ارفع رايتك مع الخلفاء الأربعة من خلال مهمّات هذا الشهر.",     theme: "عدلٌ وفتوح",         goalPoints: 6000,  endsAt: "نهاية فبراير",  reward: { points: 1200, dinars: 600,  title: "ابن الفاروق" },           badge: "season_rashidun" },
  { id: "season_andalus",        month: 3,  name: "موسم الأندلس",           tagline: "من جبل طارق إلى قرطبة، اجمع نقاطك في موسم الأندلس.",         theme: "زهرة الغرب",         goalPoints: 7500,  endsAt: "نهاية مارس",    reward: { points: 1500, dinars: 750,  title: "فارس قرطبة",  artifact: "season_andalus_relic" }, badge: "season_andalus" },
  { id: "season_baghdad",        month: 4,  name: "موسم بغداد",             tagline: "ادخل بيت الحكمة وكن من علماء العصر الذهبي.",                  theme: "بيت الحكمة",         goalPoints: 8000,  endsAt: "نهاية أبريل",   reward: { points: 1600, dinars: 800,  title: "عالم العصر الذهبي" },     badge: "season_baghdad" },
  { id: "season_constantinople", month: 5,  name: "موسم الفتح",             tagline: "قف على أسوار القسطنطينية مع محمد الفاتح.",                    theme: "أسوار القسطنطينية",  goalPoints: 10000, endsAt: "نهاية مايو",    reward: { points: 2000, dinars: 1000, title: "من جند الفاتح", artifact: "season_fath_relic" },     badge: "season_constantinople" },
  { id: "season_seerah_late",    month: 6,  name: "موسم المدينة",           tagline: "اقتفِ أثر الأنصار في دار الهجرة.",                            theme: "دارُ الهجرة",        goalPoints: 9000,  endsAt: "نهاية يونيو",   reward: { points: 1800, dinars: 900,  title: "أنصاريٌّ صادق" },         badge: "season_madina" },
  { id: "season_jerusalem",      month: 7,  name: "موسم القدس",             tagline: "كن من حُماة الأقصى في موسم القدس.",                            theme: "عودة الأذان",        goalPoints: 12000, endsAt: "نهاية يوليو",   reward: { points: 2400, dinars: 1200, title: "من حُماة الأقصى", artifact: "season_quds_relic" },     badge: "season_jerusalem" },
  { id: "season_yarmouk",        month: 8,  name: "موسم اليرموك",           tagline: "كن من فرسان خالد في كسرة الروم.",                              theme: "كاسرو الروم",        goalPoints: 11000, endsAt: "نهاية أغسطس",   reward: { points: 2200, dinars: 1100, title: "من فرسان خالد" },          badge: "season_yarmouk" },
  { id: "season_ain_jalut",      month: 9,  name: "موسم عين جالوت",         tagline: "احفظ مصر والشام مع قطز وبيبرس.",                              theme: "كاسرو المغول",       goalPoints: 15000, endsAt: "نهاية سبتمبر",  reward: { points: 3000, dinars: 1500, title: "من جند قطز",  artifact: "season_ain_jalut_relic" }, badge: "season_ain_jalut" },
  { id: "season_andalus_fall",   month: 10, name: "موسم الأندلس الأخيرة",   tagline: "احفظ ذاكرة غرناطة قبل سقوط الراية.",                          theme: "ذاكرة لا تموت",      goalPoints: 18000, endsAt: "نهاية أكتوبر",  reward: { points: 3600, dinars: 1800, title: "حافظ الأندلس" },           badge: "season_andalus_fall" },
  { id: "season_seljuk",         month: 11, name: "موسم السلاجقة",          tagline: "ادخل الأناضول من بوابة ملاذكرد.",                              theme: "بوابة الأناضول",     goalPoints: 20000, endsAt: "نهاية نوفمبر",  reward: { points: 4000, dinars: 2000, title: "من فرسان ألب أرسلان" },    badge: "season_seljuk" },
  { id: "season_baghdad_fall",   month: 12, name: "موسم بغداد الحزينة",     tagline: "احمل قبسًا من ضوء بيت الحكمة قبل دجلة.",                       theme: "ذكرى السقوط",        goalPoints: 25000, endsAt: "نهاية ديسمبر",  reward: { points: 5000, dinars: 2500, title: "حافظ بيت الحكمة", artifact: "season_baghdad_relic" }, badge: "season_baghdad_fall" },
];

export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth() + 1;
  return SEASONS.find((s) => s.month === m) ?? SEASONS[0];
}

export function seasonStatus(s: Season, d: Date = new Date()): "active" | "archived" | "locked" {
  const m = d.getMonth() + 1;
  if (!s.month || s.month === m) return "active";
  return s.month < m ? "archived" : "locked";
}

export const CURRENT_SEASON: Season = currentSeason();
