// Hero image pool — drop new files into `src/assets/hero/` and they are
// automatically picked up by the carousel. No code change required.
//
// `pickHeroImages(n)` returns `n` random URLs from the pool, preferring
// images the user hasn't seen in the last few launches. Selection is
// client-only to avoid SSR/CSR hydration mismatches.

const modules = import.meta.glob(
  "@/assets/hero/*.{jpg,jpeg,webp,png}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

export const HERO_POOL: string[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const HIST_KEY = "irth.hero.recent.v1";
const HIST_MAX = 8;

function loadHistory(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(HIST_KEY) : null;
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]).filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(h: string[]) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-HIST_MAX)));
  } catch {
    /* ignore */
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick `count` random hero image URLs, avoiding recently shown ones. */
export function pickHeroImages(count = 3): string[] {
  if (HERO_POOL.length === 0) return [];
  const n = Math.min(count, HERO_POOL.length);
  const history = new Set(loadHistory());
  const fresh = HERO_POOL.filter((u) => !history.has(u));
  // If we don't have enough unseen images, fall back to the full pool.
  const base = fresh.length >= n ? fresh : HERO_POOL.slice();
  const picked = shuffle(base).slice(0, n);
  saveHistory([...loadHistory(), ...picked]);
  return picked;
}

/** Deterministic initial value used during SSR / first paint to avoid
 *  hydration mismatches. Replaced by `pickHeroImages` after mount. */
export function defaultHeroImages(count = 3): string[] {
  return HERO_POOL.slice(0, Math.min(count, HERO_POOL.length));
}
