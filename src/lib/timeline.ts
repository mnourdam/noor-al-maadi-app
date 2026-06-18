import type { Era } from "@/lib/data";
import type { PackEntity } from "@/lib/packs/types";
import { allPackEntities } from "@/lib/packs/registry";
import { getCity } from "@/lib/cities";
import { CHARACTERS, getBattleProfile } from "@/lib/data";

/**
 * The Great Timeline dataset.
 * Every year is CE (Gregorian) for sorting; Arabic labels carry the visible date.
 * Lanes:
 *   - caliphate : Caliphates / dynasties / empires (rendered as bands)
 *   - figure    : Major figures & scholars (lifespan bands, narrower)
 *   - battle    : Decisive battles (points)
 *   - book      : Books, manuscripts, scientific works (points)
 *   - event     : Pivotal historical events (points)
 */
export type TimelineLane = "caliphate" | "figure" | "battle" | "book" | "event";

export interface TimelineBand {
  id: string;
  lane: "caliphate" | "figure";
  label: string;          // Arabic
  sub?: string;           // optional short tag
  start: number;          // CE
  end: number;            // CE
  era?: Era;
  /** Where the chip links to. */
  href?: string;
  /** Color hint */
  tone?: "gold" | "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber" | "ruby" | "sand";
}

export interface TimelinePoint {
  id: string;
  lane: "battle" | "book" | "event";
  year: number;           // CE
  label: string;          // Arabic
  hint?: string;          // short description shown in tooltip card
  era?: Era;
  href?: string;
  tone?: "gold" | "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber" | "ruby" | "sand";
  glyph?: string;         // emoji marker
}

/** Master span of the timeline. */
export const TIMELINE_START = 570;
export const TIMELINE_END = 2024;

/** Anchor centuries shown along the year ruler. */
export const CENTURIES: { year: number; label: string }[] = [
  { year: 600, label: "٦٠٠" },
  { year: 700, label: "٧٠٠" },
  { year: 800, label: "٨٠٠" },
  { year: 900, label: "٩٠٠" },
  { year: 1000, label: "١٠٠٠" },
  { year: 1100, label: "١١٠٠" },
  { year: 1200, label: "١٢٠٠" },
  { year: 1300, label: "١٣٠٠" },
  { year: 1400, label: "١٤٠٠" },
  { year: 1500, label: "١٥٠٠" },
  { year: 1600, label: "١٦٠٠" },
  { year: 1700, label: "١٧٠٠" },
  { year: 1800, label: "١٨٠٠" },
  { year: 1900, label: "١٩٠٠" },
  { year: 2000, label: "٢٠٠٠" },
];

/** Era backdrops painted as faint vertical washes behind everything else. */
export const ERA_BACKDROPS: { id: Era; label: string; start: number; end: number; tone: string }[] = [
  { id: "seerah",   label: "السيرة",       start: 570,  end: 632,  tone: "from-amber-500/10" },
  { id: "rashidun", label: "الراشدة",      start: 632,  end: 661,  tone: "from-emerald-500/10" },
  { id: "umayyad",  label: "الأموية",      start: 661,  end: 750,  tone: "from-sky-500/10" },
  { id: "abbasid",  label: "العباسية",     start: 750,  end: 1258, tone: "from-violet-500/10" },
  { id: "andalus",  label: "الأندلس",      start: 711,  end: 1492, tone: "from-rose-500/10" },
  { id: "seljuk",   label: "السلاجقة",     start: 1037, end: 1194, tone: "from-indigo-500/10" },
  { id: "ayyubid",  label: "الأيوبية",     start: 1171, end: 1260, tone: "from-amber-600/10" },
  { id: "mamluk",   label: "المماليك",     start: 1250, end: 1517, tone: "from-stone-500/10" },
  { id: "ottoman",  label: "العثمانية",    start: 1299, end: 1924, tone: "from-emerald-600/10" },
  { id: "modern",   label: "الحديث",       start: 1798, end: 2024, tone: "from-zinc-400/10" },
];

