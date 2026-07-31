// ============================================================
// World mini-timeline source — historical span authority.
//
// Previous behaviour (audited): the world page took `sections.event`
// (every Event entity whose `metadata.era` mapped to the world), kept
// the rows carrying `timeline_year` / `timeline_start_year`, sorted them
// ascending, and sampled up to 6 evenly-spaced points. There was no
// historical bound: a mis-tagged or out-of-period entity landed straight
// on the timeline, and the label heuristic (`y > 622 ? "م" : "هـ"`)
// mislabelled every pre-622 Gregorian year as Hijri.
//
// New behaviour: each public world declares its real historical span.
// Only dated entities that actually fall inside that span (with a small
// tolerance for prelude/aftermath events) are eligible, battles count as
// chronological anchors too, duplicates per year are collapsed, and the
// years are labelled as Gregorian because `timeline_year` is Gregorian.
// ============================================================

export type WorldSpan = { start: number; end: number };

/** Gregorian span of every playable world. Authoritative, not data-derived. */
export const WORLD_SPAN: Record<string, WorldSpan> = {
  prophetic: { start: 570, end: 632 },
  rashidun: { start: 632, end: 661 },
  umayyad: { start: 661, end: 750 },
  andalus: { start: 711, end: 1492 },
  abbasid: { start: 750, end: 1258 },
  seljuk: { start: 1037, end: 1194 },
  zengid: { start: 1127, end: 1250 },
  "ayyubid-state": { start: 1171, end: 1260 },
  "mamluk-sultanate": { start: 1250, end: 1517 },
  ottoman: { start: 1299, end: 1924 },
};

/** Years just outside the span still make sense as prelude / aftermath. */
const TOLERANCE = 15;

export function worldSpan(slug: string): WorldSpan | null {
  return WORLD_SPAN[slug] ?? null;
}

export function isYearInWorld(slug: string, year: number): boolean {
  const span = worldSpan(slug);
  if (!span) return true; // unknown world → never filter data away
  return year >= span.start - TOLERANCE && year <= span.end + TOLERANCE;
}

/** `timeline_year` is Gregorian across the encyclopedia. */
export function gregorianYearLabel(year: number): string {
  return `${year}م`;
}

type Dated<T> = { node: T; year: number };

/**
 * Select the timeline points for a world: in-span, deduplicated per year,
 * chronologically ordered, and evenly sampled across the whole arc.
 */
export function selectWorldTimeline<T>(
  nodes: T[],
  worldSlug: string,
  yearOf: (node: T) => number | null,
  max = 6,
): Dated<T>[] {
  const dated: Dated<T>[] = [];
  const seenYears = new Set<number>();
  for (const node of nodes) {
    const y = yearOf(node);
    if (y == null || !Number.isFinite(y)) continue;
    if (!isYearInWorld(worldSlug, y)) continue;
    dated.push({ node, year: y });
  }
  dated.sort((a, b) => a.year - b.year);

  const unique = dated.filter((d) => {
    if (seenYears.has(d.year)) return false;
    seenYears.add(d.year);
    return true;
  });

  if (unique.length <= max) return unique;
  const picks: Dated<T>[] = [];
  for (let i = 0; i < max; i++) {
    picks.push(unique[Math.round((i * (unique.length - 1)) / (max - 1))]);
  }
  return picks;
}
