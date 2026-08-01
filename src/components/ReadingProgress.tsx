import { useEffect, useRef, useState } from "react";

/**
 * ReadingProgress — ultra-thin scroll progress indicator.
 *
 * Presentation only: fixed to the very top of the viewport, never
 * occupies layout space (no layout shift), never blocks pointer input,
 * and hides itself automatically when the page is not scrollable.
 * RTL-aware: the bar grows from the right edge.
 */
export function ReadingProgress({ className = "" }: { className?: string }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const compute = () => {
      frame.current = null;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      // Short pages never need the bar.
      if (scrollable <= 80) {
        setVisible(false);
        setProgress(0);
        return;
      }
      const y = window.scrollY || doc.scrollTop || 0;
      const ratio = Math.min(1, Math.max(0, y / scrollable));
      setVisible(true);
      setProgress(ratio);
    };

    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(document.body);
    }

    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={[
        "pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px]",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        className,
      ].join(" ")}
    >
      <div
        className="h-full origin-right bg-gradient-to-l from-gold via-amber-300 to-gold/70"
        style={{
          transform: `scaleX(${progress})`,
          willChange: "transform",
        }}
      />
    </div>
  );
}

export default ReadingProgress;
