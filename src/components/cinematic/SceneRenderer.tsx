// ============================================================
// Cinematic Opening — Scene Renderer
// ------------------------------------------------------------
// Renders a single scene: image (optional Ken Burns), overlay,
// particles, title/subtitle with configurable fade-in/out.
// Purely presentational — driven entirely by the scene object.
// ============================================================

import { memo, useEffect, useState } from "react";
import type { CinematicScene, SceneTransition } from "@/lib/cinematic-opening/types";
import { ParticleLayer } from "./ParticleLayer";

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
  const [textVisible, setTextVisible] = useState(false);

  useEffect(() => {
    if (!active) { setTextVisible(false); return; }
    const delay = Math.max(0, scene.textDelayMs ?? 400);
    const inTimer = window.setTimeout(() => setTextVisible(true), delay);
    let outTimer: number | undefined;
    const hold = scene.textHoldMs;
    if (typeof hold === "number" && hold > 0) {
      outTimer = window.setTimeout(() => setTextVisible(false), delay + hold);
    }
    return () => {
      window.clearTimeout(inTimer);
      if (outTimer) window.clearTimeout(outTimer);
    };
  }, [active, scene.textDelayMs, scene.textHoldMs, scene.id]);

  const overlay = Math.max(0, Math.min(1, scene.overlayDarkness ?? 0));
  const kenBurns = scene.kenBurns !== false && !reducedMotion;
  const showParticles = !!scene.particles && !reducedMotion;

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

      {/* Text */}
      {(scene.title || scene.subtitle) && (
        <div
          dir="rtl"
          className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end px-8 pb-24 text-center"
          style={{
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 900ms ease-out, transform 900ms ease-out",
          }}
        >
          {scene.title && (
            <h1 className="font-display text-3xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
              {scene.title}
            </h1>
          )}
          {scene.subtitle && (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
              {scene.subtitle}
            </p>
          )}
        </div>
      )}

      <style>{`
        .cinematic-kenburns {
          animation: cinematic-kenburns 16s ease-out both;
          transform-origin: center center;
        }
        @keyframes cinematic-kenburns {
          0%   { transform: scale(1.05) translate3d(0, 0, 0); }
          100% { transform: scale(1.15) translate3d(0, -1.5%, 0); }
        }
      `}</style>
    </div>
  );
}

export const SceneRenderer = memo(SceneRendererImpl);
