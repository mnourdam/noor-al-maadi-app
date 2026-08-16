// ============================================================
// Stories P2 — Canonical story_media DAO
// ------------------------------------------------------------
// Every reader/writer of story_media MUST go through this file.
// Prevents drift between admin UI, player, publish validator and
// orphan cleanup. Returns strict types; RLS handles visibility
// (public can read verified rows, admins can read all).
// ============================================================
import { supabase } from "@/integrations/supabase/client";
function assertOk(data, error, label) {
    if (error)
        throw new Error(`${label}: ${error.message}`);
    if (data === null)
        throw new Error(`${label}: no rows`);
    return data;
}
// Removed 2026-07-24 (Production Readiness Pass): `getStoryMediaById` and
// `listStoryMedia` had zero callers. Admin media workflows go through
// `admin_list_story_media_orphans`, `admin_register_story_media`,
// `admin_delete_story_media`, and `admin_mark_story_media_verified`.
// Player workflows go through `get_story_media_urls_v2`. Direct table
// reads are no longer needed and would break under the planned Phase B
// RLS lockdown.
/**
 * Register a media row after the object has been uploaded to storage.
 * The row is created with `verified = false`; it becomes verified only
 * after the server-side verifier re-downloads and hashes the object.
 */
export async function registerStoryMedia(input) {
    const { data, error } = await supabase.rpc("admin_register_story_media", {
        p_story_id: input.storyId,
        p_kind: input.kind,
        p_storage_bucket: "story-media",
        p_storage_path: input.storagePath,
        p_mime_type: "image/webp",
        p_byte_size: input.byteSize,
        p_width: input.width,
        p_height: input.height,
        p_checksum_sha256: input.checksumSha256,
        p_preset: input.preset,
        p_processing_version: input.processingVersion,
        p_metadata: (input.metadata ?? {}),
    });
    return assertOk(data, error, "registerStoryMedia");
}
/**
 * Delete a media row. Refuses to remove media referenced as a story
 * cover or a scene's primary media. Returns the storage location the
 * caller must delete afterwards.
 */
export async function deleteStoryMedia(id) {
    const { data, error } = await supabase.rpc("admin_delete_story_media", { p_media_id: id });
    if (error)
        throw new Error(`deleteStoryMedia: ${error.message}`);
    const row = (data ?? [])[0];
    return row ?? null;
}
/** Orphan media older than `minAgeMinutes` (default 60). */
export async function listStoryMediaOrphans(minAgeMinutes = 60) {
    const { data, error } = await supabase.rpc("admin_list_story_media_orphans", {
        p_min_age_minutes: minAgeMinutes,
    });
    if (error)
        throw new Error(`listStoryMediaOrphans: ${error.message}`);
    return (data ?? []);
}
/** Server-side publish validation (never mutates state). */
export async function validateStoryPublish(storyId) {
    const { data, error } = await supabase.rpc("admin_validate_story_publish", {
        p_story_id: storyId,
    });
    if (error)
        throw new Error(`validateStoryPublish: ${error.message}`);
    const parsed = data;
    return { ok: !!parsed?.ok, issues: parsed?.issues ?? [], warnings: parsed?.warnings ?? [] };
}
