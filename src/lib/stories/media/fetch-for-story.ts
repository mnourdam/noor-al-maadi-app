// Fetches every media row referenced by a story: story-owned media plus any
// shared media referenced via cover_media_id or scene primary_media_id.
// Player runtime uses this to build the media[] array for SceneRenderer.

import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "./dao";
import { listStoryMedia } from "./dao";
import type { StoryRow, StorySceneRow } from "@/lib/stories/types";

export async function fetchStoryMediaForRuntime(
  story: StoryRow,
  scenes: StorySceneRow[],
): Promise<StoryMediaRow[]> {
  const owned = await listStoryMedia(story.id);
  const known = new Set(owned.map((m) => m.id));
  const referenced = new Set<string>();
  if (story.cover_media_id) referenced.add(story.cover_media_id);
  for (const s of scenes) {
    if (s.primary_media_id) referenced.add(s.primary_media_id);
  }
  const missing = [...referenced].filter((id) => !known.has(id));
  if (missing.length === 0) return owned;
  const { data, error } = await supabase
    .from("story_media")
    .select("*")
    .in("id", missing);
  if (error) return owned;
  return [...owned, ...((data ?? []) as StoryMediaRow[])];
}
