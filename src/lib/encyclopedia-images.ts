/**
 * Encyclopedia entity image storage helpers.
 *
 * Uploads live under a stable per-entity prefix:
 *   encyclopedia-images/{entityType}/{entityId}/{timestamp}.webp
 *
 * Each upload writes a fresh timestamped file, then removes the previous
 * file the entity was pointing at. This gives us cheap cache-busting
 * (URL changes) without accumulating orphan objects. If the previous
 * file is still referenced by another entity we leave it alone.
 *
 * All processing happens in the browser via `image-processor.ts`; only
 * the compressed WebP blob crosses the wire.
 */

import { supabase } from "@/integrations/supabase/client";
import { processImage, type ProcessedImage, type ProcessImageOptions } from "./image-processor";

const BUCKET = "encyclopedia-images";

/** Fields we persist per entity — mirrors the migration columns. */
export interface EntityImageFields {
  image_url: string | null;
  image_path: string | null;
  image_credit: string | null;
  image_source: string | null;
}

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

function buildStoragePath(entityType: string, entityId: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${safeSegment(entityType)}/${safeSegment(entityId)}/${stamp}.webp`;
}

/** Resolve a storage `path` into a public URL usable by <img>. */
export function publicUrlForPath(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export interface UploadEntityImageArgs {
  entityId: string;
  entityType: string;
  file: File;
  credit?: string | null;
  source?: string | null;
  previousPath?: string | null;
  processing?: ProcessImageOptions;
}

export interface UploadEntityImageResult {
  fields: EntityImageFields;
  processed: ProcessedImage;
}

/**
 * Process + upload a new image for an entity, then persist the four
 * `image_*` columns. Old image file (if any) is removed AFTER the new one
 * uploads and the row updates successfully — a failed upload never wipes
 * the current image.
 */
export async function uploadEntityImage(args: UploadEntityImageArgs): Promise<UploadEntityImageResult> {
  const processed = await processImage(args.file, args.processing);
  const path = buildStoragePath(args.entityType, args.entityId);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, processed.blob, {
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`تعذر رفع الصورة. لم يتم تغيير الصورة الحالية. (${uploadError.message})`);
  }

  const url = publicUrlForPath(path);
  const fields: EntityImageFields = {
    image_url: url,
    image_path: path,
    image_credit: args.credit?.trim() || null,
    image_source: args.source?.trim() || null,
  };

  const { error: updateError } = await supabase
    .from("encyclopedia_entities")
    .update(fields)
    .eq("id", args.entityId);
  if (updateError) {
    // Roll back the freshly uploaded file so we don't leave an orphan.
    try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
    throw new Error(`تعذر حفظ بيانات الصورة. (${updateError.message})`);
  }

  // Best-effort cleanup of the previous file, only when it belonged to
  // THIS entity's prefix. Prevents accidentally removing a file shared
  // via a manual admin edit.
  if (args.previousPath && args.previousPath !== path) {
    const expectedPrefix = `${safeSegment(args.entityType)}/${safeSegment(args.entityId)}/`;
    if (args.previousPath.startsWith(expectedPrefix)) {
      try { await supabase.storage.from(BUCKET).remove([args.previousPath]); } catch { /* ignore */ }
    }
  }

  return { fields, processed };
}

/**
 * Remove the current image for an entity: clears the four columns AND
 * deletes the underlying storage object. Safe to call when the entity
 * has no image.
 */
export async function deleteEntityImage(entityId: string, currentPath: string | null): Promise<void> {
  const { error } = await supabase
    .from("encyclopedia_entities")
    .update({ image_url: null, image_path: null, image_credit: null, image_source: null })
    .eq("id", entityId);
  if (error) throw new Error(`تعذر حذف الصورة. (${error.message})`);
  if (currentPath) {
    try { await supabase.storage.from(BUCKET).remove([currentPath]); } catch { /* ignore */ }
  }
}

/**
 * Update just the credit / source without re-uploading the image.
 * No-op when the entity has no image path.
 */
export async function updateEntityImageMeta(
  entityId: string,
  credit: string | null,
  source: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("encyclopedia_entities")
    .update({ image_credit: credit?.trim() || null, image_source: source?.trim() || null })
    .eq("id", entityId);
  if (error) throw new Error(`تعذر حفظ بيانات الصورة. (${error.message})`);
}
