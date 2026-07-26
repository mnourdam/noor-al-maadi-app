// ============================================================
// Stories P2 — Client-side upload lifecycle
// ------------------------------------------------------------
// One entry point for admins to add a piece of media to a story.
// Lifecycle stages, in order:
//
//   1. Process — resize/compress via the shared image pipeline
//      using the preset's targets (WebP output).
//   2. Hash    — SHA-256 the compressed blob for content addressing.
//   3. Upload  — put the blob into the `story-media` bucket at a
//      stable, dedup-friendly path derived from the checksum.
//   4. Register — insert a `story_media` row (unverified).
//   5. Verify  — call the server verifier; it re-downloads the
//      object, re-hashes and marks `verified = true` iff the
//      hash matches what was registered.
//   6. Thumbnail — optional smaller preset uploaded alongside.
//
// Any step failing rolls back later stages (best-effort delete
// of any uploaded object) so we never leave the story pointing at
// unverified or missing media.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { processImage, type ProcessedImage } from "@/lib/image-processor";
import { sha256Hex } from "./checksum";
import {
  deleteStoryMedia,
  registerStoryMedia,
  type StoryMediaRow,
} from "./dao";
import {
  getPreset,
  presetToProcessingOptions,
  STORY_CARD_COVER_PREFIX,
  STORY_CARD_COVER_PRESET,
  type StoryMediaPresetKey,
} from "./presets";

const BUCKET = "story-media" as const;

/**
 * Covers get a second, tiny derivative (3:4, 10–20KB) uploaded next to
 * the full-size image. That derivative is what the story CARD renders,
 * what ships in the offline Story Cover pack, and what the delta sync
 * downloads for stories added after a build was cut. Failure here is
 * never fatal: the card simply falls back to the full-size cover.
 */
async function uploadCardCoverDerivative(file: File): Promise<string | null> {
  try {
    const processed = await processImage(file, presetToProcessingOptions(STORY_CARD_COVER_PRESET));
    const checksum = await sha256Hex(processed.blob);
    const path = `${STORY_CARD_COVER_PREFIX}/${checksum.slice(0, 2)}/${checksum}.webp`;
    await uploadObject(path, processed.blob);
    return path;
  } catch {
    return null;
  }
}


export interface UploadStoryMediaArgs {
  storyId: string | null;
  kind: StoryMediaPresetKey;
  file: File;
  metadata?: Record<string, unknown>;
  onProgress?: (stage: UploadStage, ratio: number) => void;
}

export type UploadStage =
  | "processing"
  | "hashing"
  | "uploading"
  | "registering"
  | "verifying"
  | "done";

export interface UploadStoryMediaResult {
  mediaId: string;
  storagePath: string;
  checksum: string;
  processed: ProcessedImage;
  verified: boolean;
}

function buildStoragePath(checksum: string, preset: string, processingVersion: number): string {
  // Content-addressed layout: <preset>/v<version>/<xx>/<checksum>.webp
  // The two-char shard prevents overloading a single directory.
  const shard = checksum.slice(0, 2);
  return `${preset}/v${processingVersion}/${shard}/${checksum}.webp`;
}

async function uploadObject(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
    upsert: false,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`upload_failed: ${error.message}`);
  }
}

async function removeObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* best effort */
  }
}

async function requestVerification(mediaId: string): Promise<{ verified: boolean; reason?: string }> {
  const { verifyStoryMedia } = await import("./verify.functions");
  return await verifyStoryMedia({ data: { mediaId } });
}

/**
 * Full upload → register → verify pipeline. Idempotent w.r.t. content:
 * a re-upload of the same processed bytes hits the same storage path
 * and the same `story_media` row (server RPC deduplicates by checksum
 * + preset + processing_version).
 */
export async function uploadStoryMedia(args: UploadStoryMediaArgs): Promise<UploadStoryMediaResult> {
  const preset = getPreset(args.kind);
  const onProgress = args.onProgress ?? (() => {});

  onProgress("processing", 0);
  const processed = await processImage(args.file, {
    ...presetToProcessingOptions(preset),
    onProgress: (r) => onProgress("processing", r),
  });

  onProgress("hashing", 0);
  const checksum = await sha256Hex(processed.blob);
  onProgress("hashing", 1);

  const path = buildStoragePath(checksum, preset.id, preset.processingVersion);

  onProgress("uploading", 0);
  await uploadObject(path, processed.blob);
  onProgress("uploading", 1);

  // Covers additionally emit the compact card derivative used by the
  // offline Story Cover pack and by every story card in the app.
  const cardCoverPath =
    preset.kind === "cover" ? await uploadCardCoverDerivative(args.file) : null;

  let mediaId: string;
  try {
    onProgress("registering", 0);
    mediaId = await registerStoryMedia({
      storyId: args.storyId,
      kind: preset.kind,
      storagePath: path,
      byteSize: processed.bytes,
      width: processed.width,
      height: processed.height,
      checksumSha256: checksum,
      preset: preset.id,
      processingVersion: preset.processingVersion,
      metadata: {
        source_name: args.file.name,
        source_bytes: args.file.size,
        quality: processed.quality,
        degraded: processed.degraded,
        ...(cardCoverPath ? { card_cover_path: cardCoverPath } : {}),
        ...(args.metadata ?? {}),
      },
    });

    onProgress("registering", 1);
  } catch (err) {
    await removeObject(path);
    throw err;
  }

  onProgress("verifying", 0);
  let verified = false;
  try {
    const result = await requestVerification(mediaId);
    verified = result.verified;
    if (!verified) {
      throw new Error(`verify_failed: ${result.reason ?? "unknown"}`);
    }
  } catch (err) {
    // Roll back both the row and the storage object so a failed verify
    // never leaves an unverified row behind.
    try { await deleteStoryMedia(mediaId); } catch { /* ignore */ }
    await removeObject(path);
    throw err;
  }
  onProgress("verifying", 1);

  onProgress("done", 1);
  return { mediaId, storagePath: path, checksum, processed, verified: true };
}

/** Convenience: create a signed URL for reading a media row. */
export async function signStoryMediaUrl(
  row: Pick<StoryMediaRow, "storage_path">,
  ttlSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`sign_failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
