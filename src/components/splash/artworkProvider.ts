// ============================================================
// Irth Opening Sequence — Artwork Provider
// ------------------------------------------------------------
// Loads /data/splash_artworks.json (v2). Each entry has a
// `file` and a `framing` that drives a different cinematic
// camera movement. Picks ONE at random per launch, avoiding
// the previously shown artwork. Only the chosen artwork is
// preloaded — never the whole gallery.
//
// Adding new artwork is a pure-data change: drop the file in
// /public/assets/splash/ and append an entry to the manifest.
// ============================================================

const STORAGE_LAST_ART = "irth.splash.lastArtwork.v1";

export type SplashFraming =
  | "zoom-in"
  | "zoom-out"
  | "pan-up"
  | "pan-down"
  | "pan-left"
  | "pan-right"
  | "reveal-tl"
  | "reveal-tr"
  | "reveal-bl"
  | "reveal-br"
  | "ken-burns";

interface ManifestEntry {
  file: string;
  framing?: SplashFraming;
}

let cache: ManifestEntry[] | null = null;

async function loadManifest(): Promise<ManifestEntry[]> {
  if (cache) return cache;
  try {
    const res = await fetch("/data/splash_artworks.json", { cache: "force-cache" });
    if (!res.ok) return (cache = []);
    const json = (await res.json()) as { artworks?: Array<string | ManifestEntry> };
    const raw = Array.isArray(json.artworks) ? json.artworks : [];
    cache = raw
      .map<ManifestEntry | null>((entry) =>
        typeof entry === "string"
          ? { file: entry, framing: "ken-burns" }
          : entry && typeof entry.file === "string"
          ? { file: entry.file, framing: entry.framing ?? "ken-burns" }
          : null,
      )
      .filter((e): e is ManifestEntry => e !== null);
    return cache;
  } catch {
    return (cache = []);
  }
}

export interface PickedArtwork {
  url: string | null;
  filename: string | null;
  framing: SplashFraming;
}

/** Pick a random artwork, avoiding the previous one. Returns null url if
 *  the manifest is empty — caller renders the elegant gradient fallback. */
export async function pickSplashArtwork(): Promise<PickedArtwork> {
  const list = await loadManifest();
  if (list.length === 0) return { url: null, filename: null, framing: "ken-burns" };

  let last: string | null = null;
  try { last = window.localStorage.getItem(STORAGE_LAST_ART); } catch { /* */ }

  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && pick.file === last) {
    const others = list.filter((f) => f.file !== last);
    pick = others[Math.floor(Math.random() * others.length)];
  }

  try { window.localStorage.setItem(STORAGE_LAST_ART, pick.file); } catch { /* */ }

  return {
    url: `/assets/splash/${pick.file}`,
    filename: pick.file,
    framing: pick.framing ?? "ken-burns",
  };
}

/** Preload a single image. Resolves with success flag; never rejects. */
export function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
