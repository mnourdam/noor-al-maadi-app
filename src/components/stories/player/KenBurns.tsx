// ============================================================
// KenBurns — subtle drift/zoom wrapper for a full-bleed image.
// Direction seeded from a stable hash so scenes vary naturally.
// ============================================================

import { useMemo } from "react";
import { sceneHash } from "./timing";

interface Props {
  src: string | null | undefined;
  alt: string;
  seed: string;
  className?: string;
  overlay?: "vignette" | "bottom-fade" | "none";
  blur?: number;
}

export function KenBurns({ src, alt, seed, className, overlay = "bottom-fade", blur }: Props) {
  const style = useMemo(() => {
    const h = sceneHash(seed);
    const dx = (((h & 0xf) - 8) / 8) * 4;        // -4%..+4%
    const dy = (((h >> 4) & 0xf) - 8) / 8 * 3;   // -3%..+3%
    const zoomIn = (h >> 8) & 1;
    const from = zoomIn ? 1.02 : 1.08;
    const to = zoomIn ? 1.10 : 1.00;
    const name = `kb-${(h % 8).toString(36)}`;
    const keyframes = `@keyframes ${name} {
      0%   { transform: scale(${from}) translate(0%, 0%); }
      100% { transform: scale(${to}) translate(${dx}%, ${dy}%); }
    }`;
    return { name, keyframes };
  }, [seed]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <style>{style.keyframes}</style>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
          style={{
            animation: `${style.name} 14s ease-out both`,
            filter: blur ? `blur(${blur}px)` : undefined,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-black via-neutral-900 to-black" />
      )}
      {overlay === "bottom-fade" && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
      )}
      {overlay === "vignette" && (
        <div className="pointer-events-none absolute inset-0" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)"
        }} />
      )}
    </div>
  );
}
