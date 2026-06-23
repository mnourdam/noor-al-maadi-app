// ============================================================
// Timeline types + presentation constants.
// Legacy hardcoded BANDS/POINTS arrays and pack-projection helpers
// have been removed; the runtime now reads exclusively from
// encyclopedia_entities via lib/timeline-source.
// ============================================================

/** Era key used to tint bands and points. Kept local so this module
 *  no longer depends on lib/data. */
export type Era =
  | "seerah" | "rashidun" | "umayyad" | "abbasid" | "andalus"
  | "seljuk" | "ayyubid" | "mamluk" | "ottoman" | "modern";

export type TimelineLane = "caliphate" | "figure" | "battle" | "book" | "event";

export interface TimelineBand {
  id: string;
  lane: "caliphate" | "figure";
  label: string;
  sub?: string;
  start: number;
  end: number;
  era?: Era;
  href?: string;
  tone?: "gold" | "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber" | "ruby" | "sand";
}

export interface TimelinePoint {
  id: string;
  lane: "battle" | "book" | "event";
  year: number;
  label: string;
  hint?: string;
  era?: Era;
  href?: string;
  tone?: "gold" | "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber" | "ruby" | "sand";
  glyph?: string;
}

/** Master span of the timeline. */
export const TIMELINE_START = 570;
export const TIMELINE_END = 2024;

export const CENTURIES: { year: number; label: string }[] = [
  { year: 600, label: "600" }, { year: 700, label: "700" }, { year: 800, label: "800" },
  { year: 900, label: "900" }, { year: 1000, label: "1000" }, { year: 1100, label: "1100" },
  { year: 1200, label: "1200" }, { year: 1300, label: "1300" }, { year: 1400, label: "1400" },
  { year: 1500, label: "1500" }, { year: 1600, label: "1600" }, { year: 1700, label: "1700" },
  { year: 1800, label: "1800" }, { year: 1900, label: "1900" }, { year: 2000, label: "2000" },
];

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
