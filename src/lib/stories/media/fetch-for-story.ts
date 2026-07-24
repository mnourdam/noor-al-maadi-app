// Fetches every media row referenced by a story: story-scoped media plus any
// explicitly referenced cover_media_id or scene primary_media_id.
// Player runtime uses this to build the media[] array for SceneRenderer.

import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "./dao";
import { listStoryMedia } from "./dao";
import type { StoryRow, StorySceneRow } from "@/lib/stories/types";

export async function fetchStoryMediaForRuntime(
  story: StoryRow,
  scenes: StorySceneRow[],
): Promise<StoryMediaRow[]> {
  const referenced = new Set<string>();
  if (story.cover_media_id) referenced.add(story.cover_media_id);
  for (const s of scenes) {
    if (s.primary_media_id) referenced.add(s.primary_media_id);
  }
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (online) {
    // M6 Phase A: prefer the visibility-enforced RPC.
    try {
      const { data, error } = await supabase.rpc(
        "get_story_media_urls_v2" as never,
        { p_story_id: story.id } as never,
      );
      if (!error && data && (data as { ok?: boolean }).ok) {
        return ((data as { media?: StoryMediaRow[] }).media ?? []) as StoryMediaRow[];
      }
    } catch { /* fall through to legacy path */ }
    // Legacy fallback (Phase B will remove).
    try {
      const owned = await listStoryMedia(story.id);
      const known = new Set(owned.map((m) => m.id));
      const missing = [...referenced].filter((id) => !known.has(id));
      if (missing.length === 0) return owned;
      const { data, error } = await supabase
        .from("story_media")
        .select("*")
        .in("id", missing);
      if (!error) return [...owned, ...((data ?? []) as StoryMediaRow[])];
    } catch { /* fall through to offline path */ }
  }
  // Offline / RPC failure — hydrate from the local snapshot.
  try {
    const {
      ensureLocalSnapshotLoaded,
      localStoryMediaForStory,
    } = await import("@/lib/local-first-store");
    await ensureLocalSnapshotLoaded();
    return localStoryMediaForStory(String(story.id), referenced) as unknown as StoryMediaRow[];
  } catch { return []; }
}
