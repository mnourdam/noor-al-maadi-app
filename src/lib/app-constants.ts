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
// ACHIEVEMENTS — long-term goals (rendered with derived state)
// ============================================================
export type AchievementCategory =
  | "reading"
  | "exploration"
  | "mastery"
  | "dedication"
  | "campaigns"
  | "collection"
  | "wealth"
  | "legendary";

export const ACHIEVEMENT_CATEGORIES: { id: AchievementCategory; name: string; tagline: string; icon: string }[] = [
  { id: "reading",     name: "القراءة والرواية",   tagline: "إنجازات القراءة والاستيعاب",     icon: "📖" },
  { id: "exploration", name: "الاستكشاف",          tagline: "اكتشاف الشخصيات والأماكن",       icon: "🗺️" },
  { id: "mastery",     name: "الإتقان",            tagline: "تحقيقات وقرارات وخطوط زمن",      icon: "🧭" },
  { id: "campaigns",   name: "الحملات التاريخية",  tagline: "إنجاز الحملات الكبرى",           icon: "⚔️" },
  { id: "collection",  name: "الجامع والمتحف",     tagline: "بناء متحفك الخاص من الإرث",      icon: "🏛️" },
  { id: "dedication",  name: "المثابرة",           tagline: "السلاسل اليومية والمستويات",     icon: "🔥" },
  { id: "wealth",      name: "الثروة والمكانة",    tagline: "الدنانير والألقاب والشارات",     icon: "👑" },
  { id: "legendary",   name: "الأساطير",           tagline: "أرقى مراتب رحّالة الإرث",        icon: "✨" },
];

export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "secret";

export type AchievementRewardKind =
  | "xp"
  | "dinars"
  | "museum"
  | "badge"
  | "avatar"
  | "title"
  | "none";

