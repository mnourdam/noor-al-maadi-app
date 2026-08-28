// ============================================================
// Offline Story Media Pack — local-first source of truth (V16)
// ------------------------------------------------------------
// Every media object referenced by a packaged published story or
// campaign intro ships inside the build at:
//
//   /story-media/<media_id>.webp
//
// Resolution order for story artwork:
//
//   1. Bundled local asset      ← always first, zero network
//   2. Offline image cache      ← delta-synced content
//   3. Signed story-media URL   ← online-only last resort
//
// The bucket stays PRIVATE: packaging happens at build time with a
// build-only service-role secret (scripts/build-story-media-pack.mjs).
// Nothing about that secret exists at runtime.
// ============================================================

import { OFFLINE_STORY_MEDIA_IDS } from "./offline-pack.generated";

const BUNDLED: ReadonlySet<string> = new Set(OFFLINE_STORY_MEDIA_IDS);

/** True when this media id's bytes ship with the app — no network needed. */
export function hasOfflineStoryMedia(mediaId: string | null | undefined): boolean {
  return !!mediaId && BUNDLED.has(mediaId);
}

/** Local, same-origin path for a bundled story media asset. */
export function localStoryMediaPath(mediaId: string | null | undefined): string | null {
  if (!hasOfflineStoryMedia(mediaId)) return null;
  return `/story-media/${mediaId}.webp`;
}

/** Number of media assets bundled in this build (diagnostics). */
export function offlineStoryMediaCount(): number {
  return BUNDLED.size;
}

export { OFFLINE_STORY_MEDIA_IDS };
