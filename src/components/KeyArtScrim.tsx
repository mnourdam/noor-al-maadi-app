// ============================================================
// <KeyArtScrim /> — canonical Key Art readability layer.
// ------------------------------------------------------------
// One presentation-layer component for EVERY surface that puts
// typography on top of campaign Key Art. It never touches the
// artwork: no filters on the image, no darkening pass, no crop.
//
// It composes four near-invisible layers:
//
//   1. Cinematic gradient — a many-stop, eased top→bottom ramp
//      (no banding, no visible edge) that only becomes meaningful
//      in the lower third where the text lives.
//   2. Localized vignette — a soft radial ellipse anchored on the
//      text block, so brightness is pulled down exactly where the
//      words are and nowhere else.
//   3. Micro glass — a 3px backdrop blur masked to fade out well
//      before it reaches the focal area of the painting. Kills
//      busy rock/foliage texture under small type without any
//      visible rectangle.
//   4. Adaptive intensity — every layer is multiplied by a factor
//      measured from the artwork's own lower band, so dark, calm
//      paintings get almost nothing and bright, high-contrast ones
//      get just a touch more.
//
// Rules: image stays the hero, overlay stays imperceptible, no
// heavy black filter, no washed-out artwork, no hard rectangles.
// ============================================================

import { useArtworkReadability } from "@/lib/artwork-readability";

export type KeyArtScrimVariant = "hero" | "card" | "detail";

interface Props {
  /** Artwork URL — used for adaptive measurement only. */
  src?: string | null;
  variant?: KeyArtScrimVariant;
  /** Manual trim on top of the adaptive factor (0.5 – 1.5). */
  strength?: number;
  className?: string;
}

/** Per-surface base alphas, tuned against the frozen Key Art library. */
const BASE: Record<KeyArtScrimVariant, { ramp: number; vignette: number; blur: number; reach: number }> = {
  // Full-bleed home hero: tall frame, text pinned to the bottom.
  hero:   { ramp: 0.74, vignette: 0.34, blur: 0.9, reach: 0.42 },
  // Short banner cards (Continue Journey): text sits just below the
  // image, so the ramp only has to protect the last sliver.
  card:   { ramp: 0.58, vignette: 0.20, blur: 0.55, reach: 0.30 },
  // Campaign detail header: copy covers most of the block, so the
  // ramp starts earlier but stays gentle throughout.
  detail: { ramp: 0.80, vignette: 0.30, blur: 0.7, reach: 0.62 },
};

/** Smooth, many-stop ramp — eliminates the hard "gradient edge". */
function rampLayer(alpha: number, reach: number) {
  const start = Math.round((1 - reach) * 100);
  const stop = (frac: number, mul: number) =>
    `color-mix(in oklab, var(--scrim) ${(alpha * mul * 100).toFixed(1)}%, transparent) ${(
      start + (100 - start) * frac
    ).toFixed(1)}%`;
  return `linear-gradient(to bottom, transparent ${start}%, ${stop(0.18, 0.05)}, ${stop(
    0.36,
    0.16,
  )}, ${stop(0.54, 0.34)}, ${stop(0.72, 0.56)}, ${stop(0.88, 0.76)}, ${stop(1, 1)})`;
}

export function KeyArtScrim({ src, variant = "hero", strength = 1, className = "" }: Props) {
  const adaptive = useArtworkReadability(src);
  const k = adaptive * strength;
  const base = BASE[variant];

  const rampAlpha = Math.min(0.9, base.ramp * k);
  const vignetteAlpha = Math.min(0.5, base.vignette * k);
  const blurOpacity = Math.min(1, base.blur * k);

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ transition: "opacity 600ms ease" }}
    >
      {/* 1 + 2 — eased ramp with a localized radial vignette behind the text block. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            `radial-gradient(125% 72% at 50% 106%, color-mix(in oklab, var(--scrim) ${(
              vignetteAlpha * 100
            ).toFixed(1)}%, transparent) 0%, transparent 68%)`,
            rampLayer(rampAlpha, base.reach),
          ].join(", "),
        }}
      />
      {/* 3 — micro glass, masked so it never forms a visible edge. */}
      <div
        className="absolute inset-0 backdrop-blur-[3px]"
        style={{
          opacity: blurOpacity,
          maskImage:
            "linear-gradient(to bottom, transparent 62%, rgba(0,0,0,0.35) 78%, rgba(0,0,0,0.85) 92%, rgba(0,0,0,1) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 62%, rgba(0,0,0,0.35) 78%, rgba(0,0,0,0.85) 92%, rgba(0,0,0,1) 100%)",
        }}
      />
    </div>
  );
}