export const BANDS: TimelineBand[] = [
  // ===== Caliphate / dynasty / empire bands =====
  { id: "rashidun", lane: "caliphate", label: "الخلافة الراشدة", sub: "المدينة", start: 632, end: 661, era: "rashidun", tone: "emerald", href: "/campaigns/rashidun" },
  { id: "umayyad", lane: "caliphate", label: "الدولة الأموية", sub: "دمشق", start: 661, end: 750, era: "umayyad", tone: "sky", href: "/campaigns/umayyad" },
  { id: "umayyad-andalus", lane: "caliphate", label: "أمويو الأندلس", sub: "قرطبة", start: 756, end: 1031, era: "andalus", tone: "rose", href: "/campaigns/andalus" },
  { id: "abbasid", lane: "caliphate", label: "الدولة العباسية", sub: "بغداد", start: 750, end: 1258, era: "abbasid", tone: "violet", href: "/campaigns/abbasid" },
  { id: "fatimid", lane: "caliphate", label: "الفاطميون", sub: "القاهرة", start: 909, end: 1171, tone: "ruby" },
  { id: "seljuk", lane: "caliphate", label: "السلاجقة العظام", sub: "أصفهان", start: 1037, end: 1194, era: "seljuk", tone: "indigo", href: "/campaigns/seljuk" },
  { id: "ayyubid", lane: "caliphate", label: "الدولة الأيوبية", sub: "القاهرة · دمشق", start: 1171, end: 1260, era: "ayyubid", tone: "amber", href: "/campaigns/ayyubid" },
  { id: "almoravid", lane: "caliphate", label: "المرابطون", sub: "مراكش", start: 1040, end: 1147, tone: "sand" },
  { id: "almohad", lane: "caliphate", label: "الموحّدون", sub: "إشبيلية", start: 1121, end: 1269, tone: "sand" },
  { id: "mamluk", lane: "caliphate", label: "دولة المماليك", sub: "القاهرة", start: 1250, end: 1517, era: "mamluk", tone: "gold", href: "/campaigns/mamluk" },
  { id: "ottoman", lane: "caliphate", label: "الدولة العثمانية", sub: "إستانبول", start: 1299, end: 1924, era: "ottoman", tone: "emerald", href: "/campaigns/ottoman" },
  { id: "safavid", lane: "caliphate", label: "الصفويون", sub: "إيران", start: 1501, end: 1736, tone: "indigo" },
  { id: "mughal", lane: "caliphate", label: "المغول الإسلامية", sub: "الهند", start: 1526, end: 1857, tone: "violet" },
  { id: "modern", lane: "caliphate", label: "الدول العربية الحديثة", sub: "نهضة واستقلال", start: 1924, end: 2024, era: "modern", tone: "sand" },

  // ===== Figure lifespan bands =====
  { id: "f-prophet", lane: "figure", label: "النبي محمد ﷺ", start: 570, end: 632, tone: "gold" },
  { id: "f-abubakr", lane: "figure", label: "أبو بكر الصديق", start: 573, end: 634, tone: "emerald" },
  { id: "f-omar", lane: "figure", label: "عمر بن الخطاب", start: 584, end: 644, tone: "emerald", href: "/figure/omar" },
  { id: "f-khalid", lane: "figure", label: "خالد بن الوليد", start: 585, end: 642, tone: "ruby", href: "/figure/khalid" },
  { id: "f-muawiya", lane: "figure", label: "معاوية بن أبي سفيان", start: 602, end: 680, tone: "sky", href: "/figure/muawiya" },
  { id: "f-harun", lane: "figure", label: "هارون الرشيد", start: 763, end: 809, tone: "violet", href: "/figure/harun" },
  { id: "f-khwarizmi", lane: "figure", label: "الخوارزمي", start: 780, end: 850, tone: "indigo", href: "/figure/khwarizmi" },
  { id: "f-bukhari", lane: "figure", label: "الإمام البخاري", start: 810, end: 870, tone: "emerald" },
  { id: "f-razi", lane: "figure", label: "أبو بكر الرازي", start: 854, end: 925, tone: "amber" },
  { id: "f-tariq", lane: "figure", label: "طارق بن زياد", start: 670, end: 720, tone: "rose", href: "/figure/tariq" },
  { id: "f-abdurrahman", lane: "figure", label: "عبد الرحمن الداخل", start: 731, end: 788, tone: "rose", href: "/figure/abdurrahman" },
  { id: "f-alfarabi", lane: "figure", label: "الفارابي", start: 872, end: 950, tone: "indigo" },
  { id: "f-ibnsina", lane: "figure", label: "ابن سينا", start: 980, end: 1037, tone: "indigo" },
  { id: "f-alpars", lane: "figure", label: "ألب أرسلان", start: 1029, end: 1072, tone: "indigo", href: "/figure/alp_arslan" },
  { id: "f-ghazali", lane: "figure", label: "الإمام الغزالي", start: 1058, end: 1111, tone: "violet" },
  { id: "f-ibnrushd", lane: "figure", label: "ابن رشد", start: 1126, end: 1198, tone: "rose", href: "/figure/ibn_rushd" },
  { id: "f-salahuddin", lane: "figure", label: "صلاح الدين الأيوبي", start: 1137, end: 1193, tone: "gold", href: "/figure/salahuddin" },
  { id: "f-ibnarabi", lane: "figure", label: "ابن عربي", start: 1165, end: 1240, tone: "rose" },
  { id: "f-baybars", lane: "figure", label: "الظاهر بيبرس", start: 1223, end: 1277, tone: "gold", href: "/figure/baybars" },
  { id: "f-ibntaymiya", lane: "figure", label: "ابن تيمية", start: 1263, end: 1328, tone: "amber" },
  { id: "f-ibnbattuta", lane: "figure", label: "ابن بطوطة", start: 1304, end: 1369, tone: "sky" },
  { id: "f-ibnkhaldun", lane: "figure", label: "ابن خلدون", start: 1332, end: 1406, tone: "violet" },
  { id: "f-fatih", lane: "figure", label: "محمد الفاتح", start: 1432, end: 1481, tone: "emerald", href: "/figure/fatih" },
  { id: "f-suleiman", lane: "figure", label: "سليمان القانوني", start: 1494, end: 1566, tone: "emerald" },

  // ===== Books / Manuscripts (narrow points-as-bands; render as point) =====
];

