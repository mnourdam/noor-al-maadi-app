// ============================================================
// SegmentedProgress — liquid-gold segments for the story player.
// One segment per scene; the active segment fills over `activeMs`.
// ============================================================

import { useEffect, useRef, useState } from "react";

interface Props {
  total: number;
  activeIndex: number;
  activeMs: number;
  paused?: boolean;
  /** Bumped each time the active scene changes to reset the fill. */
  epoch: string | number;
}

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
      const p = Math.min(1, (now - startedAtRef.current) / Math.max(1, activeMs));
      setPct(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [paused, activeMs, epoch]);

  return (
    <div dir="ltr" className="pointer-events-none flex w-full items-center gap-1.5 px-4 pt-3">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < activeIndex;
        const isActive = i === activeIndex;
        const fill = isDone ? 100 : isActive ? pct * 100 : 0;
        return (
          <div key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${fill}%`,
                background:
                  "linear-gradient(90deg, hsl(45 90% 55% / 0.95), hsl(45 100% 72% / 0.95))",
                boxShadow: isActive ? "0 0 10px hsl(45 100% 65% / 0.55)" : undefined,
                transition: isDone ? "width 260ms ease-out" : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
