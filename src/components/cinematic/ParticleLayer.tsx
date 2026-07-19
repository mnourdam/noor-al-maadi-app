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

const PRESETS: Record<ParticlePreset, {
  color: string;
  count: number;
  size: [number, number];
  duration: [number, number];
  blur: number;
  blend: string;
}> = {
  dust:  { color: "rgba(255,240,210,0.55)", count: 22, size: [1, 2], duration: [9, 16], blur: 0.4, blend: "screen" },
  gold:  { color: "rgba(212,175,90,0.75)",  count: 18, size: [1, 3], duration: [8, 14], blur: 0.6, blend: "screen" },
  fog:   { color: "rgba(220,220,230,0.10)", count: 6,  size: [180, 320], duration: [22, 32], blur: 40,  blend: "screen" },
  smoke: { color: "rgba(60,50,45,0.28)",    count: 5,  size: [200, 360], duration: [26, 40], blur: 50,  blend: "multiply" },
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
            opacity: 0.5 + clamped * 0.5,
            animation: `cinematic-particle-drift ${p.duration}s linear ${p.delay}s infinite`,
            // @ts-expect-error CSS custom property
            "--drift-x": `${p.drift}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes cinematic-particle-drift {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift-x, 0), -40px, 0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export const ParticleLayer = memo(ParticleLayerImpl);
