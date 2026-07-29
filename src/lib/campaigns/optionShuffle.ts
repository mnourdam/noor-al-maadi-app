// ============================================================
// Campaign MCQ — runtime option shuffling
// ------------------------------------------------------------
// Authored JSON very often lists the correct answer first, which makes
// every multiple-choice activity trivially guessable. We therefore
// build a RUNTIME-ONLY permutation of the options at render time.
//
// Contract:
//   • The authored activity object / JSON is NEVER mutated or written
//     back — only a derived array is produced.
//   • The order is DETERMINISTIC for a given (activity, attempt), so it
//     is stable across re-renders and across re-opening the same
//     activity within the same play session.
//   • A new attempt (new app session / fresh chapter run) gets a new
//     salt, so the order can differ next time.
//   • Correctness is remapped inside the runtime copy; the authored
//     `correctAnswer` index is untouched.
// ============================================================

/** Per-session salt: stable while the app is open, new on each launch. */
const SESSION_SALT: string = (() => {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
})();

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ShuffledOptions {
  /** Runtime copy of the option labels, in display order. */
  options: string[];
  /** Index of the correct answer WITHIN `options`. */
  correctIndex: number;
  /** display index → original authored index. */
  toOriginal: number[];
}

export function shuffleOptions(
  activityId: string,
  options: string[],
  correctIndex: number,
  attemptKey: string | number = 0,
): ShuffledOptions {
  const n = options.length;
  if (n < 2) return { options: [...options], correctIndex, toOriginal: options.map((_, i) => i) };

  const next = rng(hash32(`${SESSION_SALT}|${activityId}|${attemptKey}`));
  const idx = options.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }

  return {
    options: idx.map(i => options[i]),
    correctIndex: idx.indexOf(correctIndex),
    toOriginal: idx,
  };
}
