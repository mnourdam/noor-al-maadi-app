// ============================================================
// Stories — canonical media URL resolver (Phase A)
// ------------------------------------------------------------
// The `story-media` bucket is PRIVATE. Every reader (admin
// editor, admin preview, Home cards, Story Landing, Story
// Reader) must resolve URLs through this single module. No
// component may call `getPublicUrl` on story-media anywhere
// else. The canonical truth is still `bucket + storage_path`;
// signed URLs are transient and NEVER persisted.
//
// Contract:
//   • `signStoryMediaUrl(row)`  — async, returns a signed URL
//     that lives for ~1 hour. Memoised per (bucket|path|pv) so
//     repeated calls in the same session share one request.
//   • `useStoryMediaUrl(row)`   — React hook wrapping the above
//     with a stable string result and offline-cache friendly
//     `?v=<processing_version>` cache-buster passed straight
//     through to the browser image cache.
//
// The returned URL includes `?v=<processing_version>` so the
// shared `image-cache` layer invalidates exactly when the
// processing pipeline emits new bytes for the same path.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "./dao";

type MediaLike = Pick<StoryMediaRow, "storage_bucket" | "storage_path"> &
  Partial<Pick<StoryMediaRow, "id" | "processing_version">>;

// Signed URL TTL requested from the server.
const SIGNED_TTL_SECONDS = 60 * 60; // 1h
// Local cache eviction — refresh ~10min before expiry.
const LOCAL_TTL_MS = (SIGNED_TTL_SECONDS - 10 * 60) * 1000;

interface CacheEntry {
  promise: Promise<string | null>;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function keyOf(row: MediaLike): string {
  const pv = Number.isFinite(row.processing_version as number)
    ? row.processing_version
    : 1;
  return `${row.storage_bucket}::${row.storage_path}::${pv}`;
}

async function sign(row: MediaLike): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket)
    .createSignedUrl(row.storage_path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  const pv = Number.isFinite(row.processing_version as number)
    ? row.processing_version
    : 1;
  const sep = data.signedUrl.includes("?") ? "&" : "?";
  return `${data.signedUrl}${sep}v=${pv}`;
}

/** Return a signed URL for a story-media row (memoised, ~1h TTL). */
export async function signStoryMediaUrl(row: MediaLike | null | undefined): Promise<string | null> {
  if (!row || !row.storage_bucket || !row.storage_path) return null;
  const k = keyOf(row);
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && hit.expiresAt > now) return hit.promise;
  const promise = sign(row);
  cache.set(k, { promise, expiresAt: now + LOCAL_TTL_MS });
  // On failure, drop the negative result so the next call retries.
  promise.then((v) => { if (v === null) cache.delete(k); }).catch(() => cache.delete(k));
  return promise;
}

/** Invalidate any cached signed URL for this row (call after re-upload). */
export function invalidateStoryMediaUrl(row: MediaLike): void {
  cache.delete(keyOf(row));
}

/** React hook — returns the signed URL for a media row, or null while resolving. */
export function useStoryMediaUrl(row: MediaLike | null | undefined): string | null {
  const k = row ? keyOf(row) : null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!row) { setUrl(null); return; }
    void signStoryMediaUrl(row).then((v) => { if (alive) setUrl(v); });
    return () => { alive = false; };
  }, [k]);
  return url;
}
