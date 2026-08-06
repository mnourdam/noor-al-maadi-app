/**
 * Remote-image cache for offline-first playback.
 *
 * Strategy:
 *   - Use the browser Cache Storage API (`caches.open('irth-images-v1')`)
 *     to persist image bytes across sessions. This works in modern browsers
 *     and inside the Capacitor Android WebView.
 *   - Cache-first: return the cached blob URL if present; otherwise fetch
 *     from network, store in the cache, and return the fresh URL.
 *   - When offline and not cached, return `null` so callers can render a
 *     graceful placeholder instead of a broken thumbnail.
 *   - Cross-origin fetches use `no-cors` mode when needed so the response
 *     can be stored even without CORS headers (opaque responses are fine
 *     for `<img>` display).
 *
 * Public entry points:
 *   - `resolveImageUrl(url)` — async, returns a usable URL string (either
 *     the original if online-cached in HTTP, or an object URL from Cache
 *     Storage, or the original URL as a last resort).
 *   - `prefetchImages(urls)` — background warm-up used by the offline
 *     bootstrap to cache every image referenced by the snapshot.
 *   - `useCachedImageSrc(url)` — React hook.
 */

const CACHE_NAME = "irth-images-v1";
/** Cap prefetch to avoid hammering the network on a fresh install. */
const PREFETCH_CONCURRENCY = 6;
const PREFETCH_RETRY_LIMIT = 2;
const prefetchInProgress = new Set<string>();

/** Ignore obvious non-images (audio, video, JSON, etc.). */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?)(\?.*)?$/i;

function hasCaches(): boolean {
  try { return typeof caches !== "undefined"; } catch { return false; }
}

function isLikelyImage(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("data:image/") || url.startsWith("blob:")) return false;
  // If it's a Supabase storage URL, it's definitely an image we want to cache.
  if (/\/storage\/v1\/object\//.test(url)) return true;
  return IMAGE_EXT.test(url);
}

/** 
 * Extract a stable cache key from a Supabase storage URL.
 * Converts: https://.../storage/v1/object/public/bucket/path/to/img.png?token=...
 * To: irth://storage/bucket/path/to/img.png
 */
export function getStableStorageKey(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^\/?]+)\/([^?]+)/);
  if (match) {
    const [, bucket, path] = match;
    return `irth://storage/${bucket}/${path}`;
  }
  return null;
}

async function openCache(): Promise<Cache | null> {
  if (!hasCaches()) return null;
  try { return await caches.open(CACHE_NAME); } catch { return null; }
}

async function toObjectUrl(response: Response): Promise<string | null> {
  try {
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;
    return URL.createObjectURL(blob);
  } catch { return null; }
}

/** Try to fetch + store an image. Uses `no-cors` for cross-origin.
 *  `cacheKey` lets callers store transient URLs (e.g. signed storage URLs
 *  whose token rotates every hour) under a STABLE key. */
async function fetchAndCache(url: string, cache: Cache, cacheKey: string = url): Promise<Response | null> {
  const sameOrigin = (() => {
    try {
      if (typeof window === "undefined") return true;
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch { return false; }
  })();
  try {
    const init: RequestInit = sameOrigin ? {} : { mode: "no-cors", credentials: "omit" };
    const res = await fetch(url, init);
    // `no-cors` yields an opaque response (status 0); still cacheable.
    if (!res || (res.status !== 0 && !res.ok)) return null;
    try { await cache.put(cacheKey, res.clone()); } catch { /* quota / opaque limits */ }
    return res;
  } catch { return null; }
}

/**
 * Cache-first resolve for images whose fetch URL is transient (signed
 * storage URLs). The bytes are stored under the caller's stable
 * `cacheKey`, so a rotated token still hits the same cache entry and
 * offline playback keeps working.
 */
export async function resolveKeyedImageUrl(
  cacheKey: string,
  getFetchUrl: () => Promise<string | null>,
): Promise<string | null> {
  if (!cacheKey) return null;
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const obj = await toObjectUrl(hit);
        if (obj) return obj;
      }
    } catch { /* fall through */ }
  }
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return null;
  const url = await getFetchUrl();
  if (!url) return null;
  if (!cache) return url;
  const fresh = await fetchAndCache(url, cache, cacheKey);
  if (!fresh) return url;
  const obj = await toObjectUrl(fresh);
  return obj ?? url;
}

