// ============================================================
// Audio asset version + legacy purge
// ------------------------------------------------------------
// The Mongol/Mamluk recording (`mongols_mamluks.mp3`, ~1.69 MB) was
// permanently removed from the project. Deleting the file is not enough
// on installed builds: a WebView / Cache Storage copy could still be
// replayed. Every ambience request therefore carries an explicit asset
// version, and any previously cached audio response is purged on boot.
// ============================================================

/** Bump when an ambience recording is replaced or removed. */
export const AUDIO_ASSET_VERSION = 3;

/** Legacy filenames that must never be served again, from any layer. */
export const RETIRED_AUDIO_FILES: readonly string[] = ["mongols_mamluks"];

/** Append the asset version so a stale cached response is never reused. */
export function withAudioVersion(url: string): string {
  if (!url || /^(data|blob):/i.test(url)) return url;
  if (url.includes("av=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}av=${AUDIO_ASSET_VERSION}`;
}

function isRetired(url: string): boolean {
  return RETIRED_AUDIO_FILES.some((name) => url.includes(name));
}

/**
 * Remove every cached copy of a retired or unversioned ambience file from
 * Cache Storage, plus any localStorage metadata that references one.
 * Safe to call repeatedly; never throws.
 */
export async function purgeLegacyAudioCaches(): Promise<number> {
  let removed = 0;
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          const url = req.url;
          if (!url.includes("/audio/")) continue;
          const stale = isRetired(url) || !url.includes(`av=${AUDIO_ASSET_VERSION}`);
          if (stale) {
            await cache.delete(req);
            removed += 1;
          }
        }
      }
    }
  } catch {
    /* cache storage unavailable — nothing to purge */
  }

  try {
    if (typeof localStorage !== "undefined") {
      for (const key of Object.keys(localStorage)) {
        const value = key.includes("audio") ? localStorage.getItem(key) ?? "" : "";
        if (isRetired(key) || isRetired(value)) {
          localStorage.removeItem(key);
          removed += 1;
        }
      }
    }
  } catch {
    /* storage unavailable */
  }

  return removed;
}
