// ============================================================
// Typography helpers for the story player.
// Phase 4 refinement:
//   * protectWidow — lightweight Arabic widow protection. Binds
//     the last short word of a sentence to its predecessor with a
//     non-breaking space so a paragraph never ends with a lonely
//     "كلمة" on its own line. Idempotent, no-op for long tails.
//   * computeVerticalLift — deterministic vertical rebalance for
//     bottom-anchored scenes. Sparse text floats slightly higher
//     so it never feels glued to the bottom of the artwork.
// ============================================================

/** Bind the last short word of a sentence to its predecessor with NBSP. */
export function protectWidow(s: string): string {
  if (!s) return s;
  const trimmed = s.trimEnd();
  const idx = trimmed.lastIndexOf(" ");
  if (idx <= 0) return s;
  const last = trimmed.slice(idx + 1);
  // Only tie short trailing tokens (typical Arabic widow: 2–7 chars,
  // often a preposition + noun like "في القلب"). Long trailing words
  // are fine on their own line.
  if (last.length === 0 || last.length > 7) return s;
  return trimmed.slice(0, idx) + "\u00A0" + last;
}

/** Apply widow protection to every sentence in an array. */
export function protectWidows(sentences: string[]): string[] {
  return sentences.map(protectWidow);
}

/**
 * Bottom-anchored scenes (A/B/E) can look glued to the bottom when
 * they carry only one or two short sentences. Return an extra bottom
 * padding (as a CSS length) that lifts the content upward for sparse
 * text and leaves dense text where it is.
 */
export function computeVerticalLift(sentenceCount: number): string {
  if (sentenceCount <= 1) return "10vh";
  if (sentenceCount === 2) return "6vh";
  if (sentenceCount === 3) return "3vh";
  return "0px";
}
