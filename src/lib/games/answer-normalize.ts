// Phase 2d — Canonical Arabic-tolerant answer matching for gameplay.
//
// Design goals
// ────────────
// 1. One canonical place for game answer normalization so hint / reveal
//    / validation / completion never disagree.
// 2. Deterministic, non-fuzzy: NO Levenshtein, NO substring "contains",
//    NO silent removal of the definite article. Only tolerate common
//    Arabic orthographic variation.
// 3. Grid-safe: exposes a per-CHARACTER "letter class" so per-cell
//    validation and intersection integrity keep working without ever
//    rewriting the authored answer.
// 4. Reusable, but game-specific: this file DOES NOT touch the
//    encyclopedia normalizer (`normalizeArabicName`) which is more
//    aggressive (strips leading "ال", drops all hamza, strips battle
//    prefixes). Reusing that here would produce false positives.
//
// Nothing in this file mutates stored content. The authored spelling
// remains sacred — normalization only produces comparison keys.

// ── Character sets ─────────────────────────────────────────────

/** All Arabic combining marks (harakat) + tatweel + hamza-above/below. */
const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** Zero-width joiners / non-joiners / mark. Safe to strip everywhere. */
const AR_ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Simple punctuation set the matcher ignores. Never removes letters. */
const AR_PUNCT = /[\u060C\u061B\u061F\u066A-\u066D.,;:!?"'`()[\]{}«»""'']/g;

// ── Digit folding ──────────────────────────────────────────────
// Arabic-Indic (\u0660-\u0669) and Extended (\u06F0-\u06F9) → Western.
const ARABIC_INDIC = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
const EXT_ARABIC   = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
function foldDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    const b = EXT_ARABIC.indexOf(ch);
    if (b >= 0) { out += String(b); continue; }
    out += ch;
  }
  return out;
}

// ── Per-character canonical class ──────────────────────────────
//
// This is the ONLY normalization used for per-cell crossword
// validation. Every entry maps to a single canonical letter so
// the grid keeps its cell count and the authored spelling is
// never rewritten.
//
// Explicitly TOLERATED variations (all documented in the phase spec):
//   • أ / إ / آ / ٱ  → ا
//   • ة              → ه       (bidirectional at match time)
//   • ى              → ي
//   • ؤ              → و
//   • ئ              → ي
//   • harakat, tatweel → dropped
//
// Explicitly NOT tolerated (would cause false positives such as
// علم ≠ عالم, دين ≠ مدين):
//   • no letter deletion beyond marks (long alif ا is kept, hamza
//     seat variations only fold to their base letter, standalone
//     hamza ء remains distinct)
//   • no substring / edit-distance acceptance
//   • no removal of definite article
//
// Returns "" for a character that should be skipped (harakat,
// tatweel, whitespace, zero-width). Callers use that to detect
// "no cell input" without inventing new letters.
export function letterClass(ch: string): string {
  if (!ch) return "";
  const code = ch.codePointAt(0) ?? 0;

  // Combining marks + tatweel → skipped.
  if (
    (code >= 0x0610 && code <= 0x061A)
    || (code >= 0x064B && code <= 0x065F)
    || code === 0x0670
    || (code >= 0x06D6 && code <= 0x06ED)
    || code === 0x0640
  ) return "";

  // Zero-width formatting / whitespace.
  if (code === 0x200B || code === 0x200C || code === 0x200D || code === 0x200E || code === 0x200F) return "";
  if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") return "";

  // Alif family.
  if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") return "ا";
  // Ya / alif-maqsura.
  if (ch === "ى") return "ي";
  // Ta-marbuta ↔ ha tolerance (single canonical bucket, "ه").
  if (ch === "ة") return "ه";
  // Waw-hamza / ya-hamza — orthographic variations of و / ي.
  if (ch === "ؤ") return "و";
  if (ch === "ئ") return "ي";

  // Arabic digits → Western so digit-bearing answers compare.
  const folded = foldDigits(ch);
  if (folded !== ch) return folded.toLowerCase();

  // ASCII letters → lowercased.
  if (code >= 0x41 && code <= 0x5A) return ch.toLowerCase();
  return ch;
}

// ── Options for the word-level normalizer ─────────────────────

