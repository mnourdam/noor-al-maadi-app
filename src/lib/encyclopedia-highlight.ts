// Arabic-aware text highlighting for Encyclopedia search.
// Normalizes diacritics + variant letters for matching, but returns
// original-text index ranges so we can render the original characters
// with the matched portion wrapped.

export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

// Per-character normalization with index mapping. Each output char maps
// back to the original index it came from. Diacritics map to "" (skipped).
function buildNormMap(original: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    const code = ch.charCodeAt(0);
    // Arabic diacritics range — skip entirely.
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670) continue;
    let mapped = ch.toLowerCase();
    if ("إأآا".includes(mapped)) mapped = "ا";
    else if (mapped === "ى") mapped = "ي";
    else if (mapped === "ة") mapped = "ه";
    norm += mapped;
    map.push(i);
  }
  return { norm, map };
}

export type HighlightRange = { start: number; end: number };

/** Find all non-overlapping matches of `query` inside `text` (Arabic-normalized). */
export function findHighlightRanges(text: string, query: string): HighlightRange[] {
  if (!text || !query) return [];
  const nq = normalizeArabic(query);
  if (!nq) return [];
  const { norm, map } = buildNormMap(text);
  if (!norm) return [];
  const out: HighlightRange[] = [];
  let from = 0;
  while (from <= norm.length - nq.length) {
    const idx = norm.indexOf(nq, from);
    if (idx === -1) break;
    const start = map[idx];
    const lastNormIdx = idx + nq.length - 1;
    const end = map[lastNormIdx] + 1; // exclusive
    out.push({ start, end });
    from = idx + nq.length;
  }
  return out;
}
