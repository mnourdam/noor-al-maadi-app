/**
 * <SafeHeroImage> — renders an entity's hero image ONLY after it has
 * successfully loaded. If the URL is missing, the file cannot be found,
 * the browser fails to decode it, or the app is offline without a cache
 * hit, the component renders `null` and the parent falls back to its
 * original no-image layout (as required by the encyclopedia image spec).
 *
 * We intentionally do NOT reserve layout space until the image is proven
 * usable — that guarantees "no image" and "image failed" look identical
 * to the original design, with no broken icon or blank placeholder.
 *
 * Offline support is layered through the existing `image-cache`
 * infrastructure via `useCachedImageSrc`, so images previously seen
 * online remain available in the APK WebView while offline.
 */
import { ImgHTMLAttributes, useEffect, useState } from "react";
import { useCachedImageSrc } from "@/lib/image-cache";

export interface SafeHeroImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError"> {
  src: string | null | undefined;
  alt: string;
  /** Called once with the final load state so the parent can enable its
   *  image-aware layout (dark overlay, gradient, etc.) only on success. */
  onReady?: (ok: boolean) => void;
}

export function SafeHeroImage({ src, alt, onReady, className, ...rest }: SafeHeroImageProps) {
  const resolved = useCachedImageSrc(src ?? null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">(src ? "loading" : "idle");

  // If the src prop changes, reset the gate.
  useEffect(() => {
    if (!src) { setState("idle"); onReady?.(false); return; }
    setState("loading");
  }, [src, onReady]);

  // Preload via a detached <img> so we only mount the visible node on success.
  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (cancelled) return;
      setState("ready");
      onReady?.(true);
    };
    probe.onerror = () => {
      if (cancelled) return;
      setState("failed");
      onReady?.(false);
    };
    probe.src = resolved;
    return () => { cancelled = true; probe.onload = probe.onerror = null; };
  }, [resolved, onReady]);

  if (!src || !resolved || state !== "ready") return null;
  return <img src={resolved} alt={alt} className={className} {...rest} />;
}
