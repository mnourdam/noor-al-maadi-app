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
  | "modern";

export const ERAS: { id: Era; name: string; years: string; tagline: string }[] = [
  { id: "seerah", name: "السيرة النبوية", years: "570 – 632 م", tagline: "نور النبوّة وميلاد أمّة" },
  { id: "rashidun", name: "الخلافة الراشدة", years: "632 – 661 م", tagline: "عدلٌ وفتوحٌ ومجدٌ تأسيسي" },
  { id: "umayyad", name: "الدولة الأموية", years: "661 – 750 م", tagline: "من دمشق إلى أطراف الأرض" },
  { id: "abbasid", name: "الدولة العباسية", years: "750 – 1258 م", tagline: "بغداد عاصمة الحضارة" },
  { id: "andalus", name: "الأندلس", years: "711 – 1492 م", tagline: "زهرة الغرب الإسلامي" },
  { id: "seljuk", name: "السلاجقة", years: "1037 – 1194 م", tagline: "حماة المشرق الإسلامي" },
  { id: "ayyubid", name: "الأيوبيون", years: "1171 – 1260 م", tagline: "صلاح الدين وتحرير القدس" },
  { id: "mamluk", name: "المماليك", years: "1250 – 1517 م", tagline: "كاسرو المغول وحماة الحرمين" },
  { id: "ottoman", name: "الدولة العثمانية", years: "1299 – 1924 م", tagline: "خلافة امتدّت ستة قرون" },
  { id: "modern", name: "التاريخ العربي الحديث", years: "1798 – اليوم", tagline: "نهضة، استقلال، وتحوّلات" },
];

// ============================================================
// LEVELS — XP curve + helper
// ============================================================
export interface LevelInfo { level: number; min: number; title: string; rank: string }
export const LEVELS: LevelInfo[] = [
  { level: 1, min: 0,    title: "رحّالة مبتدئ",  rank: "برونزي" },
  { level: 2, min: 120,  title: "مستكشف",        rank: "برونزي" },
  { level: 3, min: 280,  title: "راوي إرث",    rank: "فضّي"   },
  { level: 4, min: 500,  title: "مؤرّخ",          rank: "فضّي"   },
  { level: 5, min: 800,  title: "عالم تاريخ",     rank: "ذهبي"   },
  { level: 6, min: 1200, title: "شيخ المؤرّخين", rank: "ذهبي"   },
  { level: 7, min: 1700, title: "حكيم الأمّة",   rank: "بلاتيني" },
  { level: 8, min: 2400, title: "إمام التاريخ",   rank: "بلاتيني" },
  { level: 9, min: 3200, title: "سيّد إرث",   rank: "أسطوري" },
  { level: 10, min: 4500, title: "أسطورة التاريخ", rank: "أسطوري" },
];

export function levelFor(points: number) {
  let current = LEVELS[0];
  let next: LevelInfo | null = LEVELS[1] ?? null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    }
  }
  const progress = next ? Math.min(1, (points - current.min) / (next.min - current.min)) : 1;
  return { ...current, next, progress, toNext: next ? Math.max(0, next.min - points) : 0 };
}

// ============================================================
// ACHIEVEMENTS — long-term goals (rendered with derived state)
// ============================================================
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  goal: number;
  secret?: boolean;
}
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "ach_read_5",     name: "قارئ التاريخ",        desc: "أنهِ قراءة 5 قصص.",            icon: "📖", goal: 5 },
  { id: "ach_read_15",    name: "راوي الأمّة",         desc: "أنهِ قراءة 15 قصة.",           icon: "📚", goal: 15 },
  { id: "ach_inv_5",      name: "محقّق ماهر",          desc: "حلّ 5 قضايا تحقيق.",           icon: "🔍", goal: 5 },
  { id: "ach_decisions_5",name: "صانع القرار",         desc: "اتّخذ 5 قراراتٍ تاريخية.",      icon: "🧭", goal: 5 },
  { id: "ach_timeline_5", name: "حافظ التواريخ",        desc: "رتّب 5 خطوطٍ زمنية.",          icon: "🗓️", goal: 5 },
  { id: "ach_artifact_10",name: "جامع الآثار",          desc: "اكتشف 10 آثار.",               icon: "🏺", goal: 10 },
  { id: "ach_char_6",     name: "كاتب السير",           desc: "افتح 6 شخصيات.",              icon: "🎴", goal: 6 },
  { id: "ach_region_5",   name: "فاتح الأقاليم",        desc: "افتح 5 مناطق على الخارطة.",    icon: "🗺️", goal: 5 },
  { id: "ach_streak_7",   name: "أسبوعٌ من النور",       desc: "حافظ على 7 أيام متتالية.",     icon: "🔥", goal: 7 },
  { id: "ach_streak_30",  name: "شهرٌ من الإصرار",       desc: "حافظ على 30 يومًا متتالية.",   icon: "🌙", goal: 30 },
  { id: "ach_campaign_3", name: "قائد الحملات",          desc: "أتمم 3 حملات تاريخية.",        icon: "⚔️", goal: 3 },
  { id: "ach_level_5",    name: "عالم التاريخ",         desc: "ابلغ المستوى الخامس.",         icon: "⭐", goal: 5 },
];

