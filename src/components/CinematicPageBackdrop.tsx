// Cinematic per-page header backdrop.
//
// Renders a historical artwork pinned to the top of the current AppShell
// column (max-w-md). Sits behind the HUD so the entire top section reads
// as one coherent cinematic header rather than a plain dark strip.
//
// Design goals (world-class polish):
//   1. Artwork is clearly visible — desaturated only lightly so the user
//      immediately notices the scene while the title stays readable.
//   2. No hard edges. Bottom fade extends deep so the image dissolves
//      into the page background instead of ending in a visible line.
//      Radial side masks soften the left/right seams into the column.
//   3. Subtle parallax — the artwork translates at ~30% of scroll speed
//      so the header feels layered without any exaggerated motion.
//      Automatically disabled on `perf-lite` (low-end Android / reduced
//      motion) via a single passive rAF-throttled scroll listener.
//   4. Zero new colors. Only navy background + gold parchment vignette.
//
// Stacking model:
//   Portalled to <body> at z-10. AppShell content column sits at z-20
//   (transparent by default so the backdrop shows through the top gap)
//   and the HUD stays sticky at z-40 with its bg-background/70 overlay.
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Static import URL for the artwork. */
  image: string;
  /** Descriptive alt for accessibility. Empty = purely decorative. */
  alt?: string;
  /** Visible pixel height of the artwork band. Default 380. */
  height?: number;
};

function CinematicPageBackdropImpl({ image, alt = "", height = 380 }: Props) {
  const [mounted, setMounted] = useState(false);
  const imageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Subtle parallax: translate the artwork at ~30% scroll speed.
  // Skipped when perf-lite is active (Android freeze mode / reduced motion).
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (root.classList.contains("perf-lite")) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;
    const apply = () => {
      ticking = false;
      const el = imageRef.current;
      if (!el) return;
      // Cap the offset so the image never scrolls beyond its own band.
      const y = Math.min(window.scrollY * 0.28, height * 0.35);
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mounted, height]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-hidden={alt ? undefined : true}
      className="pointer-events-none fixed inset-x-0 top-0 z-10 mx-auto w-full max-w-md md:max-w-3xl xl:max-w-5xl"
      style={{ height }}
    >
      {/* Artwork band — hides overflow so parallax translate stays inside. */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Artwork layer — parallax target + gentle Ken Burns. */}
        <div
          ref={imageRef}
          className="absolute inset-0 will-change-transform"
        >
          <div
            role={alt ? "img" : undefined}
            aria-label={alt || undefined}
            className="animate-ken-burns absolute -inset-y-6 inset-x-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${image})`,
              filter: "saturate(0.72) contrast(1.02) brightness(0.9)",
            }}
          />
        </div>

        {/* Warm navy tint — unifies artwork with the Irth palette without
            crushing detail. Much lighter than the previous 70% wash. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, oklch(0.14 0.03 260 / 0.28) 0%, oklch(0.14 0.03 260 / 0.35) 45%, oklch(0.14 0.03 260 / 0.62) 78%, var(--background) 100%)",
          }}
        />

        {/* Deep bottom fade — extends the last third into pure background so
            the artwork dissolves gradually. No visible seam. */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, var(--background) 92%)",
          }}
        />

        {/* Side vignettes — soften the left/right edges against the column
            gutter so the image never feels like a hard rectangle. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 130% 100% at 50% 40%, transparent 55%, oklch(0.10 0.02 260 / 0.55) 100%)",
          }}
        />

        {/* Faint gold parchment glow — ties the header to Irth identity. */}
        <div
          className="absolute inset-x-0 top-0 h-2/3 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 0%, oklch(0.82 0.14 82 / 0.65), transparent 65%)",
          }}
        />

        {/* Micro grain — 1px repeating dots at ~4% keep the image from
            feeling like a flat JPEG on OLED. Rendered as CSS to avoid an
            extra network asset. */}
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export const CinematicPageBackdrop = memo(CinematicPageBackdropImpl);
