/**
 * <CachedImage> — <img> wrapper that resolves the src through the offline
 * image cache. Renders nothing (or an optional fallback) while resolving
 * or when the image can't be fetched offline.
 */
import { ImgHTMLAttributes, ReactNode } from "react";
import { useCachedImageSrc } from "@/lib/image-cache";

export type CachedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  fallback?: ReactNode;
};

export function CachedImage({ src, fallback = null, alt = "", decoding = "async", ...rest }: CachedImageProps) {
  const resolved = useCachedImageSrc(src ?? null);
  if (!resolved) return <>{fallback}</>;
  return <img src={resolved} alt={alt} decoding={decoding} {...rest} />;
}
