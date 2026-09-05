// ============================================================
// Campaign Chapter Image — ONE optional image per chapter.
// ------------------------------------------------------------
// Deliberately minimal: reuses the Key Art bucket, the shared
// browser image processor, and the existing offline image cache.
//
// Unlike Key Art (which persists storage paths and signs at
// runtime), a chapter image is stored inline in the campaign
// `data` jsonb as a plain https URL (`chapter.imageUrl`). That is
// what makes it discoverable by `collectImageUrls()` and cached
// by the existing offline pipeline with no collector change.
// The signed URL is minted with a very long TTL for that reason.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { processImage } from "./image-processor";

const BUCKET = "campaign-key-art";
/** 10 years — the URL is persisted inside the campaign document. */
const SIGN_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

function stamp(): string {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${d}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Storage path for a chapter image, kept under a dedicated prefix. */
export function chapterImagePath(chapterId: string): string {
  return `chapters/${safeSegment(chapterId)}/${stamp()}.webp`;
}

/** Extract the storage path back out of a signed URL we minted. */
export function storagePathFromChapterImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/object\/sign\/campaign-key-art\/([^?]+)/.exec(url);
  if (!m) return null;
  try {
    const p = decodeURIComponent(m[1]);
    return p.startsWith("chapters/") ? p : null;
  } catch {
    return null;
  }
}

/**
 * Process → upload → sign. Returns the https URL to persist on the
 * chapter. Best-effort removes the previous object when it is one
 * of ours (never touches a manually shared file).
 */
export async function uploadChapterImage(
  chapterId: string,
  file: File,
  previousUrl?: string | null,
): Promise<string> {
  const processed = await processImage(file, {
    maxLongestSide: 1600,
    minLongestSide: 900,
    targetBytes: 180 * 1024,
  });
  const path = chapterImagePath(chapterId);

  const up = await supabase.storage.from(BUCKET).upload(path, processed.blob, {
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
    upsert: false,
  });
  if (up.error) throw new Error(`تعذر رفع صورة الفصل. (${up.error.message})`);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
    throw new Error(`تعذر إنشاء رابط صورة الفصل. (${error?.message ?? "خطأ"})`);
  }

  await removeChapterImageObject(previousUrl);
  return data.signedUrl;
}

/** Best-effort delete of the underlying object for a chapter image URL. */
export async function removeChapterImageObject(url: string | null | undefined): Promise<void> {
  const path = storagePathFromChapterImageUrl(url);
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
}