export interface AnswerNormalizeOptions {
  /**
   * Fold ة ↔ ه. Default true — matches the letter-class table above
   * and the Phase 2d requirements (فاطمة = فاطمه, مدينة = مدينه).
   */
  foldTaMarbuta?: boolean;
  /**
   * Strip a leading "ال" ONLY when explicitly enabled per answer.
   * Default false. Never do this globally — it would collapse
   * ملك / مالك style pairs into each other for content that
   * happens to start with ال.
   */
  stripDefiniteArticle?: boolean;
  /**
   * Ignore simple punctuation (commas, question marks, brackets,
   * quotes). Default true. Never removes letters or spaces.
   */
  stripPunctuation?: boolean;
  /**
   * Collapse internal whitespace to a single space and trim.
   * Default true.
   */
  collapseSpaces?: boolean;
}

const DEFAULTS: Required<AnswerNormalizeOptions> = {
  foldTaMarbuta: true,
  stripDefiniteArticle: false,
  stripPunctuation: true,
  collapseSpaces: true,
};

/**
 * Canonical game-answer normalizer. Deterministic, non-fuzzy,
 * safe to run on both the expected answer and the player's entry.
 *
 * Never rewrites input; always returns a comparison key.
 */
export function normalizeArabicGameAnswer(
  value: string,
  options: AnswerNormalizeOptions = {},
): string {
  const opts = { ...DEFAULTS, ...options };
  if (!value) return "";

  let s = value;

  // 1. Strip zero-width + harakat + tatweel.
  s = s.replace(AR_ZERO_WIDTH, "").replace(AR_DIACRITICS, "");

  // 2. Fold digits + letter classes character-by-character. Uses
  //    the same table as `letterClass` so per-cell validation and
  //    word validation stay in sync.
  let out = "";
  for (const ch of s) {
    const mapped = letterClass(ch);
    // letterClass returns "" for whitespace; preserve spacing at
    // this layer by re-adding a real space so word boundaries live
    // on into the next step.
    if (mapped === "" && (ch === " " || ch === "\t" || ch === "\n" || ch === "\r")) {
      out += " ";
    } else {
      out += mapped;
    }
  }
  s = out;

  // 3. Optional punctuation strip.
  if (opts.stripPunctuation) s = s.replace(AR_PUNCT, " ");

  // 4. Space normalization.
  if (opts.collapseSpaces) s = s.replace(/\s+/g, " ").trim();

  // 5. Definite article — ONLY when explicitly requested per-answer.
  //    Guard length so "ال" itself is not stripped.
  if (opts.stripDefiniteArticle && s.startsWith("ال") && s.length > 3) {
    s = s.slice(2);
  }

  return s.toLowerCase();
}

/**
 * Build the set of accepted comparison keys for a stored answer plus
 * any authored aliases. Used by word-level validation (word mode,
 * paste, keyboard submission). Empty strings are dropped so an
 * accidental "" alias never accepts an empty guess.
 */
export function acceptedAnswerForms(
  canonical: string,
  aliases: readonly string[] = [],
  options: AnswerNormalizeOptions = {},
): Set<string> {
  const set = new Set<string>();
  const add = (v: string) => {
    const n = normalizeArabicGameAnswer(v, options);
    if (n) set.add(n);
  };
  add(canonical);
  for (const a of aliases) add(a);
  return set;
}

/**
 * True iff `guess` matches the canonical answer or any declared alias
 * under the tolerant rules. Deterministic exact-match (not substring).
 */
export function isAcceptedAnswer(
  guess: string,
  canonical: string,
  aliases: readonly string[] = [],
  options: AnswerNormalizeOptions = {},
): boolean {
  const g = normalizeArabicGameAnswer(guess, options);
  if (!g) return false;
  const forms = acceptedAnswerForms(canonical, aliases, options);
  return forms.has(g);
}

/**
 * Per-cell equality for the crossword grid. Uses the same letter
 * class table so a player who types أذان into cells authored as
 * اذان (or vice-versa) is accepted, without ever changing the
 * displayed / revealed spelling.
 */
export function cellsEqual(expected: string, entered: string): boolean {
  return letterClass(expected) === letterClass(entered);
}
