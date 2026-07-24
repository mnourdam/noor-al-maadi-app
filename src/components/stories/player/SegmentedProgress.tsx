// ============================================================
// SegmentedProgress — liquid-gold segments for the story player.
// Phase 5.5 refinement:
//   * Eased fill (easeOutQuad) — no more linear crawl.
//   * Completed segments fade to a calmer done-tone via CSS
//     transition instead of snapping.
//   * Active segment carries a soft golden halo that grows with
//     progress, giving the sense of "breath" rather than a bar.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { EASE_CINEMATIC, EASE_SOFT } from "./motion";

interface Props {
  total: number;
  activeIndex: number;
  activeMs: number;
  paused?: boolean;
  /** Bumped each time the active scene changes to reset the fill. */
  epoch: string | number;
}

// Softer easing than linear so progress never feels mechanical.
const easeOutQuad = (p: number) => 1 - Math.pow(1 - p, 2);

export function SegmentedProgress({ total, activeIndex, activeMs, paused, epoch }: Props) {
  const [pct, setPct] = useState(0);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setPct(0);
    startedAtRef.current = performance.now();
    pausedAtRef.current = null;
  }, [epoch]);

  useEffect(() => {
    if (paused) {
      if (pausedAtRef.current == null) pausedAtRef.current = performance.now();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    if (pausedAtRef.current != null) {
      startedAtRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    const tick = () => {
      const now = performance.now();
      const raw = Math.min(1, (now - startedAtRef.current) / Math.max(1, activeMs));
      setPct(easeOutQuad(raw));
      if (raw < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, activeMs, epoch]);

  return (
    <div dir="rtl" className="pointer-events-none flex w-full items-center gap-1.5 px-4 pt-3">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const fill = isDone ? 100 : isActive ? pct * 100 : 0;
        return (
          <div
            key={i}
            className="relative h-[3px] flex-1 overflow-hidden rounded-full"
            style={{
              background: isDone ? "hsl(45 60% 55% / 0.35)" : "rgba(255,255,255,0.15)",
              transition: `background 360ms ${EASE_SOFT}`,
            }}
          >
            <div
              className="absolute inset-y-0 right-0 rounded-full"
              style={{
                width: `${fill}%`,
                background:
                  "linear-gradient(270deg, hsl(45 90% 55% / 0.95), hsl(45 100% 74% / 0.98))",
                boxShadow: isActive
                  ? `0 0 ${6 + Math.round(pct * 10)}px hsl(45 100% 65% / ${0.35 + pct * 0.35})`
                  : undefined,
                transition: isDone ? `width 320ms ${EASE_CINEMATIC}` : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
