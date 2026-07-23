// ============================================================
// RewardMoment — golden particle burst + XP/Dinar count-up.
// Renders after the final scene holds; when done, calls onDone.
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

const HOLD_MS = 700;
const COUNT_MS = 1400;
const TAIL_MS = 700;

export function RewardMoment({ xp, dinars, onDone, silent }: Props) {
  const [phase, setPhase] = useState<"hold" | "burst" | "count" | "tail">("hold");
  const [xpN, setXpN] = useState(0);
  const [dinN, setDinN] = useState(0);

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("burst"), HOLD_MS);
    const t2 = window.setTimeout(() => setPhase("count"), HOLD_MS + 180);
    const t3 = window.setTimeout(() => setPhase("tail"), HOLD_MS + 180 + COUNT_MS);
    const t4 = window.setTimeout(onDone, HOLD_MS + 180 + COUNT_MS + TAIL_MS);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, [onDone]);

  useEffect(() => {
    if (phase !== "count") return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setXpN(Math.round(eased * xp));
      setDinN(Math.round(eased * dinars));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // gentle chime — reuses existing audio if the app defined one; silent otherwise
    try {
      const el = typeof Audio !== "undefined" ? new Audio("/sounds/reward.mp3") : null;
      if (el) { el.volume = 0.35; void el.play().catch(() => {}); }
    } catch { /* ignore */ }
    return () => cancelAnimationFrame(raf);
  }, [phase, xp, dinars]);

  const particles = useMemo(() => Array.from({ length: 26 }, (_, i) => i), []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background:
            "radial-gradient(circle at center, rgba(240,190,60,0.28), rgba(0,0,0,0.75) 60%)",
          opacity: phase === "hold" ? 0 : phase === "tail" ? 0.15 : 1,
        }}
      />
      {phase !== "hold" && particles.map((i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 120 + ((i * 37) % 90);
        const delay = (i * 15) % 200;
        return (
          <span
            key={i}
            className="absolute size-1.5 rounded-full"
            style={{
              background: i % 3 === 0 ? "#fff1c0" : "hsl(45 100% 68%)",
              boxShadow: "0 0 8px hsl(45 100% 70% / 0.9)",
              animation: `burst-${i} 1.6s ${delay}ms ease-out forwards`,
            }}
          />
        );
      })}
      <style>{particles.map((i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 120 + ((i * 37) % 90);
        const dx = Math.round(Math.cos(angle) * dist);
        const dy = Math.round(Math.sin(angle) * dist);
        return `@keyframes burst-${i} {
          0%   { opacity: 0; transform: translate(0,0) scale(0.4); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translate(${dx}px, ${dy}px) scale(1); }
        }`;
      }).join("\n")}</style>

      {!silent && (xp > 0 || dinars > 0) && (
        <div
          dir="rtl"
          className="relative z-10 flex items-center gap-4 rounded-full border border-gold/40 bg-black/50 px-6 py-3 backdrop-blur transition-all duration-500"
          style={{
            transform: phase === "hold" ? "scale(0.9)" : "scale(1)",
            opacity: phase === "hold" ? 0 : phase === "tail" ? 0.9 : 1,
          }}
        >
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
      )}
    </div>
  );
}
