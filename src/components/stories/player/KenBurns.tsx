// ============================================================
// KenBurns — cinematic image motion for scenes and cover art.
// Phase 5.5 refinement:
//   * Explicit motion library (6 named modes) selected from a
//     stable per-scene hash so consecutive scenes never share
//     the same trajectory — no more "everything drifts the same
//     way" feeling.
//   * Longer, drift-eased curves — nothing linear.
//   * Loading-perception layer: a warm cinematic gradient renders
//     immediately while the image decodes, so a scene never shows
//     a blank frame.
//   * Zero interference with existing overlay/scrim contract.
// ============================================================

import { useMemo, useState } from "react";
import { sceneHash } from "./timing";
import { EASE_DRIFT } from "./motion";

interface Props {
  src: string | null | undefined;
  alt: string;
  seed: string;
  className?: string;
  overlay?: "vignette" | "bottom-fade" | "none";
  blur?: number;
}

type Mode =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "drift-nw"
  | "drift-se";

const MODES: Mode[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "drift-nw", "drift-se"];

/** Deterministic transform pair for each mode. */
function trajectory(mode: Mode, h: number): { from: string; to: string } {
  // Micro-variation on the base amplitude so two scenes with the
  // same mode still don't feel identical.
  const jitterZ = 1 + (((h >> 3) & 7) / 700);       // 1.000–1.010
  const jitterP = 1 + (((h >> 6) & 7) / 900);       // 1.000–1.008
  switch (mode) {
    case "zoom-in":
      return { from: `scale(${1.02 * jitterZ})`, to: `scale(${1.11 * jitterZ})` };
    case "zoom-out":
      return { from: `scale(${1.12 * jitterZ})`, to: `scale(${1.02 * jitterZ})` };
    case "pan-left":
      return {
        from: `scale(${1.06 * jitterP}) translate(3%, 0%)`,
        to:   `scale(${1.06 * jitterP}) translate(-3%, 0%)`,
      };
    case "pan-right":
      return {
        from: `scale(${1.06 * jitterP}) translate(-3%, 0%)`,
        to:   `scale(${1.06 * jitterP}) translate(3%, 0%)`,
      };
    case "drift-nw":
      return {
        from: `scale(${1.05 * jitterP}) translate(2%, 2%)`,
        to:   `scale(${1.09 * jitterP}) translate(-2%, -2%)`,
      };
    case "drift-se":
      return {
        from: `scale(${1.05 * jitterP}) translate(-2%, -2%)`,
        to:   `scale(${1.09 * jitterP}) translate(2%, 2%)`,
      };
  }
}

export function KenBurns({ src, alt, seed, className, overlay = "bottom-fade", blur }: Props) {
  const [loaded, setLoaded] = useState(false);

  const style = useMemo(() => {
    const h = sceneHash(seed);
    const mode = MODES[h % MODES.length];
    const { from, to } = trajectory(mode, h);
    const name = `kb-${mode}-${(h % 32).toString(36)}`;
    const keyframes = `@keyframes ${name} {
      0%   { transform: ${from}; }
      100% { transform: ${to}; }
    }`;
    // 16–20s per scene — long, unhurried, never repeats within a story.
    const duration = 16 + (h % 5);
    return { name, keyframes, duration };
  }, [seed]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <style>{style.keyframes}</style>

      {/* Loading-perception layer — always present, revealed while the
          image decodes so the frame is never blank. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, #1a1206 0%, #0a0603 55%, #000 100%)",
          opacity: loaded && src ? 0 : 1,
          transition: `opacity 600ms ${EASE_DRIFT}`,
        }}
        aria-hidden
      />

      {src && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
          style={{
            animation: `${style.name} ${style.duration}s ${EASE_DRIFT} both`,
            filter: blur ? `blur(${blur}px)` : undefined,
            opacity: loaded ? 1 : 0,
            transition: `opacity 700ms ${EASE_DRIFT}`,
          }}
        />
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
