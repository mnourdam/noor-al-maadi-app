/**
 * Client-side image processing pipeline for encyclopedia entity images.
 *
 * Every uploaded image is:
 *   1. Decoded via <img> (which honours EXIF orientation in modern browsers).
 *   2. Resized so the longest side is <= 1200px (aspect-preserving).
 *   3. Re-encoded as WebP with progressive quality/dimension reduction
 *      until it fits under the ~100 KB target (or hits a sensible floor).
 *
 * The pipeline never uploads the raw source and never crops the image.
 * All work runs on a <canvas> off the main render tree so the UI stays
 * responsive; each attempt yields to the event loop between passes.
 */

export interface ProcessImageOptions {
  /** Longest-side cap in CSS pixels. Default 1200. */
  maxLongestSide?: number;
  /** Soft file-size target in bytes. Default 100 KB. */
  targetBytes?: number;
  /** Hard quality floor before we start reducing dimensions. Default 0.55. */
  minQuality?: number;
  /** Dimension floor — never shrink below this longest side. Default 640. */
  minLongestSide?: number;
  /** Progress callback: 0–1. */
  onProgress?: (ratio: number) => void;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  bytes: number;
  /** True when the pipeline could NOT fit under the target and returned
   *  the best-quality attempt below the quality floor / min-size cap. */
  degraded: boolean;
}

const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** Rough MIME sniffing so a `.png` renamed to `.gif` still fails validation. */
export async function sniffImageMime(file: File | Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 4) return null;
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  // WebP: "RIFF"...."WEBP"
  if (
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) return "image/webp";
  // GIF: "GIF8" — explicitly rejected (animation not supported here)
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return "image/gif";
  return null;
}

export class ImageProcessingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    // Setting crossOrigin is unnecessary for object URLs and can prevent decode.
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new ImageProcessingError("decode_failed", "تعذر قراءة ملف الصورة.");
  } finally {
    // Revoke shortly after — the caller only needs the decoded bitmap.
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 1000);
  }
}

function computeSize(w: number, h: number, longest: number): { w: number; h: number } {
  const max = Math.max(w, h);
  if (max <= longest) return { w: Math.round(w), h: Math.round(h) };
  const scale = longest / max;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function drawTo(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProcessingError("canvas_unavailable", "تعذر تجهيز محرر الصور.");
  // Better downscale quality.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

async function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality),
  );
  if (!blob) throw new ImageProcessingError("encode_failed", "تعذر ضغط الصورة.");
  return blob;
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Process an uploaded image into a WebP blob that fits the size target.
 *
 * Strategy: at the current dimensions, sweep quality from 82 down to the
 * quality floor. If still too large, shrink the longest side by ~15% and
 * repeat. Stop when we're under the target or we hit the size floor at
 * the quality floor.
 */
export async function processImage(
  file: File,
  opts: ProcessImageOptions = {},
): Promise<ProcessedImage> {
  const maxLongestSide = opts.maxLongestSide ?? 1200;
  const targetBytes = opts.targetBytes ?? 100 * 1024;
  const minQuality = opts.minQuality ?? 0.55;
  const minLongestSide = opts.minLongestSide ?? 640;
  const onProgress = opts.onProgress ?? (() => {});

  // Validation — verify by content, not just filename.
  const sniffed = await sniffImageMime(file);
  if (!sniffed || !ACCEPTED_MIME.has(sniffed)) {
    throw new ImageProcessingError("unsupported_type", "صيغة الصورة غير مدعومة.");
  }
  onProgress(0.05);

  const img = await decode(file);
  onProgress(0.15);

  let longest = Math.min(Math.max(img.naturalWidth, img.naturalHeight), maxLongestSide);
  let best: ProcessedImage | null = null;
  let attempts = 0;

  while (true) {
    const { w, h } = computeSize(img.naturalWidth, img.naturalHeight, longest);
    const canvas = drawTo(img, w, h);

    for (let q = 0.82; q >= minQuality - 0.001; q -= 0.07) {
      const quality = Math.max(minQuality, Math.round(q * 100) / 100);
      const blob = await encodeWebp(canvas, quality);
      attempts++;
      const candidate: ProcessedImage = {
        blob, width: w, height: h, quality, bytes: blob.size, degraded: false,
      };
      if (!best || blob.size < best.bytes) best = candidate;
      onProgress(Math.min(0.95, 0.15 + attempts * 0.05));
      if (blob.size <= targetBytes) {
        return candidate;
      }
      await yieldFrame();
    }

    // Shrink dimensions ~15% and try again.
    const nextLongest = Math.round(longest * 0.85);
    if (nextLongest < minLongestSide) break;
    longest = nextLongest;
    await yieldFrame();
  }

  // Fell out of the loop — return the smallest we could produce.
  if (!best) throw new ImageProcessingError("encode_failed", "تعذر ضغط الصورة.");
  return { ...best, degraded: best.bytes > targetBytes };
}

/** Human-readable size formatter for admin feedback. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
