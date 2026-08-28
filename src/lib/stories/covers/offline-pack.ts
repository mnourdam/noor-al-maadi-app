// ============================================================
// Offline Story Cover Pack — local-first source of truth
// ------------------------------------------------------------
// A story CARD COVER is an application asset, not remote content.
// Exactly like Premium Emblems and Campaign Key Art, every cover
// of every published story ships inside the build at:
//
//   /story-covers/<story_id>.webp     (3:4, 360x480, 10–20KB)
//
// Resolution order (single <img>, candidate walk — never <picture>):
//
//   1. Local bundled cover        ← always first, zero network
//   2. Delta-synced cached cover  ← stories newer than this build
//   3. Signed story-media URL     ← last resort, online only
//
// Scene images are deliberately NOT in this pack: they are
// full-bleed reading assets loaded inside the story player.
//
// Regenerate with: `node scripts/build-story-cover-pack.mjs`
// (integrity manifest at /story-covers/manifest.json).
// ============================================================

import {
  OFFLINE_STORY_COVER_IDS,
  OFFLINE_STORY_COVER_VERSIONS,
} from "./offline-pack.generated";

const BUNDLED: ReadonlySet<string> = new Set(OFFLINE_STORY_COVER_IDS);

// V16: the authoritative cover source is the Story Media Pack
// (`/story-media/<cover_media_id>.webp`), generated for EVERY published
// story by scripts/generate-story-cover-map.mjs. The legacy 3-entry
// `/story-covers` pack is kept only as a secondary fallback.

/** Packaged cover media id for this story, if any. */
export function packagedCoverMediaId(storyId: string | null | undefined): string | null {
  if (!storyId) return null;
  const id = STORY_COVER_MEDIA_MAP[storyId];
  return typeof id === "string" && id ? id : null;
}

/** True when this story's card cover ships with the app — no network needed. */
export function hasOfflineStoryCover(storyId: string | null | undefined): boolean {
  return !!packagedCoverMediaId(storyId) || (!!storyId && BUNDLED.has(storyId));
}

/** Local, same-origin path for a bundled story cover. */
export function localStoryCoverPath(storyId: string | null | undefined): string | null {
  const mediaId = packagedCoverMediaId(storyId);
  if (mediaId) return localStoryMediaPath(mediaId);
  if (!storyId || !BUNDLED.has(storyId)) return null;
  return `/story-covers/${storyId}.webp`;
}

/** True when the story is published with no authored cover at all. */
export function storyHasNoAuthoredCover(storyId: string | null | undefined): boolean {
  return !!storyId && NO_COVER.has(storyId);
}

/**
 * Content version the bundled cover was built from. Used by the delta
 * sync to detect a cover that was re-authored after this build shipped.
 */
export function bundledCoverContentVersion(storyId: string): number | null {
  const v = OFFLINE_STORY_COVER_VERSIONS[storyId];
  return typeof v === "number" ? v : null;
}

export { OFFLINE_STORY_COVER_IDS };