export const POINTS: TimelinePoint[] = [
  // ===== Pivotal events =====
  { id: "e-hijra", lane: "event", year: 622, label: "الهجرة النبوية", hint: "بداية التقويم الهجري ومولد دولة الإسلام.", era: "seerah", href: "/story/hijra", glyph: "🌙", tone: "gold" },
  { id: "e-fath-mecca", lane: "event", year: 630, label: "فتح مكة", hint: "دخول النبي ﷺ مكة فاتحًا.", era: "seerah", glyph: "🕋", tone: "gold" },
  { id: "e-jerusalem", lane: "event", year: 637, label: "فتح القدس", hint: "العهدة العمرية وتسلّم مفاتيح المدينة.", era: "rashidun", glyph: "🏛️", tone: "emerald" },
  { id: "e-house-wisdom", lane: "event", year: 832, label: "تأسيس بيت الحكمة", hint: "المأمون يفتتح عاصمة الترجمة في بغداد.", era: "abbasid", href: "/story/baghdad-house-of-wisdom", glyph: "📜", tone: "violet" },
  { id: "e-cordoba-lib", lane: "event", year: 976, label: "مكتبة قرطبة", hint: "أكبر مكتبة في العالم بأربعمائة ألف مجلد.", era: "andalus", glyph: "📚", tone: "rose" },
  { id: "e-crusades", lane: "event", year: 1099, label: "سقوط القدس للصليبيين", hint: "بداية الحروب الصليبية في المشرق.", era: "ayyubid", glyph: "⚔️", tone: "ruby" },
  { id: "e-mongols-bg", lane: "event", year: 1258, label: "سقوط بغداد", hint: "هولاكو يدمّر العاصمة العباسية ودار الحكمة.", era: "abbasid", glyph: "🔥", tone: "ruby" },
  { id: "e-granada", lane: "event", year: 1492, label: "سقوط غرناطة", hint: "نهاية الوجود الإسلامي في الأندلس.", era: "andalus", glyph: "🏰", tone: "rose" },
  { id: "e-istanbul", lane: "event", year: 1453, label: "فتح القسطنطينية", hint: "محمد الفاتح يكسر أسوار المدينة الحصينة.", era: "ottoman", glyph: "🏯", tone: "emerald" },
  { id: "e-suez", lane: "event", year: 1869, label: "افتتاح قناة السويس", hint: "مصر تربط البحرين.", era: "modern", glyph: "🚢", tone: "sand" },
  { id: "e-khilafa-end", lane: "event", year: 1924, label: "إلغاء الخلافة العثمانية", hint: "نهاية آخر خلافة جامعة.", era: "modern", glyph: "🕯️", tone: "sand" },

  // ===== Decisive battles =====
  { id: "b-badr", lane: "battle", year: 624, label: "بدر الكبرى", hint: "يوم الفرقان.", era: "seerah", href: "/battle/b-badr", glyph: "⚔️", tone: "gold" },
  { id: "b-yarmouk", lane: "battle", year: 636, label: "اليرموك", hint: "ستة أيام كسرت الروم.", era: "rashidun", href: "/battle/b-yarmouk", glyph: "⚔️", tone: "emerald" },
  { id: "b-qadisiyyah", lane: "battle", year: 636, label: "القادسية", hint: "سقوط الأكاسرة.", era: "rashidun", href: "/battle/b-qadisiyyah", glyph: "⚔️", tone: "emerald" },
  { id: "b-talas", lane: "battle", year: 751, label: "نهر طلاس", hint: "سرّ صناعة الورق ينتقل غربًا.", era: "abbasid", glyph: "⚔️", tone: "violet" },
  { id: "b-zallaqa", lane: "battle", year: 1086, label: "الزلاقة", hint: "المرابطون ينقذون الأندلس.", era: "andalus", glyph: "⚔️", tone: "rose" },
  { id: "b-manzikert", lane: "battle", year: 1071, label: "ملاذكرد", hint: "ألب أرسلان يفتح أبواب الأناضول.", era: "seljuk", href: "/battle/b-manzikert", glyph: "⚔️", tone: "indigo" },
  { id: "b-hattin", lane: "battle", year: 1187, label: "حِطّين", hint: "صلاح الدين يحرّر القدس.", era: "ayyubid", href: "/battle/b-hattin", glyph: "⚔️", tone: "gold" },
  { id: "b-ain-jalut", lane: "battle", year: 1260, label: "عين جالوت", hint: "قطز وبيبرس يكسران المغول.", era: "mamluk", href: "/battle/b-ain-jalut", glyph: "⚔️", tone: "gold" },
  { id: "b-constantinople", lane: "battle", year: 1453, label: "فتح القسطنطينية", hint: "نهاية بيزنطة.", era: "ottoman", href: "/battle/b-constantinople", glyph: "⚔️", tone: "emerald" },
  { id: "b-marj-dabiq", lane: "battle", year: 1516, label: "مرج دابق", hint: "العثمانيون يضمّون الشام.", era: "ottoman", glyph: "⚔️", tone: "emerald" },

  // ===== Books & manuscripts =====
  { id: "k-quran", lane: "book", year: 650, label: "جمع المصحف الشريف", hint: "مصحف عثمان الموحَّد.", era: "rashidun", glyph: "📖", tone: "gold" },
  { id: "k-sibawayh", lane: "book", year: 796, label: "الكتاب — سيبويه", hint: "أساس النحو العربي.", era: "abbasid", glyph: "📜", tone: "violet" },
  { id: "k-jabr", lane: "book", year: 820, label: "الجبر والمقابلة — الخوارزمي", hint: "ميلاد علم الجبر.", era: "abbasid", glyph: "🧮", tone: "indigo" },
  { id: "k-sahih", lane: "book", year: 846, label: "صحيح البخاري", hint: "أصحّ كتاب بعد القرآن.", era: "abbasid", glyph: "📖", tone: "emerald" },
  { id: "k-tabari", lane: "book", year: 915, label: "تاريخ الطبري", hint: "موسوعة التاريخ الإسلامي.", era: "abbasid", glyph: "📚", tone: "violet" },
  { id: "k-qanun", lane: "book", year: 1025, label: "القانون في الطب — ابن سينا", hint: "مرجع أوروبا الطبي لقرون.", era: "abbasid", glyph: "⚕️", tone: "indigo" },
  { id: "k-ihya", lane: "book", year: 1105, label: "إحياء علوم الدين — الغزالي", hint: "تجديد الروح والعقل.", era: "seljuk", glyph: "📖", tone: "violet" },
  { id: "k-muqaddima", lane: "book", year: 1377, label: "مقدمة ابن خلدون", hint: "تأسيس علم العمران.", era: "mamluk", glyph: "📜", tone: "violet" },
  { id: "k-rihla", lane: "book", year: 1355, label: "رحلة ابن بطوطة", hint: "ثلاثون عامًا حول العالم.", era: "mamluk", glyph: "🧭", tone: "sky" },
  { id: "k-nahda", lane: "book", year: 1898, label: "بدايات النهضة العربية", hint: "صحف ومجلات وكتب أيقظت الأمة.", era: "modern", glyph: "📰", tone: "sand" },
];

