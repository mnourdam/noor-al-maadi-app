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

/** True when this story's card cover ships with the app — no network needed. */
export function hasOfflineStoryCover(storyId: string | null | undefined): boolean {
  return !!storyId && BUNDLED.has(storyId);
}

/** Local, same-origin path for a bundled story cover. */
export function localStoryCoverPath(storyId: string | null | undefined): string | null {
  if (!hasOfflineStoryCover(storyId)) return null;
  return `/story-covers/${storyId}.webp`;
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
