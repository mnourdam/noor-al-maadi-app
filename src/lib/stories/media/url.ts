// ============================================================
// Stories — shared media URL helper
// ------------------------------------------------------------
// Every reader (admin preview + player) resolves story_media
// public URLs through this file so bucket/path assumptions live
// in exactly one place.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "./dao";

export function storyMediaPublicUrl(row: Pick<StoryMediaRow, "storage_bucket" | "storage_path">): string {
  const { data } = supabase.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  return data.publicUrl;
}