export interface TimelineFilter { lane: TimelineLane; label: string; icon: string }
export const LANE_META: Record<TimelineLane, { label: string; row: number; height: number }> = {
  caliphate: { label: "الدول والخلافات", row: 0, height: 28 },
  figure:    { label: "أعلام التاريخ",   row: 1, height: 20 },
  battle:    { label: "المعارك الفاصلة", row: 2, height: 36 },
  book:      { label: "كتب ومخطوطات",    row: 3, height: 36 },
  event:     { label: "أحداث محورية",    row: 4, height: 36 },
};

export const TONE_CLASSES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  gold:    { bg: "bg-amber-500/25",   border: "border-amber-400/50",  text: "text-amber-100",   dot: "bg-amber-400" },
  indigo:  { bg: "bg-indigo-500/25",  border: "border-indigo-400/50", text: "text-indigo-100",  dot: "bg-indigo-400" },
  rose:    { bg: "bg-rose-500/25",    border: "border-rose-400/50",   text: "text-rose-100",    dot: "bg-rose-400" },
  emerald: { bg: "bg-emerald-500/25", border: "border-emerald-400/50",text: "text-emerald-100", dot: "bg-emerald-400" },
  sky:     { bg: "bg-sky-500/25",     border: "border-sky-400/50",    text: "text-sky-100",     dot: "bg-sky-400" },
  violet:  { bg: "bg-violet-500/25",  border: "border-violet-400/50", text: "text-violet-100",  dot: "bg-violet-400" },
  amber:   { bg: "bg-amber-600/25",   border: "border-amber-500/50",  text: "text-amber-50",    dot: "bg-amber-500" },
  ruby:    { bg: "bg-red-600/25",     border: "border-red-500/50",    text: "text-red-100",     dot: "bg-red-500" },
  sand:    { bg: "bg-stone-400/25",   border: "border-stone-300/50",  text: "text-stone-100",   dot: "bg-stone-300" },
};

