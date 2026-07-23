// ============================================================
// Stories — shared media URL helper
// ------------------------------------------------------------
// Every reader (admin preview + player) resolves story_media
// public URLs through this file so bucket/path assumptions live
// in exactly one place.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type { StoryMediaRow } from "./dao";

export function storyMediaPublicUrl(
  row: Pick<StoryMediaRow, "storage_bucket" | "storage_path"> &
    Partial<Pick<StoryMediaRow, "processing_version">>,
): string {
  const { data } = supabase.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  // Cache-buster: `?v=<processing_version>` invalidates the shared image
  // cache exactly when the processing pipeline emits a new artifact for
  // the same storage path. Without this, cache-first serves stale bytes.
  const pv = Number.isFinite(row.processing_version as number) ? row.processing_version : 1;
  return `${data.publicUrl}?v=${pv}`;
}
