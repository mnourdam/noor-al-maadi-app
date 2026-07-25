// ============================================================
// Artwork readability — adaptive scrim intensity.
// ------------------------------------------------------------
// Samples the region of a Key Art image that sits BEHIND the text
// block (the lower band) and derives how much scrim that specific
// artwork needs. Bright, high-contrast rock/texture regions get a
// slightly stronger — but still near-invisible — scrim; already
// dark, calm artwork gets almost none.
//
// The artwork itself is never modified. This only tunes the
// presentation layer opacity.
//
// - Bundled local artwork is same-origin → canvas sampling always
//   works offline, with no network request.
// - Signed/remote URLs are attempted with crossOrigin="anonymous";
//   if the canvas taints or the image fails, we silently fall back
//   to the neutral default (1) so the UI is never worse than the
//   static scrim.
// ============================================================

import { useEffect, useState } from "react";

/** Neutral multiplier used before/without measurement. */
export const DEFAULT_SCRIM_INTENSITY = 1;

const MIN_INTENSITY = 0.62;
const MAX_INTENSITY = 1.32;

const cache = new Map<string, number>();
const inflight = new Map<string, Promise<number>>();

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Measure the lower band (the typographic zone) of an image and map
 * mean luminance + local contrast onto a scrim multiplier.
 */
async function measure(src: string): Promise<number> {
  const cached = cache.get(src);
  if (cached !== undefined) return cached;
  const existing = inflight.get(src);
  if (existing) return existing;

  const task = (async () => {
    try {
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();

      // Tiny sampling raster — cheap on low-end Android WebViews.
      const W = 24;
      const H = 24;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return DEFAULT_SCRIM_INTENSITY;
      ctx.drawImage(img, 0, 0, W, H);

      // Bottom 45% of the frame — where titles/descriptions live.
      const startY = Math.floor(H * 0.55);
      const { data } = ctx.getImageData(0, startY, W, H - startY);

      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l =
          (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        sum += l;
        sumSq += l * l;
        n++;
      }
      if (n === 0) return DEFAULT_SCRIM_INTENSITY;

      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      const contrast = Math.sqrt(variance); // 0 … ~0.5

      // Reference point: a comfortably dark region (mean ≈ 0.22) needs
      // the baseline scrim. Brighter or busier regions need a little
      // more; darker/calmer artwork needs less.
      const brightness = (mean - 0.22) * 1.35;
      const busy = (contrast - 0.14) * 0.9;
      return clamp(1 + brightness + busy, MIN_INTENSITY, MAX_INTENSITY);
    } catch {
      return DEFAULT_SCRIM_INTENSITY;
    }
  })();

  inflight.set(src, task);
  const value = await task;
  inflight.delete(src);
  cache.set(src, value);
  return value;
}

/**
 * React hook — returns the adaptive scrim multiplier for an artwork
 * URL. Always renders with the neutral baseline first, then refines
 * once the measurement resolves (no flash, no layout shift).
 */
export function useArtworkReadability(src: string | null | undefined): number {
  const [intensity, setIntensity] = useState<number>(() =>
    src ? cache.get(src) ?? DEFAULT_SCRIM_INTENSITY : DEFAULT_SCRIM_INTENSITY,
  );

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setIntensity(DEFAULT_SCRIM_INTENSITY);
      return;
    }
    const known = cache.get(src);
    if (known !== undefined) {
      setIntensity(known);
      return;
    }
    let alive = true;
    setIntensity(DEFAULT_SCRIM_INTENSITY);
    measure(src).then((v) => {
      if (alive) setIntensity(v);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  return intensity;
}