/**
 * Background warm-up for keyed entries. Each entry resolves its fetch URL
 * lazily, so signing only happens for objects that are not cached yet.
 */
export async function prefetchKeyedImages(
  entries: Iterable<{ key: string; getUrl: () => Promise<string | null> }>,
): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return;

  const list: { key: string; getUrl: () => Promise<string | null> }[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e?.key || seen.has(e.key)) continue;
    seen.add(e.key);
    try {
      const already = await cache.match(e.key);
      if (!already) list.push(e);
    } catch { list.push(e); }
  }

  let i = 0;
  async function worker() {
    while (i < list.length) {
      const e = list[i++];
      try {
        const url = await e.getUrl();
        if (url) await fetchAndCache(url, cache!, e.key);
      } catch { /* ignore */ }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, list.length) }, () => worker()),
  );
}


/**
 * Return a usable image URL. Cache-first; falls back to network when online.
 * Returns `null` when the URL is not cached and the app is offline.
 */
export async function resolveImageUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const obj = await toObjectUrl(hit);
        if (obj) return obj;
      }
    } catch { /* fall through */ }
  }
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return null;
  if (!cache) return url;
  const fresh = await fetchAndCache(url, cache);
  if (!fresh) return url; // last-resort: let the browser try directly
  const obj = await toObjectUrl(fresh);
  return obj ?? url;
}

/** Background: warm the cache with a set of image URLs. */
export async function prefetchImages(urls: Iterable<string>): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return;

  const list: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    if (!u || typeof u !== "string") continue;
    if (!isLikelyImage(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    try {
      const already = await cache.match(u);
      if (!already) list.push(u);
    } catch { list.push(u); }
  }

  let i = 0;
  async function worker() {
    while (i < list.length) {
      const u = list[i++];
      if (!u || prefetchInProgress.has(u)) continue;
      
      prefetchInProgress.add(u);
      let retries = 0;
      while (retries <= PREFETCH_RETRY_LIMIT) {
        try {
          const res = await fetchAndCache(u, cache!);
          if (res) break;
        } catch { /* ignore */ }
        retries++;
        if (retries <= PREFETCH_RETRY_LIMIT) await new Promise(r => setTimeout(r, 1000 * retries));
      }
      prefetchInProgress.delete(u);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, list.length) }, () => worker()),
  );

}

/** Recursively collect image-looking string values from an object. */
export function collectImageUrls(root: unknown, out: Set<string> = new Set()): Set<string> {
  const stack: unknown[] = [root];
  const IMAGE_KEY = /(image|cover|thumb|thumbnail|avatar|hero|photo|picture|artwork|banner|icon)/i;

  while (stack.length) {
    const node = stack.pop();
    if (node == null) continue;
    if (typeof node === "string") {
      if (isLikelyImage(node) && /^https?:\/\//i.test(node)) out.add(node);
      continue;
    }
    if (Array.isArray(node)) { for (const v of node) stack.push(v); continue; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === "string") {
          if ((IMAGE_KEY.test(k) || isLikelyImage(v)) && /^https?:\/\//i.test(v)) out.add(v);
        } else {
          stack.push(v);
        }
      }
    }
  }
  return out;
}

/** React hook — returns the cached/object URL for an image, or `null` while resolving. */
import { useEffect, useState } from "react";
export function useCachedImageSrc(url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(url && (url.startsWith("data:") || url.startsWith("blob:")) ? url : null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    if (!url) { setSrc(null); return; }
    if (url.startsWith("data:") || url.startsWith("blob:")) { setSrc(url); return; }
    (async () => {
      const resolved = await resolveImageUrl(url);
      if (!alive) { if (resolved && resolved.startsWith("blob:")) URL.revokeObjectURL(resolved); return; }
      if (resolved && resolved.startsWith("blob:")) created = resolved;
      setSrc(resolved);
    })();
    return () => {
      alive = false;
      if (created) { try { URL.revokeObjectURL(created); } catch { /* ignore */ } }
    };
  }, [url]);
  return src;
}
