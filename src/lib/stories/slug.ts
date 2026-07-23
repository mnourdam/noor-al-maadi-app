// ============================================================
// Story slug helpers
// ------------------------------------------------------------
// Editors enter an Arabic title. We derive a readable Latin
// slug via a lightweight Arabic → Latin transliteration.
//
// Notes on strategy:
//  - This is transliteration (rasm), not translation. It is
//    deterministic, offline, and safe as a URL. It will not
//    produce fully idiomatic English (e.g. "رحلة" → "rhla"
//    rather than "journey"); that is acceptable — the slug is
//    only for URLs, and the editor can always overwrite it.
//  - Diacritics (harakat) are stripped before mapping.
//  - Stable Story IDs are generated separately (see suggestId)
//    so the canonical identifier never changes with the slug.
// ============================================================

const ARABIC_MAP: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ٱ": "a",
  "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh",
  "ر": "r", "ز": "z",
  "س": "s", "ش": "sh",
  "ص": "s", "ض": "d",
  "ط": "t", "ظ": "z",
  "ع": "a", "غ": "gh",
  "ف": "f", "ق": "q",
  "ك": "k", "ل": "l",
  "م": "m", "ن": "n",
  "ه": "h", "ة": "a",
  "و": "w", "ؤ": "w",
  "ي": "y", "ى": "a", "ئ": "y",
  "ء": "",
  // Persian / extended letters occasionally used in headlines
  "پ": "p", "چ": "ch", "ژ": "zh", "گ": "g", "ک": "k", "ی": "y",
};

// Common connective words: dropped from the slug for readability.
const STOP_WORDS = new Set([
  "al", "ala", "min", "ila", "fi", "an", "wa", "the", "and", "of", "to",
]);

const DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL_RE = /\u0640/g;

/** Convert an Arabic (or Latin-mixed) string into a URL slug candidate. */
export function suggestSlug(input: string): string {
  if (!input) return "";
  const stripped = input.normalize("NFKD").replace(DIACRITICS_RE, "").replace(TATWEEL_RE, "");
  let out = "";
  for (const ch of stripped) {
    if (ARABIC_MAP[ch] !== undefined) {
      out += ARABIC_MAP[ch];
      continue;
    }
    if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else if (/\s|[-_.,;:!؟?،—–/\\|'"()\[\]{}<>«»]/.test(ch)) {
      out += "-";
    }
    // silently drop unknown code points
  }
  const cleaned = out
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const words = cleaned.split("-").filter((w) => w && !STOP_WORDS.has(w));
  return words.join("-").slice(0, 60);
}

/** Suggest a stable story id from a title, always safe against the
 *  `^[a-z0-9_-]{3,80}$` constraint. */
export function suggestStoryId(title: string): string {
  const base = suggestSlug(title) || "story";
  const tail = Math.random().toString(36).slice(2, 6);
  const raw = `${base}-${tail}`.slice(0, 80);
  if (raw.length < 3) return `story-${tail}`;
  return raw;
}

/** Pick a unique slug given a set of already-taken ones. */
export function pickUniqueSlug(base: string, taken: Iterable<string>): string {
  const s = suggestSlug(base) || "story";
  const set = new Set(taken);
  if (!set.has(s)) return s;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${s}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${s}-${Date.now().toString(36)}`;
}
