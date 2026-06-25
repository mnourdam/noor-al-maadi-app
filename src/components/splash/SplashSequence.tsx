// ============================================================
// Irth Opening Sequence — Cinematic Splash
// ------------------------------------------------------------
// This is NOT a loading screen. It is the cinematic opening
// of Irth. It plays once per page-load while the app finishes
// initialising in the background and never artificially blocks.
//
// Timeline (target ~3.8s):
//   0.00s  Pure black.
//   0.20s  Soft golden glow blooms from centre.
//   0.50s  Artwork fades in + slow Ken Burns.
//   0.80s  Quote fades in (centred, elegant).
//   2.20s  Quote fades out.
//   2.60s  Artwork dims; golden light converges.
//   2.90s  Logo + tagline fade in.
//   3.80s  Splash dismisses, Home page revealed.
//
// If app initialisation takes longer than the timeline, the
// final logo state simply remains (with a subtle breathing
// glow) until ready. If init is faster, the timeline plays
// to completion smoothly — we never short-circuit.
//
// CSS-only animations. No animation library. APK-friendly.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { pickSplashQuote, type SplashQuote } from "./quoteProvider";
import { pickSplashArtwork, preloadImage, type SplashFraming } from "./artworkProvider";
import { playSplashSfx } from "./splashSfx";
import { SplashLogoReveal } from "./SplashLogoReveal";

const SESSION_FLAG = "irth.splash.played.v1";
const MIN_DURATION_MS = 3800;

interface SplashSequenceProps {
  /** Optional readiness flag. Splash will wait past MIN_DURATION_MS until true. */
  ready?: boolean;
}

