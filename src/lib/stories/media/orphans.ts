// ============================================================
// Stories P2 — Orphan cleanup
// ------------------------------------------------------------
// Storage lifecycle rule:
//   * A media row is an orphan when it is older than the cutoff
//     AND neither a `stories.cover_media_id` nor a
//     `story_scenes.primary_media_id` references it.
//   * Cleanup deletes the row first (server RPC guards against
//     in-use media), then the storage object.
//   * Cleanup is idempotent: partial failures leave the surviving
//     rows/objects untouched.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { deleteStoryMedia, listStoryMediaOrphans, type StoryMediaOrphan } from "./dao";

const BUCKET = "story-media" as const;

export interface OrphanCleanupSummary {
  scanned: number;
  deletedRows: number;
  deletedObjects: number;
  failed: Array<{ id: string; error: string }>;
  freedBytes: number;
}

/** Delete every media row older than `minAgeMinutes` that no story references. */
export async function cleanupStoryMediaOrphans(
  minAgeMinutes = 60 * 24,
): Promise<OrphanCleanupSummary> {
  const orphans = await listStoryMediaOrphans(minAgeMinutes);
  return await cleanupSpecificOrphans(orphans);
}

/** Delete a caller-supplied list of orphan candidates. */
export async function cleanupSpecificOrphans(
  orphans: StoryMediaOrphan[],
): Promise<OrphanCleanupSummary> {
  const summary: OrphanCleanupSummary = {
    scanned: orphans.length,
    deletedRows: 0,
    deletedObjects: 0,
    failed: [],
    freedBytes: 0,
  };

  for (const orphan of orphans) {
    try {
      const removed = await deleteStoryMedia(orphan.id);
      summary.deletedRows += 1;
      const path = removed?.storage_path ?? orphan.storage_path;
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        summary.failed.push({ id: orphan.id, error: `storage_delete: ${error.message}` });
      } else {
        summary.deletedObjects += 1;
        summary.freedBytes += orphan.byte_size ?? 0;
      }
    } catch (err) {
      summary.failed.push({
        id: orphan.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
