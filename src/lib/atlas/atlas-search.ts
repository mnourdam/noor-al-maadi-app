// Phase 3+ — Atlas search: Arabic normalization + fuzzy matching.
// Lightweight (no deps); intended for ≤ 2k atlas entities.
import type { AtlasEntityRow } from "@/lib/atlas-entities";

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/** Normalize Arabic + Latin for matching: strip diacritics, fold alefs, etc. */
export function normalizeArabic(input: string): string {
  if (!input) return "";
  let s = input.toString().toLowerCase().trim();
  s = s.normalize("NFKD").replace(DIACRITICS, "").replace(TATWEEL, "");
  // Latin diacritics
  s = s.replace(/[\u0300-\u036f]/g, "");
  // Alef forms → ا
  s = s.replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627");
  // ى → ي
  s = s.replace(/\u0649/g, "\u064A");
  // ة → ه
  s = s.replace(/\u0629/g, "\u0647");
  // ؤ → و ; ئ → ي
  s = s.replace(/\u0624/g, "\u0648").replace(/\u0626/g, "\u064A");
  // Remove hamza
  s = s.replace(/\u0621/g, "");
  // Collapse whitespace + strip punctuation
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Damerau-Levenshtein, capped at maxDist for speed. */
function editDistance(a: string, b: string, maxDist = 4): number {
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
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

export type AtlasSearchHit = {
  entity: AtlasEntityRow;
  score: number; // 0 = exact, higher = looser
  matchedField: string;
};

function entityHaystacks(e: AtlasEntityRow): string[] {
  const meta = (e.metadata ?? {}) as { aliases?: unknown; alias?: unknown };
  const aliases: string[] = [];
  const a = meta.aliases ?? meta.alias;
  if (Array.isArray(a)) for (const v of a) if (typeof v === "string") aliases.push(v);
  return [
    e.name_ar,
    e.name_en ?? "",
    e.slug,
    e.id,
    ...aliases,
  ].filter(Boolean);
}

/**
 * Rank entities by relevance to `query`. Empty query → []. Returns sorted by
 * ascending score; exact matches always come first.
 */
export function searchAtlasEntities(
  entities: AtlasEntityRow[],
  query: string,
  limit = 8,
): AtlasSearchHit[] {
  const q = normalizeArabic(query);
  if (!q) return [];
  const hits: AtlasSearchHit[] = [];
  for (const e of entities) {
    let best: { score: number; field: string } | null = null;
    for (const raw of entityHaystacks(e)) {
      const h = normalizeArabic(raw);
      if (!h) continue;
      let s: number;
      if (h === q) s = 0;
      else if (h.startsWith(q)) s = 0.5;
      else if (h.includes(q)) s = 1;
      else {
        // fuzzy: token-level distance against the whole haystack
        const dist = editDistance(h, q, Math.min(4, Math.max(1, Math.floor(q.length / 3))));
        if (dist > 4) continue;
        s = 2 + dist;
      }
      if (!best || s < best.score) best = { score: s, field: raw };
      if (s === 0) break;
    }
    if (best) hits.push({ entity: e, score: best.score, matchedField: best.field });
  }
  hits.sort((a, b) => a.score - b.score || a.entity.name_ar.localeCompare(b.entity.name_ar, "ar"));
  return hits.slice(0, limit);
}

export function pickBestAtlasMatch(
  entities: AtlasEntityRow[],
  query: string,
): { exact: AtlasSearchHit | null; suggestions: AtlasSearchHit[] } {
  const hits = searchAtlasEntities(entities, query, 6);
  const exact = hits.length > 0 && hits[0].score <= 1 ? hits[0] : null;
  return { exact, suggestions: exact ? [] : hits };
}
