// ============================================================
// Cinematic Opening — Scene Renderer
// ------------------------------------------------------------
// Renders a single scene: image (optional Ken Burns), overlay,
// particles, title/subtitle with configurable fade-in/out.
// Purely presentational — driven entirely by the scene object.
// ============================================================

import { memo, useEffect, useState } from "react";
import type { CinematicScene, RichTextSegment, SceneTransition } from "@/lib/cinematic-opening/types";
import { ParticleLayer } from "./ParticleLayer";

const GOLD = "#F4D98B";

function renderSegments(segments: RichTextSegment[] | undefined, fallback: string | undefined) {
  if (segments && segments.length > 0) {
    return segments.map((seg, i) => (
      <span
        key={i}
        style={seg.highlight ? { color: GOLD } : undefined}
      >
        {seg.text}
      </span>
    ));
  }
  return fallback ?? null;
}


interface Props {
  scene: CinematicScene;
  /** True when this scene is the active one on screen. */
  active: boolean;
  /** True while the sequence is fading out (skip / final). */
  fadingOut: boolean;
  /** When true, disable Ken Burns and particles; keep simple fades. */
  reducedMotion?: boolean;
}

// Cinematic easing — smooth acceleration and deceleration.
// Never "instant", never mechanical.
const CINEMATIC_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function transitionStyle(t: SceneTransition | undefined, active: boolean, fadingOut: boolean): React.CSSProperties {
  const kind = t ?? "crossfade";
  // Every scene fades. "cut" is intentionally softened to a short crossfade
  // so the sequence never has an abrupt visual jump.
  const durationMs =
    kind === "fade-from-black" || kind === "fade-to-black" ? 1800 :
    kind === "cut" ? 600 : 1600;
  return {
    opacity: active && !fadingOut ? 1 : 0,
    transition: `opacity ${durationMs}ms ${CINEMATIC_EASE}`,
    willChange: "opacity",
  };
}

function SceneRendererImpl({ scene, active, fadingOut, reducedMotion }: Props) {
  const [titleVisible, setTitleVisible] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(false);

  useEffect(() => {
    if (!active) { setTitleVisible(false); setSubtitleVisible(false); return; }
    const delay = Math.max(0, scene.textDelayMs ?? 400);
    const subDelay = Math.max(0, scene.subtitleDelayMs ?? 700);
    const t1 = window.setTimeout(() => setTitleVisible(true), delay);
    const t2 = window.setTimeout(() => setSubtitleVisible(true), delay + subDelay);
    let t3: number | undefined;
    let t4: number | undefined;
    const hold = scene.textHoldMs;
    if (typeof hold === "number" && hold > 0) {
      t3 = window.setTimeout(() => setSubtitleVisible(false), delay + hold);
      t4 = window.setTimeout(() => setTitleVisible(false), delay + hold + 200);
    }
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      if (t3) window.clearTimeout(t3);
      if (t4) window.clearTimeout(t4);
    };
  }, [active, scene.textDelayMs, scene.textHoldMs, scene.subtitleDelayMs, scene.id]);

  const overlay = Math.max(0, Math.min(1, scene.overlayDarkness ?? 0));
  const kenBurns = scene.kenBurns !== false && !reducedMotion;
  const showParticles = !!scene.particles && !reducedMotion;
  const hasTitle = !!(scene.title || (scene.titleSegments && scene.titleSegments.length));
  const hasSubtitle = !!(scene.subtitle || (scene.subtitleSegments && scene.subtitleSegments.length));
  const hasText = hasTitle || hasSubtitle;


  return (
    <div
      className="absolute inset-0"
      style={transitionStyle(active ? scene.transitionIn : scene.transitionOut, active, fadingOut)}
      aria-hidden={!active}
    >
      {/* Image band */}
      {scene.image && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            role={scene.imageAlt ? "img" : undefined}
            aria-label={scene.imageAlt || undefined}
            className={`absolute inset-0 bg-cover bg-center ${kenBurns ? "cinematic-kenburns" : ""}`}
            style={{ backgroundImage: `url(${scene.image})` }}
          />
        </div>
      )}

      {/* Dark overlay */}
      {overlay > 0 && (
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />
      )}

      {/* Particles */}
      {showParticles && scene.particles && (
        <ParticleLayer preset={scene.particles} intensity={scene.particleIntensity} />
      )}

      {/* Top-left historical / date label */}
      {scene.contextLabel && (
        <div
          dir="rtl"
          className="pointer-events-none absolute top-0 right-0 px-5 py-3 text-[11px] font-medium tracking-[0.18em] text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)] sm:text-xs"
          style={{
            paddingTop: "max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))",
            paddingRight: "max(1.25rem, env(safe-area-inset-right))",
            opacity: active && !fadingOut ? 1 : 0,
            transition: "opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <span style={{ color: GOLD }}>{scene.contextLabel}</span>
        </div>
      )}


      {/* Subtle readability gradient — only when there is text to read. */}
      {hasText && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 100%)",
            opacity: titleVisible || subtitleVisible ? 1 : 0,
            transition: "opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Text */}
      {hasText && (
        <div
          dir="rtl"
          className="absolute inset-x-0 bottom-0 flex flex-col items-center px-8 text-center"
          style={{
            paddingBottom: "max(6rem, calc(env(safe-area-inset-bottom) + 5rem))",
          }}
        >
          {hasTitle && (
            <h1
              className="font-display text-3xl font-bold leading-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)] sm:text-4xl"
              style={{
                opacity: titleVisible ? 1 : 0,
                transform: titleVisible ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1), transform 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "opacity, transform",
              }}
            >
              {renderSegments(scene.titleSegments, scene.title)}
            </h1>
          )}
          {hasSubtitle && (
            <p
              className="mt-3 max-w-md text-sm leading-relaxed text-white/90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.65)] sm:text-base"
              style={{
                opacity: subtitleVisible ? 1 : 0,
                transform: subtitleVisible ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1), transform 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "opacity, transform",
              }}
            >
              {renderSegments(scene.subtitleSegments, scene.subtitle)}
            </p>
          )}
        </div>
      )}



      <style>{`
        .cinematic-kenburns {
          /* Gentle, eased camera drift. Starts and ends softly — never
             snaps into motion, never stops abruptly. GPU-only transform. */
          animation: cinematic-kenburns 18s cubic-bezier(0.37, 0, 0.63, 1) both;
          transform-origin: center 55%;
          will-change: transform;
          backface-visibility: hidden;
        }
        @keyframes cinematic-kenburns {
          0%   { transform: scale(1.045) translate3d(0, 0.4%, 0); }
          100% { transform: scale(1.13)  translate3d(0, -1.6%, 0); }
        }
      `}</style>
    </div>
  );
}

export const SceneRenderer = memo(SceneRendererImpl);
