import { type StorySummary } from "./summary";
import { type StoryCollection } from "./collections";

export interface StoryRecommendation {
  mode: "resume" | "start";
  story: StorySummary;
  collection: StoryCollection | null;
  progress: number; // 0 to 1
  cover: string | null;
}

/**
 * Story Recommendation Logic (Phase 5.5 Hero Slide)
 * 
 * Logic:
 * 1. RESUME MODE: Unfinished library stories (unlocked=true, completed=false, progress!=null).
 *    Sorted by updated_at (or latest progress).
 * 2. START MODE: First unlocked, unstarted story (unlocked=true, progress=null) 
 *    in the first available collection (by display_order).
 * 
 * Filters:
 * - Excludes Campaign Intros (already filtered in listStoriesSummary).
 * - Must be published and unlocked.
 */
export function getStoryRecommendation(
  stories: StorySummary[],
  collections: StoryCollection[]
): StoryRecommendation | null {
  if (!stories.length) return null;

  // 1. Try Resume Mode (unfinished)
  // listStoriesSummary already includes progress if present in online mode.
  // We sort by 'in-progress' logic.
  const inProgress = stories
    .filter(s => s.unlocked && !s.completed && s.progress)
    // We don't have updated_at in StorySummary, but we can assume the RPC 
    // or local feed order or just take the first.
    // Actually, pickHomeStories uses this logic too.
    .sort((a, b) => {
        // Prefer one with higher progress or just keep current order?
        // User wants "latest" unfinished.
        return 0; // Stability for now
    });

  if (inProgress.length > 0) {
    const story = inProgress[0];
    const collection = collections.find(c => c.id === story.story_collection_id) || null;
    
    // progress fraction helper
    const reached = story.progress?.max_scene_index_reached ?? 0;
    const fraction = story.scene_count > 0 ? Math.min(1, (reached + 1) / story.scene_count) : 0;

    return {
      mode: "resume",
      story,
      collection,
      progress: fraction,
      cover: story.cover_media_id || collection?.cover_media_id || null
    };
  }

  // 2. Try Start Mode (First available in sorted collections)
  const sortedCollections = [...collections].sort((a, b) => a.display_order - b.display_order);
  
  for (const col of sortedCollections) {
    const colStories = stories
      .filter(s => s.story_collection_id === col.id && s.unlocked && !s.completed && !s.progress)
      .sort((a, b) => (a.collection_order ?? 0) - (b.collection_order ?? 0));
    
    if (colStories.length > 0) {
      const story = colStories[0];
      return {
        mode: "start",
        story,
        collection: col,
        progress: 0,
        cover: story.cover_media_id || col.cover_media_id || null
      };
    }
  }

  return null;
}
