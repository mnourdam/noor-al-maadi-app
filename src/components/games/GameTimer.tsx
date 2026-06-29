import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";

interface Props {
  /** total seconds */
  seconds: number;
  /** pause the countdown (e.g. after completion) */
  paused?: boolean;
  /** invoked once when the timer reaches zero */
  onExpire?: () => void;
}

/** Imperative handle exposed to the host so the Help system can grant bonus time. */
export interface GameTimerHandle {
  addSeconds: (n: number) => void;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

type Tone = "green" | "gold" | "red";

/**
 * Premium countdown timer — large, elegant, mm:ss format.
 * Color transitions subtly: Green → Gold → Red (final 20%).
 *
 * Exposes `addSeconds(n)` via ref so the unified Help system can add
 * bonus time (e.g. "+2 minutes" purchase) without remounting the timer.
 */
export const GameTimer = forwardRef<GameTimerHandle, Props>(function GameTimer(
  { seconds, paused, onExpire }, ref,
) {
  androidMark("render:GameTimer");
  const androidStable = isAndroidUltraStableMode();
  const [remaining, setRemaining] = useState(seconds);
  const [baseSeconds, setBaseSeconds] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    setBaseSeconds(seconds);
    expiredRef.current = false;
  }, [seconds]);

  useImperativeHandle(ref, () => ({
    addSeconds: (n: number) => {
      if (!Number.isFinite(n) || n === 0) return;
      setRemaining((r) => Math.max(0, r + n));
      // Grow the rail's reference so the bar doesn't jump past 100%.
      if (n > 0) setBaseSeconds((b) => Math.max(b, remaining + n, b + n));
      // A non-zero add brings the timer out of "expired" state.
      if (n > 0 && remaining + n > 0) expiredRef.current = false;
    },
  }), [remaining]);

  useEffect(() => {
    if (androidStable) return;
    if (paused) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire?.();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, onExpire, androidStable]);


  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const pct = Math.max(0, Math.min(100, (remaining / Math.max(seconds, 1)) * 100));

  // Tri-color tone — subtle, no flashing.
  const tone: Tone = pct <= 20 ? "red" : pct <= 50 ? "gold" : "green";
  const ring =
    tone === "red"
      ? "border-rose-400/60 text-rose-300"
      : tone === "gold"
      ? "border-amber-400/60 text-amber-300"
      : "border-emerald-400/60 text-emerald-300";
  const digits =
    tone === "red" ? "text-rose-200" : tone === "gold" ? "text-amber-100" : "text-emerald-100";
  const rail =
    tone === "red"
      ? "linear-gradient(90deg,#fb7185,#fda4af,#fb7185)"
      : tone === "gold"
      ? "linear-gradient(90deg,#f59e0b,#fde68a,#f59e0b)"
      : "linear-gradient(90deg,#10b981,#6ee7b7,#10b981)";

  return (
    <div className="irth-timer" dir="ltr" aria-live="polite" aria-label="عدّاد الوقت">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full border ${ring}`}>
          <Timer className="h-4 w-4" />
        </span>
        <span
          className={`irth-timer-digits tabular-nums font-bold ${digits}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {pad(m)}:<span key={s} className="irth-timer-tick">{pad(s)}</span>
        </span>
      </div>
      <div className="irth-timer-rail" aria-hidden>
        <span style={{ width: `${pct}%`, background: rail }} />
      </div>
    </div>
  );
}
