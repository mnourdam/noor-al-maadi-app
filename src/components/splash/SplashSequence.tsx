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
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { isFirstEverLaunch } from "@/lib/cinematic-opening/persistence";


const SESSION_FLAG = "irth.splash.played.v1";
// Persistent "recently warm" heartbeat — when the app was active within this
// window, treat the next mount as a warm resume (no splash). Covers the case
// where Android destroys the WebView/process while the user briefly switches
// apps: the player should still come back to where they left off.
const WARM_RESUME_KEY = "irth.lastActive.v1";
const WARM_RESUME_WINDOW_MS = 30 * 60 * 1000;
const MIN_DURATION_MS = 5000;
const FADE_OUT_MS = 700;

interface SplashSequenceProps {
  /** Optional readiness flag. Splash will wait past MIN_DURATION_MS until true. */
  ready?: boolean;
}

export function SplashSequence({ ready = true }: SplashSequenceProps) {
  const androidStable = isAndroidUltraStableMode();
  // Decide synchronously on first render whether to play. This avoids a frame
  // where the home page is visible before the splash overlay mounts (which on
  // Android caused: App UI → black → Splash → App).
  const [mounted, setMounted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (isAndroidUltraStableMode()) return false;
    // First-ever launch: the cinematic opening owns the entire canvas
    // (black → notification permission → opening → home). The branded
    // splash must not render on top of it.
    try { if (isFirstEverLaunch()) return false; } catch { /* */ }

    try {
      // Already played in this WebView session → never replay.
      if (window.sessionStorage.getItem(SESSION_FLAG) === "1") return false;
      // Warm resume (process may have been killed by OS but user just stepped
      // away for a moment) → skip the cinematic opening.
      const last = Number(window.localStorage.getItem(WARM_RESUME_KEY) || "0");
      if (last && Date.now() - last < WARM_RESUME_WINDOW_MS) {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
        return false;
      }
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch { /* */ }
    return true;
  });
  const [phase, setPhase] = useState<"hidden" | "playing" | "fadeout">("hidden");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [framing, setFraming] = useState<SplashFraming>("ken-burns");
  const [quote, setQuote] = useState<SplashQuote | null>(null);
  const minDoneRef = useRef(false);

  // Remove the native boot overlay (android-web/index.html) once React has
  // taken over rendering, so there's no double-fade or black flash.
  useEffect(() => {
    try {
      const el = document.getElementById("irth-boot-splash");
      if (el) el.parentNode?.removeChild(el);
    } catch { /* */ }
  }, [mounted, androidStable]);

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
        // Preload only the one selected artwork. Fall back gracefully on error.
        const ok = await preloadImage(pickedArt.url);
        if (cancelled) return;
        if (ok) {
          setFraming(pickedArt.framing);
          setArtworkUrl(pickedArt.url);
        }
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
    window.setTimeout(() => setMounted(false), FADE_OUT_MS);
  }

  if (!mounted) return null;

  return (
    <div
      data-irth-splash=""
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
            className={`splash-artwork splash-artwork--${framing} absolute inset-0 bg-center bg-cover`}
            style={{ backgroundImage: `url(${artworkUrl})` }}
          />
          {/* Museum vignette + warm wash + soft atmospheric haze */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.45)_72%,rgba(0,0,0,0.82)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,22,0.30)_0%,rgba(8,12,22,0.05)_45%,rgba(8,12,22,0.55)_100%)]" />
          <div className="splash-haze absolute inset-0" />
        </div>
      ) : null}

      {/* Layer 3 — drifting dust particles (very subtle) */}
      <div className="splash-particles absolute inset-0">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`splash-dust splash-dust-${i % 7}`} />
        ))}
      </div>

      {/* Layer 4 — Centered stack: Logo · Quote · Author */}
      <div className="absolute inset-0 flex items-center justify-center px-8" dir="rtl">
        <div className="flex flex-col items-center text-center max-w-xl">
          <div className="splash-logo">
            <SplashLogoReveal />
          </div>
          {quote ? (
            <div className="splash-quote mt-8 font-display">
              <p
                className="text-balance text-[22px] leading-[1.85] text-[#f4e3b8] sm:text-[26px]"
                style={{ textShadow: "0 1px 18px rgba(0,0,0,0.6)" }}
              >
                «{quote.text}»
              </p>
              <p className="mt-4 text-[12px] tracking-[0.32em] text-[#d4af5a]/85">
                — {quote.author}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Inline scoped keyframes — no animation libs, GPU-friendly props only */}
      <style>{`
        .splash-root { animation: splash-root-in 220ms ease-out both; }
        .splash-root--out { animation: splash-root-out 700ms ease-in both; }
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
          animation: splash-art-in 900ms ease-out 300ms forwards;
        }
        @keyframes splash-art-in  { to { opacity: 1; } }

        /* Base artwork — no animation here, framing class supplies the move.
           Slight oversize ensures every portrait screen is fully filled with
           a 16:9 source via object-fit: cover (background-size: cover). */
        .splash-artwork {
          transform: scale(1.14) translate3d(0,0,0);
          will-change: transform;
          backface-visibility: hidden;
        }

        /* Cinematic framings — each one is a different camera shot.
           Durations are long (7s) and easing is calm so motion is barely
           perceptible. GPU-only props (transform). */
        .splash-artwork--zoom-in   { animation: sp-zoom-in   7s ease-out 500ms forwards; }
        .splash-artwork--zoom-out  { animation: sp-zoom-out  7s ease-out 500ms forwards; }
        .splash-artwork--pan-up    { animation: sp-pan-up    7s ease-out 500ms forwards; }
        .splash-artwork--pan-down  { animation: sp-pan-down  7s ease-out 500ms forwards; }
        .splash-artwork--pan-left  { animation: sp-pan-left  7s ease-out 500ms forwards; }
        .splash-artwork--pan-right { animation: sp-pan-right 7s ease-out 500ms forwards; }
        .splash-artwork--reveal-tl { animation: sp-reveal-tl 7s ease-out 500ms forwards; }
        .splash-artwork--reveal-tr { animation: sp-reveal-tr 7s ease-out 500ms forwards; }
        .splash-artwork--reveal-bl { animation: sp-reveal-bl 7s ease-out 500ms forwards; }
        .splash-artwork--reveal-br { animation: sp-reveal-br 7s ease-out 500ms forwards; }
        .splash-artwork--ken-burns { animation: sp-kenburns  7s ease-out 500ms forwards; }

        @keyframes sp-zoom-in    { from { transform: scale(1.14) translate3d(0,0,0); }
                                   to   { transform: scale(1.22) translate3d(0,0,0); } }
        @keyframes sp-zoom-out   { from { transform: scale(1.22) translate3d(0,0,0); }
                                   to   { transform: scale(1.14) translate3d(0,0,0); } }
        @keyframes sp-pan-up     { from { transform: scale(1.18) translate3d(0, 2.5%, 0); }
                                   to   { transform: scale(1.18) translate3d(0,-2.5%, 0); } }
        @keyframes sp-pan-down   { from { transform: scale(1.18) translate3d(0,-2.5%, 0); }
                                   to   { transform: scale(1.18) translate3d(0, 2.5%, 0); } }
        @keyframes sp-pan-left   { from { transform: scale(1.18) translate3d( 2.5%,0,0); }
                                   to   { transform: scale(1.18) translate3d(-2.5%,0,0); } }
        @keyframes sp-pan-right  { from { transform: scale(1.18) translate3d(-2.5%,0,0); }
                                   to   { transform: scale(1.18) translate3d( 2.5%,0,0); } }
        @keyframes sp-reveal-tl  { from { transform: scale(1.24) translate3d( 2%, 2%,0); }
                                   to   { transform: scale(1.14) translate3d(-1%,-1%,0); } }
        @keyframes sp-reveal-tr  { from { transform: scale(1.24) translate3d(-2%, 2%,0); }
                                   to   { transform: scale(1.14) translate3d( 1%,-1%,0); } }
        @keyframes sp-reveal-bl  { from { transform: scale(1.24) translate3d( 2%,-2%,0); }
                                   to   { transform: scale(1.14) translate3d(-1%, 1%,0); } }
        @keyframes sp-reveal-br  { from { transform: scale(1.24) translate3d(-2%,-2%,0); }
                                   to   { transform: scale(1.14) translate3d( 1%, 1%,0); } }
        @keyframes sp-kenburns   { from { transform: scale(1.14) translate3d(0,0,0); }
                                   to   { transform: scale(1.20) translate3d(-1.5%,-1%,0); } }

        /* Soft atmospheric haze drifting across the artwork. */
        .splash-haze {
          background: radial-gradient(ellipse at 30% 40%, rgba(244,227,184,0.10), transparent 55%),
                      radial-gradient(ellipse at 70% 65%, rgba(212,175,90,0.08), transparent 60%);
          mix-blend-mode: screen;
          opacity: 0;
          animation: sp-haze-in 1400ms ease-out 700ms forwards;
        }
        @keyframes sp-haze-in { to { opacity: 1; } }

        .splash-logo {
          opacity: 0;
          animation: splash-logo-in 900ms ease-out 800ms forwards;
        }
        @keyframes splash-logo-in { from { opacity: 0; transform: translateY(8px); }
                                    to   { opacity: 1; transform: translateY(0); } }

        .splash-quote {
          opacity: 0;
          animation: splash-quote-in 1000ms ease-out 1200ms forwards;
        }
        @keyframes splash-quote-in { from { opacity: 0; transform: translateY(8px); }
                                     to   { opacity: 1; transform: translateY(0); } }

        .splash-logo-img { animation: splash-logo-glow 3.6s ease-in-out 1600ms infinite; }
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