// ============================================================
// Pack-entity → timeline projection
// ------------------------------------------------------------
// Every encyclopedia entity that carries a `timelinePosition` (or period)
// is automatically projected onto the Great Timeline. The href is the
// canonical encyclopedia / legacy route resolved by the same rules as
// EncyclopediaCard, so taps on the timeline always lead to a real page.
// ============================================================

function entityToneFor(e: PackEntity): TimelineBand["tone"] {
  const era = e.bridges?.era;
  if (era === "ayyubid") return "amber";
  if (era === "umayyad") return "sky";
  if (era === "abbasid") return "violet";
  if (era === "andalus") return "rose";
  if (era === "ottoman") return "emerald";
  if (era === "mamluk")  return "gold";
  if (era === "seljuk")  return "indigo";
  if (era === "rashidun")return "emerald";
  if (era === "seerah")  return "gold";
  return "sand";
}

function entityHrefForTimeline(e: PackEntity): string {
  const b = e.bridges;
  if (e.type === "city" && b?.cityId && getCity(b.cityId)) return `/city/${b.cityId}`;
  if (e.type === "battle" && b?.battleId && getBattleProfile(b.battleId)) return `/battle/${b.battleId}`;
  if (e.type === "figure" && b?.characterId && CHARACTERS.some((c) => c.id === b.characterId)) return `/figure/${b.characterId}`;
  if (e.type === "state" && b?.era) return `/encyclopedia/state/${b.era}`;
  return `/encyclopedia/entity/${e.id}`;
}

