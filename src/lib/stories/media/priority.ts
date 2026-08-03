// ============================================================
// Stories — priority media selection (P5 prefetch policy)
// ------------------------------------------------------------
// When Stories are synchronised we don't wait until the player
// opens a story to warm its media. We prefetch the "hero" assets
// that dominate perceived performance:
//
//   * story cover
//   * first scene's primary media (by scene_index)
//   * first `document` scene's primary media
//   * first `reveal` scene's primary media
//
// Remaining scene media downloads lazily on demand (existing
// image-cache path). Priority URLs are warmed BEFORE the general
// story-media prefetch so slow networks still land the important
// assets first.
// ============================================================

interface StoryLike {
  id: string;
  cover_media_id?: string | null;
}
interface SceneLike {
  story_id: string;
  scene_index: number;
  scene_type: string;
  primary_media_id?: string | null;
}
interface MediaLike {
  id: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  processing_version?: number | null;
  verified?: boolean | null;
}

/**
 * Return the set of media IDs that should be prefetched first for a
 * freshly-synced snapshot.
 */
export function collectPriorityMediaIds(
  stories: StoryLike[],
  scenes: SceneLike[],
): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(stories) || !Array.isArray(scenes)) return out;

  const scenesByStory = new Map<string, SceneLike[]>();
  for (const s of scenes) {
    const bucket = scenesByStory.get(s.story_id);
    if (bucket) bucket.push(s);
    else scenesByStory.set(s.story_id, [s]);
  }
  for (const list of scenesByStory.values()) {
    list.sort((a, b) => (a.scene_index ?? 0) - (b.scene_index ?? 0));
  }

  for (const story of stories) {
    if (story.cover_media_id) out.add(story.cover_media_id);
    const ordered = scenesByStory.get(story.id) ?? [];
    const firstScene = ordered[0];
    if (firstScene?.primary_media_id) out.add(firstScene.primary_media_id);
    const firstDoc = ordered.find((s) => s.scene_type === "document");
    if (firstDoc?.primary_media_id) out.add(firstDoc.primary_media_id);
    const firstReveal = ordered.find((s) => s.scene_type === "reveal");
    if (firstReveal?.primary_media_id) out.add(firstReveal.primary_media_id);
  }
  return out;
}

// NOTE: story-media lives in a PRIVATE bucket. Never build
// `/storage/v1/object/public/...` URLs for it — warm the image cache with
// `prefetchStoryMediaRows` (signed fetch, stable cache key) instead.

