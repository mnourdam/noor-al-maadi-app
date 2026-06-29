// ============================================================
// Irth Motion Primitives — LC1 polish pass
// GPU-only animations (transform / opacity). Short & calm.
// All effects automatically degrade under:
//   - prefers-reduced-motion (CSS global guard in styles.css)
//   - html.perf-lite (Android WebView / low-power)
// ============================================================
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

/* ─── PageEnter ─────────────────────────────────────────────
 * Wrap a route's content. Fades + 8px upward on mount.
 * Re-keys on `routeKey` change to retrigger between pages.
 */
export function PageEnter({
  routeKey,
  children,
  className,
}: {
  routeKey?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={routeKey} className={cn("motion-page", className)}>
      {children}
    </div>
  );
}

/* ─── Reveal ────────────────────────────────────────────────
 * IntersectionObserver-driven first-time reveal. Only animates
 * when the element enters the viewport. Animates ONCE, then
 * stays mounted with no listeners.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={cn("motion-reveal", shown && "is-in", className)}
      style={{ transitionDelay: shown && delayMs ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  );
}


/* ─── Stagger ───────────────────────────────────────────────
 * Lightweight stagger wrapper: sets --i on each child so the
 * .motion-card-stagger CSS rule schedules a 25ms ladder.
 * Caps animated children at `max` (default 12) to protect long
 * lists. Items past the cap render with no animation.
 */
export function Stagger({
  children,
  className,
  max = 12,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const arr = Array.isArray(children) ? children : [children];
  return (
    <div className={cn("motion-card-stagger", className)}>
      {arr.map((child, i) => {
        if (i >= max) return child;
        const style: CSSProperties = { ["--i" as never]: String(i) };
        return (
          <div key={(child as { key?: string })?.key ?? i} style={style}>
            {child}
          </div>
        );
      })}
    </div>
  );
}

/* ─── AnimatedNumber ────────────────────────────────────────
 * Smoothly interpolates between numeric values. Default duration
 * 240ms (capped at 300ms). No infinite animation. Skips entirely
 * for reduced motion users.
 */
export function AnimatedNumber({
  value,
  duration = 240,
  format = (v) => Math.round(v).toLocaleString("en-US"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(value);

  useEffect(() => {
    if (value === targetRef.current) return;
    fromRef.current = shown;
    targetRef.current = value;
    startRef.current = null;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const d = Math.min(300, Math.max(80, duration));
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / d);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (targetRef.current - fromRef.current) * eased;
      setShown(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <span className={cn("motion-num tabular-nums", className)}>{format(shown)}</span>;
}

/* ─── RewardFloat ───────────────────────────────────────────
 * One-shot floating "+150 XP" / "+20 دينار" badge. Self-removes
 * after the animation. Place inside a relatively positioned
 * parent (e.g. the HUD stat button).
 */
export function RewardFloat({
  label,
  onDone,
  className,
}: {
  label: string;
  onDone?: () => void;
  className?: string;
}) {
  useEffect(() => {
    const id = window.setTimeout(() => onDone?.(), 950);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <span
      aria-hidden
      className={cn(
        "motion-reward-float absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-gold",
        className
      )}
    >
      {label}
    </span>
  );
}
