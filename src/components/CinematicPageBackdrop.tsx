// Cinematic per-page header backdrop.
//
// Renders a subtle, desaturated historical artwork pinned to the top of the
// current AppShell column (max-w-md). Sits behind the HUD (which uses
// bg-background/70 + backdrop-blur), so the entire top section — including
// the status bar (hearts, dinars, XP, streak) — reads as a single premium
// cinematic header rather than a plain dark strip.
//
// Design constraints (Irth identity):
//   - No new colors. Only the existing dark navy background + gold parchment.
//   - Artwork is desaturated + low-contrast; a dark navy overlay (~70%)
//     keeps text 100% readable.
//   - A soft vertical gradient blends the image into the page body.
//   - A very subtle 8s Ken Burns zoom-in on load — automatically suppressed
//     via html.perf-lite (Android WebView, reduced-motion, low-end devices).
//
// Usage: render once, as the first child of the page component. The page's
// existing breadcrumbs / title / subtitle stay untouched and simply sit
// above this backdrop naturally.
import { memo } from "react";

type Props = {
  /** Static import URL for the artwork. */
  image: string;
  /** Descriptive alt for accessibility (kept off-screen — decorative). */
  alt?: string;
  /** Visible pixel height of the artwork band. Default 320. */
  height?: number;
};

function CinematicPageBackdropImpl({ image, alt = "", height = 320 }: Props) {
  return (
    <div
      aria-hidden={alt ? undefined : true}
      className="pointer-events-none fixed inset-x-0 top-0 z-[5] mx-auto w-full max-w-md overflow-hidden"
      style={{ height }}
    >
      {/* Artwork — desaturated, low contrast, subtle Ken Burns. */}
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className="animate-ken-burns absolute inset-0 bg-cover bg-center will-change-transform"
        style={{
          backgroundImage: `url(${image})`,
          filter: "saturate(0.55) contrast(0.9) brightness(0.75)",
        }}
      />
      {/* Dark navy overlay — matches app background token. */}
      <div className="absolute inset-0 bg-background/70" />
      {/* Soft vertical fade into page body — no harsh edge. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/50 to-background" />
      {/* Faint gold parchment vignette — ties the header to Irth palette. */}
      <div
        className="absolute inset-0 opacity-[0.09]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 0%, oklch(0.82 0.14 82 / 0.55), transparent 65%)",
        }}
      />
    </div>
  );
}

export const CinematicPageBackdrop = memo(CinematicPageBackdropImpl);
