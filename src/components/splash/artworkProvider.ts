// ============================================================
// Irth Opening Sequence — Artwork Provider
// ------------------------------------------------------------
// Loads /data/splash_artworks.json which lists the filenames
// available under /assets/splash/. Picks ONE at random per
// launch, avoiding the previously shown artwork. Only the
// chosen artwork is preloaded — never the whole gallery.
//
// Adding new artwork (Ramadan, Andalus, Ottoman, etc.) is a
// pure-data change: drop the file in /public/assets/splash/
// and append its filename to splash_artworks.json. No code.
// ============================================================

const STORAGE_LAST_ART = "irth.splash.lastArtwork.v1";

let cache: string[] | null = null;

async function loadManifest(): Promise<string[]> {
  if (cache) return cache;
  try {
    const res = await fetch("/data/splash_artworks.json", { cache: "force-cache" });
    if (!res.ok) return (cache = []);
    const json = (await res.json()) as { artworks?: string[] };
    cache = Array.isArray(json.artworks) ? json.artworks.filter(Boolean) : [];
    return cache;
  } catch {
    return (cache = []);
  }
}

export interface PickedArtwork {
  url: string | null;
  filename: string | null;
}

/** Pick a random artwork URL, avoiding the previous one. Returns nulls if
 *  the manifest is empty — caller renders the elegant gradient fallback. */
export async function pickSplashArtwork(): Promise<PickedArtwork> {
  const list = await loadManifest();
  if (list.length === 0) return { url: null, filename: null };

  let last: string | null = null;
  try { last = window.localStorage.getItem(STORAGE_LAST_ART); } catch { /* */ }

  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && pick === last) {
    const others = list.filter((f) => f !== last);
    pick = others[Math.floor(Math.random() * others.length)];
  }

  try { window.localStorage.setItem(STORAGE_LAST_ART, pick); } catch { /* */ }

  return { url: `/assets/splash/${pick}`, filename: pick };
}

/** Preload a single image and resolve when ready (or on error). */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}
