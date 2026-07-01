// Atlas search: Arabic normalization + weighted ranking, mirroring the
// enhanced Encyclopedia search behavior (hamza tolerance, diacritics,
// tatweel, alias/slug matching, partial/contains).
import { isLc1VisibleAtlasKind, type AtlasEntityRow, type AtlasEntityKind } from "@/lib/atlas-entities";

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/** Normalize Arabic + Latin for matching. */
export function normalizeArabic(input: string): string {
  if (!input) return "";
  let s = input.toString().toLowerCase().trim();
  s = s.normalize("NFKD").replace(DIACRITICS, "").replace(TATWEEL, "");
  s = s.replace(/[\u0300-\u036f]/g, "");
  // Alef forms → ا
  s = s.replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627");
  // ى → ي
  s = s.replace(/\u0649/g, "\u064A");
  // ة → ه
  s = s.replace(/\u0629/g, "\u0647");
  // ؤ → و ; ئ → ي
  s = s.replace(/\u0624/g, "\u0648").replace(/\u0626/g, "\u064A");
  // Strip standalone hamza
  s = s.replace(/\u0621/g, "");
  // Punctuation → space
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Damerau-Levenshtein, capped at maxDist for speed. */
function editDistance(a: string, b: string, maxDist = 3): number {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  const prev = new Array(lb + 1);
  const curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

export type AtlasSearchHit = {
  entity: AtlasEntityRow;
  score: number; // lower = better
  matchedField: string;
};

function aliasesOf(e: AtlasEntityRow): string[] {
  const meta = (e.metadata ?? {}) as { aliases?: unknown; alias?: unknown };
  const a = meta.aliases ?? meta.alias;
  const out: string[] = [];
  if (Array.isArray(a)) for (const v of a) if (typeof v === "string") out.push(v);
  return out;
}

/**
 * Score a single entity vs. a normalized query. Lower = better.
 *   0.0   exact title match
 *   0.4   startsWith on title
 *   0.7   contains on title
 *   1.1   startsWith on name_en
 *   1.4   contains on name_en
 *   1.6   alias exact / startsWith
 *   1.9   alias contains
 *   2.2   slug contains
 *   2.6+  fuzzy (edit distance)
 * Returns null when there's no reasonable match.
 */
function scoreEntity(e: AtlasEntityRow, nq: string): { score: number; field: string } | null {
  const title = normalizeArabic(e.name_ar);
  const en = normalizeArabic(e.name_en ?? "");
  const slug = normalizeArabic(e.slug);
  const aliases = aliasesOf(e).map(normalizeArabic);

  if (title === nq) return { score: 0, field: e.name_ar };
  if (title.startsWith(nq)) return { score: 0.4, field: e.name_ar };
  if (title.includes(nq))   return { score: 0.7, field: e.name_ar };

  if (en) {
    if (en === nq) return { score: 1.0, field: e.name_en ?? "" };
    if (en.startsWith(nq)) return { score: 1.1, field: e.name_en ?? "" };
    if (en.includes(nq))   return { score: 1.4, field: e.name_en ?? "" };
  }

  for (const a of aliases) {
    if (!a) continue;
    if (a === nq || a.startsWith(nq)) return { score: 1.6, field: a };
    if (a.includes(nq))                return { score: 1.9, field: a };
  }

  if (slug && slug.replace(/-/g, " ").includes(nq)) {
    return { score: 2.2, field: e.slug };
  }

  // Fuzzy against title (cheap; skip if lengths diverge too much)
  const maxDist = Math.min(3, Math.max(1, Math.floor(nq.length / 4)));
  const d = editDistance(title, nq, maxDist);
  if (d <= maxDist) return { score: 2.6 + d * 0.4, field: e.name_ar };

  return null;
}

/**
 * Rank entities by relevance. Empty query → []. Length-based tiebreaker so
 * shorter titles (e.g. "دمشق") beat longer ones with the same score.
 */
export function searchAtlasEntities(
  entities: AtlasEntityRow[],
  query: string,
  limit = 8,
): AtlasSearchHit[] {
  const nq = normalizeArabic(query);
  if (!nq) return [];
  const hits: AtlasSearchHit[] = [];
  for (const e of entities) {
    const s = scoreEntity(e, nq);
    if (!s) continue;
    hits.push({ entity: e, score: s.score, matchedField: s.field });
  }
  hits.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const la = a.entity.name_ar.length, lb = b.entity.name_ar.length;
    if (la !== lb) return la - lb;
    return a.entity.name_ar.localeCompare(b.entity.name_ar, "ar");
  });
  return hits.slice(0, limit);
}

export function pickBestAtlasMatch(
  entities: AtlasEntityRow[],
  query: string,
): { exact: AtlasSearchHit | null; suggestions: AtlasSearchHit[] } {
  const hits = searchAtlasEntities(entities, query, 6);
  // Treat a clear top match (score ≤ 0.4 and comfortably better than #2) as exact.
  let exact: AtlasSearchHit | null = null;
  if (hits.length > 0 && hits[0].score <= 0.4) {
    if (hits.length === 1 || hits[1].score - hits[0].score >= 0.3) exact = hits[0];
  }
  return { exact, suggestions: exact ? [] : hits };
}

/** Comfortable, type-aware zoom target so we never over-frame approximate
 *  locations. Higher = closer. */
export function zoomForKind(kind: AtlasEntityKind): number {
  switch (kind) {
    case "region":         return 2.2;
    case "place":          return 3.5;
    case "battle":         return 4.5;
    case "event":          return 4.5;
    case "artifact_site":  return 4;
    case "figure_marker":  return 4;
    case "route_point":    return 4;
    default:               return 3.5;
  }
}
