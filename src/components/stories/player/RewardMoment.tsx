// ============================================================
// RewardMoment — cinematic completion celebration.
// Phase 5 polish:
//   * softer timing curve (hold → bloom → count → settle)
//   * eased particle burst on a golden bezier
//   * eased count-up (easeOutQuint) with tabular numerics
//   * short "أحسنت" title lands with the numbers
//   * sound sync — chime plays once at bloom, not on count-only
//   * silent mode kept for replay (never celebrates twice)
// Contract: renders exactly once per completion and calls onDone
//           when the celebration has settled.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  xp: number;
  dinars: number;
  onDone: () => void;
  /** Suppress the reward numbers (e.g. replay). Still holds & fades. */
  silent?: boolean;
}

const HOLD_MS = 650;
const BLOOM_MS = 260;
const COUNT_MS = 1600;
const TAIL_MS = 900;

const easeOutQuint = (p: number) => 1 - Math.pow(1 - p, 5);

export function RewardMoment({ xp, dinars, onDone, silent }: Props) {
  const [phase, setPhase] = useState<"hold" | "bloom" | "count" | "tail">("hold");
  const [xpN, setXpN] = useState(0);
  const [dinN, setDinN] = useState(0);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("bloom"), HOLD_MS);
    const t2 = window.setTimeout(() => setPhase("count"), HOLD_MS + BLOOM_MS);
    const t3 = window.setTimeout(() => setPhase("tail"), HOLD_MS + BLOOM_MS + COUNT_MS);
    const t4 = window.setTimeout(onDone, HOLD_MS + BLOOM_MS + COUNT_MS + TAIL_MS);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, [onDone]);

  // Play the chime once at bloom — never during count-up ticks.
  useEffect(() => {
    if (phase !== "bloom" || silent) return;
    try {
      const el = typeof Audio !== "undefined" ? new Audio("/sounds/reward.mp3") : null;
      if (el) { el.volume = 0.32; void el.play().catch(() => {}); }
    } catch { /* ignore */ }
  }, [phase, silent]);

  // Eased count-up.
  useEffect(() => {
    if (phase !== "count") return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / COUNT_MS);
      const eased = easeOutQuint(p);
      setXpN(Math.round(eased * xp));
      setDinN(Math.round(eased * dinars));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, xp, dinars]);

  // A restrained particle count — golden, never confetti-like.
  const particles = useMemo(() => Array.from({ length: 22 }, (_, i) => i), []);

  const showNumbers = !silent && (xp > 0 || dinars > 0);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      <div
        className="absolute inset-0 transition-opacity duration-[900ms] ease-out"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,190,60,0.30), rgba(0,0,0,0.78) 62%)",
          opacity: phase === "hold" ? 0 : phase === "tail" ? 0.12 : 1,
        }}
      />
      {phase !== "hold" && particles.map((i) => {
        const delay = (i * 22) % 260;
        return (
          <span
            key={i}
            className="absolute size-[6px] rounded-full"
            style={{
              background: i % 4 === 0 ? "#fff2c6" : "hsl(45 100% 68%)",
              boxShadow: "0 0 10px hsl(45 100% 70% / 0.9)",
              animation: `burst-${i} 1.8s ${delay}ms cubic-bezier(0.16, 0.9, 0.28, 1) forwards`,
            }}
          />
        );
      })}
      <style>{particles.map((i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 130 + ((i * 41) % 100);
        const dx = Math.round(Math.cos(angle) * dist);
        const dy = Math.round(Math.sin(angle) * dist);
        return `@keyframes burst-${i} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.35); }
          14%  { opacity: 1; }
          100% { opacity: 0; transform: translate(${dx}px, ${dy}px) scale(1); }
        }`;
      }).join("\n")}</style>

      {showNumbers && (
        <div
          dir="rtl"
          className="relative z-10 flex flex-col items-center gap-3 transition-all duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            transform: phase === "hold" ? "scale(0.92) translateY(6px)" : "scale(1) translateY(0)",
            opacity: phase === "hold" ? 0 : phase === "tail" ? 0.92 : 1,
          }}
        >
          <p className="font-display text-[clamp(20px,5vw,26px)] font-bold tracking-[0.28em] text-gold"
             style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)" }}>
            أحسنت
          </p>
          <div className="flex items-center gap-4 rounded-full border border-gold/40 bg-black/55 px-6 py-3 backdrop-blur">
            <Sparkles className="size-4 text-gold" />
            {xp > 0 && (
              <span className="font-display text-lg font-bold text-gold tabular-nums">
                +{xpN} XP
              </span>
            )}
            {dinars > 0 && (
              <span className="font-display text-lg font-bold text-gold tabular-nums">
                +{dinN} د
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