export interface AchievementProgress { id: string; current: number; earned: boolean }
export function evaluateAchievements(p: {
  storiesRead: string[]; investigationsCompleted: string[]; decisionsCompleted: string[];
  timelinesCompleted: string[]; artifactsFound: string[]; charactersUnlocked: string[];
  regionsUnlocked: string[]; streak: number; campaignsCompleted: string[]; points: number;
}): AchievementProgress[] {
  const lvl = levelFor(p.points).level;
  const map: Record<string, number> = {
    ach_read_5: p.storiesRead.length,
    ach_read_15: p.storiesRead.length,
    ach_inv_5: p.investigationsCompleted.length,
    ach_decisions_5: p.decisionsCompleted.length,
    ach_timeline_5: p.timelinesCompleted.length,
    ach_artifact_10: p.artifactsFound.length,
    ach_char_6: p.charactersUnlocked.length,
    ach_region_5: p.regionsUnlocked.length,
    ach_streak_7: p.streak,
    ach_streak_30: p.streak,
    ach_campaign_3: p.campaignsCompleted.length,
    ach_level_5: lvl,
  };
  return ACHIEVEMENTS.map((a) => {
    const cur = map[a.id] ?? 0;
    return { id: a.id, current: Math.min(cur, a.goal), earned: cur >= a.goal };
  });
}

// ============================================================
// SEASONS — 12 monthly seasons, rotated by Gregorian month
// ============================================================
export interface Season {
  id: string;
  name: string;
  tagline: string;
  goalPoints: number;
  endsAt: string;
  reward: { points: number; artifact?: string; title?: string };
  month?: number;
  theme?: string;
  badge?: string;
}

export const SEASONS: Season[] = [
  { id: "season_seerah",     month: 1,  name: "موسم السيرة النبوية", tagline: "عش شهرًا في نور النبوّة وأخلاق صاحب الرسالة ﷺ.", theme: "نور النبوّة",      goalPoints: 600, endsAt: "نهاية يناير",   reward: { points: 200, title: "صاحب الرسالة" },     badge: "season_seerah" },
  { id: "season_rashidun",   month: 2,  name: "موسم الراشدين",        tagline: "ارفع رايتك مع الخلفاء الأربعة من خلال مهمّات هذا الشهر.", theme: "عدلٌ وفتوح",      goalPoints: 650, endsAt: "نهاية فبراير",  reward: { points: 220, title: "ابن الفاروق" },       badge: "season_rashidun" },
  { id: "season_andalus",    month: 3,  name: "موسم الأندلس",         tagline: "من جبل طارق إلى قرطبة، اجمع نقاطك في موسم الأندلس.", theme: "زهرة الغرب",      goalPoints: 700, endsAt: "نهاية مارس",    reward: { points: 240, title: "فارس قرطبة" },        badge: "season_andalus" },
  { id: "season_baghdad",    month: 4,  name: "موسم بغداد",           tagline: "ادخل بيت الحكمة وكن من علماء العصر الذهبي.", theme: "بيت الحكمة",      goalPoints: 720, endsAt: "نهاية أبريل",   reward: { points: 240, title: "عالم العصر الذهبي" }, badge: "season_baghdad" },
  { id: "season_constantinople", month: 5, name: "موسم الفتح",         tagline: "قف على أسوار القسطنطينية مع محمد الفاتح.", theme: "أسوار القسطنطينية", goalPoints: 750, endsAt: "نهاية مايو",  reward: { points: 260, title: "من جند الفاتح" },      badge: "season_constantinople" },
  { id: "season_seerah_late",month: 6,  name: "موسم المدينة",         tagline: "اقتفِ أثر الأنصار في دار الهجرة.", theme: "دارُ الهجرة",     goalPoints: 700, endsAt: "نهاية يونيو",   reward: { points: 240, title: "أنصاريٌّ صادق" },     badge: "season_madina" },
  { id: "season_jerusalem",  month: 7,  name: "موسم القدس",           tagline: "اجمع 750 نقطة هذا الموسم لتنال لقب «من حُماة الأقصى».", theme: "عودة الأذان",     goalPoints: 750, endsAt: "نهاية يوليو",  reward: { points: 250, title: "من حُماة الأقصى" }, badge: "season_jerusalem" },
  { id: "season_yarmouk",    month: 8,  name: "موسم اليرموك",         tagline: "كن من فرسان خالد في كسرة الروم.", theme: "كاسرو الروم",     goalPoints: 700, endsAt: "نهاية أغسطس",   reward: { points: 240, title: "من فرسان خالد" },     badge: "season_yarmouk" },
  { id: "season_ain_jalut",  month: 9,  name: "موسم عين جالوت",       tagline: "احفظ مصر والشام مع قطز وبيبرس.", theme: "كاسرو المغول",   goalPoints: 750, endsAt: "نهاية سبتمبر",  reward: { points: 260, title: "من جند قطز" },         badge: "season_ain_jalut" },
  { id: "season_andalus_fall",month:10, name: "موسم الأندلس الأخيرة", tagline: "احفظ ذاكرة غرناطة قبل سقوط الراية.", theme: "ذاكرة لا تموت",   goalPoints: 700, endsAt: "نهاية أكتوبر",  reward: { points: 240, title: "حافظ الأندلس" },       badge: "season_andalus_fall" },
  { id: "season_seljuk",     month: 11, name: "موسم السلاجقة",        tagline: "ادخل الأناضول من بوابة ملاذكرد.", theme: "بوابة الأناضول",  goalPoints: 720, endsAt: "نهاية نوفمبر",  reward: { points: 250, title: "من فرسان ألب أرسلان" }, badge: "season_seljuk" },
  { id: "season_baghdad_fall",month: 12,name: "موسم بغداد الحزينة",   tagline: "احمل قبسًا من ضوء بيت الحكمة قبل دجلة.", theme: "ذكرى السقوط",     goalPoints: 700, endsAt: "نهاية ديسمبر",  reward: { points: 240, title: "حافظ بيت الحكمة" },   badge: "season_baghdad_fall" },
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