function entityGlyph(e: PackEntity): string {
  if (e.image?.glyph) return e.image.glyph;
  if (e.type === "battle") return "⚔️";
  if (e.type === "city")   return "🏛️";
  if (e.type === "landmark") return "🏰";
  if (e.type === "artifact") return "📜";
  return "✦";
}

/** Pack entities projected as additional timeline bands (states + lifespans). */
export function packBands(): TimelineBand[] {
  const out: TimelineBand[] = [];
  for (const e of allPackEntities()) {
    const { startYear, endYear } = e.period;
    if (!startYear || !endYear || endYear <= startYear) continue;
    if (e.type === "state") {
      out.push({
        id: `pk-${e.id}`, lane: "caliphate", label: e.title,
        start: startYear, end: endYear,
        era: e.bridges?.era as Era | undefined,
        href: entityHrefForTimeline(e), tone: entityToneFor(e),
      });
    } else if (e.type === "figure") {
      out.push({
        id: `pk-${e.id}`, lane: "figure", label: e.title,
        start: startYear, end: endYear,
        era: e.bridges?.era as Era | undefined,
        href: entityHrefForTimeline(e), tone: entityToneFor(e),
      });
    }
  }
  return out;
}

/** Pack entities projected as additional timeline points (battles, events, books, landmarks). */
export function packPoints(): TimelinePoint[] {
  const out: TimelinePoint[] = [];
  for (const e of allPackEntities()) {
    const year = e.timelinePosition;
    if (!year) continue;
    let lane: TimelinePoint["lane"] | null = null;
    if (e.type === "battle") lane = "battle";
    else if (e.type === "event") lane = "event";
    else if (e.type === "city" || e.type === "landmark") lane = "event";
    else if (e.type === "artifact") lane = "book";
    if (!lane) continue;
    out.push({
      id: `pk-${e.id}`, lane, year, label: e.title,
      hint: e.description, era: e.bridges?.era as Era | undefined,
      href: entityHrefForTimeline(e),
      tone: entityToneFor(e), glyph: entityGlyph(e),
    });
  }
  return out;
}

/** Combined static + pack bands/points, de-duplicated by lane + label + start year. */
export function allBands(): TimelineBand[] {
  const seen = new Set(BANDS.map((b) => `${b.lane}|${b.label}|${b.start}`));
  const extra = packBands().filter((b) => !seen.has(`${b.lane}|${b.label}|${b.start}`));
  return [...BANDS, ...extra];
}
export function allPoints(): TimelinePoint[] {
  const seen = new Set(POINTS.map((p) => `${p.lane}|${p.label}|${p.year}`));
  const extra = packPoints().filter((p) => !seen.has(`${p.lane}|${p.label}|${p.year}`));
  return [...POINTS, ...extra];
}