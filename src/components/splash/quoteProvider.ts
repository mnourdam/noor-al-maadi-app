// ============================================================
// Irth Opening Sequence — Quote Provider
// ------------------------------------------------------------
// Loads /data/splash_quotes.json (externalized, hot-extensible),
// returns ONE quote per launch and avoids repeating the previous
// one via localStorage. Hundreds of quotes can be added without
// any code change — just edit the JSON.
// ============================================================

export interface SplashQuote {
  text: string;
  author: string;
}

const STORAGE_LAST_QUOTE = "irth.splash.lastQuoteIdx.v1";

let cache: SplashQuote[] | null = null;

async function loadQuotes(): Promise<SplashQuote[]> {
  if (cache) return cache;
  try {
    const res = await fetch("/data/splash_quotes.json", { cache: "force-cache" });
    if (!res.ok) return [];
    const json = (await res.json()) as SplashQuote[] | { quotes?: SplashQuote[] };
    const list = Array.isArray(json) ? json : Array.isArray(json.quotes) ? json.quotes : [];
    cache = list.filter((q) => q && typeof q.text === "string" && typeof q.author === "string");
    return cache;
  } catch {
    return [];
  }
}

const FALLBACK: SplashQuote = {
  text: "التاريخ ذاكرة الأمم.",
  author: "حكمة",
};

/** Pick a random quote, avoiding the previously shown index. */
export async function pickSplashQuote(): Promise<SplashQuote> {
  const list = await loadQuotes();
  if (list.length === 0) return FALLBACK;
  if (list.length === 1) return list[0];

  let last = -1;
  try {
    const raw = window.localStorage.getItem(STORAGE_LAST_QUOTE);
    if (raw) last = parseInt(raw, 10);
  } catch { /* ignore */ }

  let idx = Math.floor(Math.random() * list.length);
  if (idx === last) idx = (idx + 1) % list.length;

  try { window.localStorage.setItem(STORAGE_LAST_QUOTE, String(idx)); } catch { /* ignore */ }
  return list[idx];
}