export function SplashSequence({ ready = true }: SplashSequenceProps) {
  // SSR-safe: never render on the server, and skip if we've already played
  // this session (e.g. on client-side route navigations that re-mount root).
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"hidden" | "playing" | "fadeout">("hidden");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [quote, setQuote] = useState<SplashQuote | null>(null);
  const minDoneRef = useRef(false);

  // Decide on first client render whether to play.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let alreadyPlayed = false;
    try { alreadyPlayed = window.sessionStorage.getItem(SESSION_FLAG) === "1"; } catch { /* */ }
    if (alreadyPlayed) {
      setMounted(false);
      return;
    }
    try { window.sessionStorage.setItem(SESSION_FLAG, "1"); } catch { /* */ }
    setMounted(true);
  }, []);

  // Bootstrap quote + artwork + sfx once we've decided to play.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    let sfxCleanup: (() => void) | null = null;

    (async () => {
      const [pickedQuote, pickedArt] = await Promise.all([
        pickSplashQuote(),
        pickSplashArtwork(),
      ]);
      if (cancelled) return;
      setQuote(pickedQuote);
      if (pickedArt.url) {
        // Preload only the one selected artwork.
        await preloadImage(pickedArt.url);
        if (cancelled) return;
        setArtworkUrl(pickedArt.url);
      }
      // Start SFX as the golden bloom begins (~200ms into the timeline).
      window.setTimeout(() => {
        if (cancelled) return;
        sfxCleanup = playSplashSfx();
      }, 200);
      setPhase("playing");
    })();

    return () => {
      cancelled = true;
      sfxCleanup?.();
    };
  }, [mounted]);

  // Min-duration timer.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(() => { minDoneRef.current = true; tryDismiss(); }, MIN_DURATION_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // When app becomes ready AND min duration elapsed, fade out.
  useEffect(() => { tryDismiss(); }, [ready, phase]);

  function tryDismiss() {
    if (phase !== "playing") return;
    if (!minDoneRef.current) return;
    if (!ready) return;
    setPhase("fadeout");
    window.setTimeout(() => setMounted(false), 600);
  }

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      className={`splash-root fixed inset-0 z-[300] overflow-hidden bg-[#05080f] ${phase === "fadeout" ? "splash-root--out" : ""}`}
      style={{ pointerEvents: "none" }}
    >
      {/* Layer 1 — soft golden bloom from centre */}
      <div className="splash-bloom absolute inset-0" />

      {/* Layer 2 — artwork with slow Ken Burns (only when manifest non-empty) */}
      {artworkUrl ? (
        <div className="splash-artwork-wrap absolute inset-0">
          <div
            className="splash-artwork absolute inset-0 bg-center bg-cover"
            style={{ backgroundImage: `url(${artworkUrl})` }}
          />
          {/* Museum vignette + warm wash */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.85)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,22,0.35)_0%,rgba(8,12,22,0.05)_45%,rgba(8,12,22,0.55)_100%)]" />
        </div>
      ) : null}

      {/* Layer 3 — drifting dust particles (very subtle) */}
      <div className="splash-particles absolute inset-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`splash-dust splash-dust-${i % 7}`} />
        ))}
      </div>

      {/* Layer 4 — Quote */}
      <div className="absolute inset-0 flex items-center justify-center px-8" dir="rtl">
        <div className="splash-quote max-w-xl text-center">
          {quote ? (
            <>
              <p
                className="font-display text-balance text-[22px] leading-[1.7] text-[#f4e3b8] sm:text-[26px]"
                style={{ textShadow: "0 1px 18px rgba(0,0,0,0.55)" }}
              >
                «{quote.text}»
              </p>
              <p className="mt-4 text-[12px] tracking-[0.32em] text-[#d4af5a]/85">
                — {quote.author}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Layer 5 — Logo reveal */}
      <div className="splash-logo absolute inset-0 flex items-center justify-center">
        <SplashLogoReveal />
      </div>

      {/* Inline scoped keyframes — no animation libs, GPU-friendly props only */}
      <style>{`
        .splash-root { animation: splash-root-in 220ms ease-out both; }
        .splash-root--out { animation: splash-root-out 600ms ease-in both; }
        @keyframes splash-root-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes splash-root-out { from { opacity: 1; } to { opacity: 0; } }

        .splash-bloom {
          background: radial-gradient(circle at 50% 50%,
            rgba(212,175,90,0.32) 0%,
            rgba(212,175,90,0.10) 25%,
            rgba(5,8,15,0) 60%);
          opacity: 0;
          animation: splash-bloom-in 1200ms ease-out 200ms forwards,
                     splash-bloom-breathe 4s ease-in-out 1400ms infinite;
        }
        @keyframes splash-bloom-in { to { opacity: 1; } }
        @keyframes splash-bloom-breathe {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.05); }
        }

        .splash-artwork-wrap {
          opacity: 0;
          animation: splash-art-in 1000ms ease-out 500ms forwards,
                     splash-art-out 900ms ease-in 2600ms forwards;
        }
        @keyframes splash-art-in  { to { opacity: 1; } }
        @keyframes splash-art-out { to { opacity: 0.18; } }

        .splash-artwork {
          transform: scale(1.05);
          animation: splash-kenburns 6s ease-out 500ms forwards;
          will-change: transform;
        }
        @keyframes splash-kenburns {
          from { transform: scale(1.05) translate3d(0,0,0); }
          to   { transform: scale(1.16) translate3d(-1.5%, -1%, 0); }
        }

        .splash-quote {
          opacity: 0;
          animation: splash-quote-in 700ms ease-out 800ms forwards,
                     splash-quote-out 600ms ease-in 2200ms forwards;
        }
        @keyframes splash-quote-in  { from { opacity: 0; transform: translateY(8px); }
                                      to   { opacity: 1; transform: translateY(0); } }
        @keyframes splash-quote-out { from { opacity: 1; transform: translateY(0); }
                                      to   { opacity: 0; transform: translateY(-6px); } }

        .splash-logo {
          opacity: 0;
          animation: splash-logo-in 900ms ease-out 2900ms forwards;
        }
        @keyframes splash-logo-in { from { opacity: 0; transform: translateY(6px); }
                                    to   { opacity: 1; transform: translateY(0); } }

        .splash-logo-img    { animation: splash-logo-glow 3.6s ease-in-out 3300ms infinite; }
        @keyframes splash-logo-glow {
          0%,100% { filter: drop-shadow(0 0 22px rgba(212,175,90,0.35)); }
          50%     { filter: drop-shadow(0 0 36px rgba(212,175,90,0.65)); }
        }

        .splash-particles { pointer-events: none; }
        .splash-dust {
          position: absolute;
          width: 3px; height: 3px; border-radius: 9999px;
          background: rgba(244, 227, 184, 0.55);
          filter: blur(1px);
          opacity: 0;
          animation: splash-dust-rise 9s linear infinite;
          will-change: transform, opacity;
        }
        .splash-dust-0 { left: 8%;  top: 100%; animation-delay: 0.2s; }
        .splash-dust-1 { left: 22%; top: 100%; animation-delay: 1.1s; }
        .splash-dust-2 { left: 35%; top: 100%; animation-delay: 0.6s; }
        .splash-dust-3 { left: 48%; top: 100%; animation-delay: 2.0s; }
        .splash-dust-4 { left: 63%; top: 100%; animation-delay: 1.5s; }
        .splash-dust-5 { left: 78%; top: 100%; animation-delay: 0.4s; }
        .splash-dust-6 { left: 91%; top: 100%; animation-delay: 1.8s; }
        @keyframes splash-dust-rise {
          0%   { transform: translate3d(0, 0, 0)      scale(0.8); opacity: 0; }
          15%  { opacity: 0.65; }
          80%  { opacity: 0.45; }
          100% { transform: translate3d(8px, -110vh, 0) scale(1.1); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-bloom,
          .splash-artwork-wrap,
          .splash-artwork,
          .splash-quote,
          .splash-logo,
          .splash-logo-img,
          .splash-dust { animation: none !important; }
          .splash-bloom, .splash-artwork-wrap, .splash-quote, .splash-logo { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
