// ============================================================
// Cinematic Opening — Particle Layer
// ------------------------------------------------------------
// Very lightweight CSS-driven particle presets. No canvas, no
// per-frame JS, no external libraries. Intensity controls the
// number of particles and their opacity. Rendered above the
// image and below the text.
// ============================================================

import { memo, useMemo } from "react";
import type { ParticlePreset } from "@/lib/cinematic-opening/types";

interface Props {
  preset: ParticlePreset;
  intensity?: number; // 0..1
}

interface Particle {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

// Presets tuned for "cinematic polish" — extremely subtle, never
// resembling a game effect. Lower counts, lower alpha, longer drift.
const PRESETS: Record<ParticlePreset, {
  color: string;
  count: number;
  size: [number, number];
  duration: [number, number];
  blur: number;
  blend: string;
  peakOpacity: number; // upper opacity cap even at intensity=1
}> = {
  dust:  { color: "rgba(255,240,210,0.32)", count: 14, size: [1, 2],     duration: [14, 22], blur: 0.6, blend: "screen",   peakOpacity: 0.45 },
  gold:  { color: "rgba(212,175,90,0.42)",  count: 12, size: [1, 2.5],   duration: [12, 20], blur: 0.8, blend: "screen",   peakOpacity: 0.55 },
  fog:   { color: "rgba(220,220,230,0.05)", count: 4,  size: [220, 380], duration: [28, 42], blur: 50,  blend: "screen",   peakOpacity: 0.35 },
  smoke: { color: "rgba(60,50,45,0.14)",    count: 4,  size: [240, 400], duration: [32, 48], blur: 60,  blend: "multiply", peakOpacity: 0.35 },
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function ParticleLayerImpl({ preset, intensity = 0.4 }: Props) {
  const cfg = PRESETS[preset];
  const clamped = Math.max(0, Math.min(1, intensity));
  const count = Math.max(1, Math.round(cfg.count * clamped));

  const particles = useMemo<Particle[]>(() => {
    const rand = seededRandom(preset.charCodeAt(0) * 137 + count);
    return Array.from({ length: count }, () => ({
      left: rand() * 100,
      top: rand() * 100,
      size: cfg.size[0] + rand() * (cfg.size[1] - cfg.size[0]),
      delay: rand() * -cfg.duration[1],
      duration: cfg.duration[0] + rand() * (cfg.duration[1] - cfg.duration[0]),
      drift: (rand() - 0.5) * 40,
    }));
  }, [preset, count, cfg]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ mixBlendMode: cfg.blend as React.CSSProperties["mixBlendMode"] }}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: cfg.color,
            filter: `blur(${cfg.blur}px)`,
            opacity: cfg.peakOpacity * (0.55 + clamped * 0.45),
            animation: `cinematic-particle-drift ${p.duration}s linear ${p.delay}s infinite`,
            willChange: "transform, opacity",
            // @ts-expect-error CSS custom property
            "--drift-x": `${p.drift}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes cinematic-particle-drift {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          25%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { transform: translate3d(var(--drift-x, 0), -32px, 0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export const ParticleLayer = memo(ParticleLayerImpl);