export interface AchievementReward {
  kind: AchievementRewardKind;
  /** Numeric amount for xp / dinars. */
  amount?: number;
  /** Target id for museum unlock, badge, avatar, or title. */
  refId?: string;
  /** Optional human-readable label (e.g. title text). */
  label?: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  goal: number;
  category: AchievementCategory;
  /** Visual rarity tier. Defaults to "common" when omitted. */
  rarity?: AchievementRarity;
  /** Zero or more rewards granted when the achievement unlocks. */
  rewards?: AchievementReward[];
  /** Hide name/desc/icon in lists until unlocked. Implies secret styling. */
  hidden_until_unlocked?: boolean;
  /** Legacy alias for hidden_until_unlocked. */
  secret?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ===== Reading =====
  { id: "ach_read_5",    name: "قارئ التاريخ",   desc: "أنهِ قراءة 5 قصص.",   icon: "📖", goal: 5,   category: "reading", rarity: "common",    rewards: [{ kind: "xp", amount: 50 }] },
  { id: "ach_read_15",   name: "راوي الأمّة",     desc: "أنهِ قراءة 15 قصة.",  icon: "📚", goal: 15,  category: "reading", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 150 }, { kind: "dinars", amount: 75 }] },
  { id: "ach_read_30",   name: "حافظ السير",     desc: "أنهِ قراءة 30 قصة.",  icon: "📓", goal: 30,  category: "reading", rarity: "rare",      rewards: [{ kind: "xp", amount: 350 }, { kind: "dinars", amount: 150 }] },
  { id: "ach_read_60",   name: "شيخ الرواة",     desc: "أنهِ قراءة 60 قصة.",  icon: "📜", goal: 60,  category: "reading", rarity: "epic",      rewards: [{ kind: "xp", amount: 800 }, { kind: "dinars", amount: 350 }] },
  { id: "ach_read_120",  name: "إمام القرّاء",   desc: "أنهِ قراءة 120 قصة.", icon: "🕯️", goal: 120, category: "reading", rarity: "legendary", rewards: [{ kind: "xp", amount: 2000 }, { kind: "title", label: "إمام القرّاء" }] },
  { id: "ach_saved_10",  name: "خزانة الكتب",    desc: "احفظ 10 قصص للقراءة لاحقًا.", icon: "🔖", goal: 10, category: "reading", rarity: "uncommon", rewards: [{ kind: "dinars", amount: 80 }] },

  // ===== Exploration =====
  { id: "ach_char_6",    name: "كاتب السير",        desc: "افتح 6 شخصيات.",            icon: "🎴", goal: 6,   category: "exploration", rarity: "common",    rewards: [{ kind: "xp", amount: 80 }] },
  { id: "ach_char_15",   name: "ديوان الأعلام",     desc: "افتح 15 شخصية.",            icon: "🪪", goal: 15,  category: "exploration", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 200 }, { kind: "dinars", amount: 100 }] },
  { id: "ach_char_30",   name: "مؤرّخ الرجال",      desc: "افتح 30 شخصية.",            icon: "🧑‍🎓", goal: 30, category: "exploration", rarity: "rare",      rewards: [{ kind: "xp", amount: 500 }, { kind: "dinars", amount: 200 }] },
  { id: "ach_char_60",   name: "موسوعة الشخصيات",  desc: "افتح 60 شخصية.",            icon: "👤", goal: 60,  category: "exploration", rarity: "epic",      rewards: [{ kind: "xp", amount: 1200 }, { kind: "title", label: "موسوعة الشخصيات" }] },
  { id: "ach_region_5",  name: "فاتح الأقاليم",     desc: "افتح 5 مناطق على الأطلس.",  icon: "🗺️", goal: 5,   category: "exploration", rarity: "common",    rewards: [{ kind: "xp", amount: 80 }] },
  { id: "ach_region_10", name: "رحّالة الأقطار",    desc: "افتح 10 مناطق على الأطلس.", icon: "🧭", goal: 10,  category: "exploration", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 200 }] },
  { id: "ach_region_15", name: "جغرافيُّ الأمّة",    desc: "افتح 15 منطقة على الأطلس.", icon: "🌍", goal: 15,  category: "exploration", rarity: "rare",      rewards: [{ kind: "xp", amount: 500 }, { kind: "dinars", amount: 250 }] },
  { id: "ach_eras_5",    name: "عبر العصور",       desc: "افتح 5 عصور تاريخية.",       icon: "🏺", goal: 5,   category: "exploration", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 250 }] },
  { id: "ach_eras_10",   name: "ابن العصور",       desc: "افتح 10 عصور تاريخية.",      icon: "⏳", goal: 10,  category: "exploration", rarity: "epic",      rewards: [{ kind: "xp", amount: 800 }, { kind: "title", label: "ابن العصور" }] },

  // ===== Mastery =====
  { id: "ach_inv_5",       name: "محقّق ماهر",     desc: "حلّ 5 قضايا تحقيق.",        icon: "🔍", goal: 5,  category: "mastery", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_inv_15",      name: "كاشف الأسرار",   desc: "حلّ 15 قضية تحقيق.",        icon: "🕵️", goal: 15, category: "mastery", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 300 }, { kind: "dinars", amount: 150 }] },
  { id: "ach_inv_30",      name: "قاضي القضاة",    desc: "حلّ 30 قضية تحقيق.",        icon: "⚖️", goal: 30, category: "mastery", rarity: "rare",      rewards: [{ kind: "xp", amount: 700 }, { kind: "dinars", amount: 300 }] },
  { id: "ach_inv_60",      name: "إمام المحقّقين", desc: "حلّ 60 قضية تحقيق.",        icon: "🗝️", goal: 60, category: "mastery", rarity: "legendary", rewards: [{ kind: "xp", amount: 2000 }, { kind: "title", label: "إمام المحقّقين" }] },
  { id: "ach_decisions_5", name: "صانع القرار",    desc: "اتّخذ 5 قراراتٍ تاريخية.",   icon: "🧭", goal: 5,  category: "mastery", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_decisions_15",name: "وزير الرأي",     desc: "اتّخذ 15 قرارًا تاريخيًا.",   icon: "🪶", goal: 15, category: "mastery", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 300 }] },
  { id: "ach_decisions_40",name: "حكيم الأمّة",    desc: "اتّخذ 40 قرارًا تاريخيًا.",   icon: "👴", goal: 40, category: "mastery", rarity: "epic",      rewards: [{ kind: "xp", amount: 900 }, { kind: "title", label: "حكيم الأمّة" }] },
  { id: "ach_timeline_5",  name: "حافظ التواريخ",  desc: "رتّب 5 خطوطٍ زمنية.",        icon: "🗓️", goal: 5,  category: "mastery", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_timeline_15", name: "ميزان التاريخ",  desc: "رتّب 15 خطًّا زمنيًا.",       icon: "⌛", goal: 15, category: "mastery", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 300 }] },
  { id: "ach_timeline_30", name: "سيّد الأزمنة",   desc: "رتّب 30 خطًّا زمنيًا.",       icon: "🕰️", goal: 30, category: "mastery", rarity: "rare",      rewards: [{ kind: "xp", amount: 700 }, { kind: "dinars", amount: 300 }] },

  // ===== Campaigns =====
  { id: "ach_campaign_1",  name: "أوّل الحملات",   desc: "أتمم أول حملة تاريخية.",     icon: "🎌", goal: 1,  category: "campaigns", rarity: "common",    rewards: [{ kind: "xp", amount: 150 }, { kind: "dinars", amount: 100 }] },
  { id: "ach_campaign_3",  name: "قائد الحملات",   desc: "أتمم 3 حملات تاريخية.",      icon: "⚔️", goal: 3,  category: "campaigns", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 400 }, { kind: "dinars", amount: 200 }] },
  { id: "ach_campaign_5",  name: "أمير الحملات",   desc: "أتمم 5 حملات تاريخية.",      icon: "🛡️", goal: 5,  category: "campaigns", rarity: "rare",      rewards: [{ kind: "xp", amount: 800 }, { kind: "dinars", amount: 400 }] },
  { id: "ach_campaign_10", name: "قاهر الجبهات",   desc: "أتمم 10 حملات تاريخية.",     icon: "🏰", goal: 10, category: "campaigns", rarity: "epic",      rewards: [{ kind: "xp", amount: 1800 }, { kind: "title", label: "قاهر الجبهات" }] },
  { id: "ach_campaign_20", name: "فاتح الفاتحين",  desc: "أتمم 20 حملة تاريخية.",      icon: "👑", goal: 20, category: "campaigns", rarity: "legendary", rewards: [{ kind: "xp", amount: 4000 }, { kind: "title", label: "فاتح الفاتحين" }] },
  { id: "ach_missions_25", name: "مُتقن المهمّات", desc: "أتمم 25 مهمة.",              icon: "🎯", goal: 25, category: "campaigns", rarity: "rare",      rewards: [{ kind: "xp", amount: 500 }] },

  // ===== Collection / Museum =====
  { id: "ach_artifact_10", name: "جامع الآثار",   desc: "اكتشف 10 آثار.",      icon: "🏺", goal: 10,  category: "collection", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_artifact_25", name: "أمين المتحف",   desc: "اكتشف 25 أثرًا.",     icon: "⚱️", goal: 25,  category: "collection", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 250 }, { kind: "dinars", amount: 150 }] },
  { id: "ach_artifact_50", name: "حافظ التراث",   desc: "اكتشف 50 أثرًا.",     icon: "🗿", goal: 50,  category: "collection", rarity: "rare",      rewards: [{ kind: "xp", amount: 600 }, { kind: "dinars", amount: 350 }] },
  { id: "ach_artifact_100",name: "ربّ المتحف",    desc: "اكتشف 100 أثر.",     icon: "🏛️", goal: 100, category: "collection", rarity: "epic",      rewards: [{ kind: "xp", amount: 1500 }, { kind: "title", label: "ربّ المتحف" }] },
  { id: "ach_collection_50",  name: "خزانة الإرث",   desc: "اجمع 50 قطعة بين أثر وشخصية.",  icon: "📦", goal: 50,  category: "collection", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 300 }] },
  { id: "ach_collection_150", name: "بيت الحكمة",    desc: "اجمع 150 قطعة بين أثر وشخصية.", icon: "🏯", goal: 150, category: "collection", rarity: "epic",      rewards: [{ kind: "xp", amount: 1200 }, { kind: "dinars", amount: 600 }] },
  { id: "ach_collection_300", name: "أرشيف الأمّة",  desc: "اجمع 300 قطعة بين أثر وشخصية.", icon: "🗄️", goal: 300, category: "collection", rarity: "legendary", rewards: [{ kind: "xp", amount: 3000 }, { kind: "title", label: "أمين الأرشيف الأكبر" }] },

  // ===== Dedication =====
  { id: "ach_streak_7",   name: "أسبوعٌ من النور",  desc: "حافظ على 7 أيام متتالية.",   icon: "🔥", goal: 7,   category: "dedication", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_streak_30",  name: "شهرٌ من الإصرار",  desc: "حافظ على 30 يومًا متتالية.", icon: "🌙", goal: 30,  category: "dedication", rarity: "rare",      rewards: [{ kind: "xp", amount: 400 }, { kind: "dinars", amount: 250 }] },
  { id: "ach_streak_100", name: "مئةُ فجر",         desc: "حافظ على 100 يوم متتالية.",  icon: "☀️", goal: 100, category: "dedication", rarity: "epic",      rewards: [{ kind: "xp", amount: 1500 }, { kind: "title", label: "صاحب المئة" }] },
  { id: "ach_streak_365", name: "حارس العام",      desc: "حافظ على 365 يومًا متتالية.", icon: "🌟", goal: 365, category: "dedication", rarity: "legendary", rewards: [{ kind: "xp", amount: 5000 }, { kind: "title", label: "حارس العام" }] },
  { id: "ach_level_5",    name: "عالم التاريخ",    desc: "ابلغ المستوى الخامس.",        icon: "⭐", goal: 5,   category: "dedication", rarity: "common",    rewards: [{ kind: "xp", amount: 150 }] },
  { id: "ach_level_7",    name: "حكيم الرحّالة",   desc: "ابلغ المستوى السابع.",        icon: "🌠", goal: 7,   category: "dedication", rarity: "rare",      rewards: [{ kind: "dinars", amount: 400 }] },
  { id: "ach_level_10",   name: "أسطورة التاريخ",  desc: "ابلغ المستوى العاشر.",        icon: "🏅", goal: 10,  category: "dedication", rarity: "legendary", rewards: [{ kind: "title", label: "أسطورة التاريخ" }] },

  // ===== Wealth / Status =====
  { id: "ach_points_1000",  name: "ألف نقطة",     desc: "اجمع 1,000 نقطة خبرة.",   icon: "💎", goal: 1000,  category: "wealth", rarity: "common",    rewards: [{ kind: "dinars", amount: 100 }] },
  { id: "ach_points_5000",  name: "خمسة آلاف",    desc: "اجمع 5,000 نقطة خبرة.",   icon: "💠", goal: 5000,  category: "wealth", rarity: "uncommon",  rewards: [{ kind: "dinars", amount: 500 }] },
  { id: "ach_points_15000", name: "خمسةَ عشر ألفًا", desc: "اجمع 15,000 نقطة خبرة.", icon: "🔷", goal: 15000, category: "wealth", rarity: "rare",      rewards: [{ kind: "dinars", amount: 1500 }] },
  { id: "ach_points_50000", name: "خمسون ألفًا",   desc: "اجمع 50,000 نقطة خبرة.",  icon: "🟣", goal: 50000, category: "wealth", rarity: "epic",      rewards: [{ kind: "title", label: "ذو الخمسين" }] },
  { id: "ach_dinars_500",   name: "ذو دينار",     desc: "اجمع 500 دينار.",         icon: "🪙", goal: 500,   category: "wealth", rarity: "common",    rewards: [{ kind: "xp", amount: 100 }] },
  { id: "ach_dinars_2000",  name: "ذو الدنانير",  desc: "اجمع 2,000 دينار.",       icon: "💰", goal: 2000,  category: "wealth", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 300 }] },
  { id: "ach_dinars_10000", name: "تاجر الإرث",  desc: "اجمع 10,000 دينار.",      icon: "🏦", goal: 10000, category: "wealth", rarity: "epic",      rewards: [{ kind: "title", label: "تاجر الإرث" }] },
  { id: "ach_titles_3",     name: "صاحب الألقاب", desc: "احصل على 3 ألقاب.",       icon: "🎖️", goal: 3,    category: "wealth", rarity: "uncommon",  rewards: [{ kind: "xp", amount: 250 }] },
  { id: "ach_titles_10",    name: "ديوان الألقاب",desc: "احصل على 10 ألقاب.",      icon: "🏵️", goal: 10,   category: "wealth", rarity: "epic",      rewards: [{ kind: "dinars", amount: 1500 }] },
  { id: "ach_badges_10",    name: "حامل الشارات", desc: "اجمع 10 شارات.",          icon: "🎗️", goal: 10,   category: "wealth", rarity: "rare",      rewards: [{ kind: "xp", amount: 500 }] },

  // ===== Legendary / Completionist =====
  { id: "ach_legend_combo",   name: "ثلاثيّةُ الإتقان", desc: "أنهِ 30 قصة و30 تحقيقًا و30 خطًّا زمنيًا.", icon: "🌌", goal: 90,  category: "legendary", rarity: "legendary", rewards: [{ kind: "xp", amount: 3000 }, { kind: "title", label: "ثلاثيّ الإتقان" }] },
  { id: "ach_legend_master",  name: "سيّد كل الميادين", desc: "أتمم 10 حملات و100 أثر و100 يوم متتالٍ.",   icon: "👑", goal: 210, category: "legendary", rarity: "legendary", rewards: [{ kind: "xp", amount: 5000 }, { kind: "title", label: "سيّد الميادين" }] },
  { id: "ach_legend_eternal", name: "خالد في الإرث",   desc: "ابلغ المستوى العاشر مع 365 يومًا متتاليًا.",  icon: "♾️", goal: 375, category: "legendary", rarity: "legendary", hidden_until_unlocked: true, rewards: [{ kind: "title", label: "الخالد" }] },
];

// -------------------------------------------------------------------------
// Legacy `evaluateAchievements` / `AchievementProgress` were removed in the
// Achievement Engine v2 finalization slice. All achievement unlocking, progress
// computation, and reward granting now flow through `@/lib/achievements/v2`
// (canonical Snapshot -> Evaluator -> Reconciler -> server RPC).
//
// The `ACHIEVEMENTS` / `ACHIEVEMENT_CATEGORIES` content catalogs above are
// COMPATIBILITY-ONLY: kept as display metadata (name/desc/icon/goal/category)
// for the profile achievements-tab UI and the 15 flagged historical entries
// listed in `src/lib/achievements/v2/definitions/flagged.ts`. They MUST NOT
// be used to compute unlocks, progress, or grant rewards - that path is
// deleted. Ported achievements source their state from v2 `AchievementView`s.
// -------------------------------------------------------------------------

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
