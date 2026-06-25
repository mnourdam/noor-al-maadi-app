import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";

interface Props {
  /** total seconds */
  seconds: number;
  /** pause the countdown (e.g. after completion) */
  paused?: boolean;
  /** invoked once when the timer reaches zero */
  onExpire?: () => void;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * Premium countdown timer — large, elegant, mm:ss format.
 * Pure presentation. Decoupled from game scoring.
 */
export function GameTimer({ seconds, paused, onExpire }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    expiredRef.current = false;
  }, [seconds]);

  useEffect(() => {
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
  }, [paused, onExpire]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const low = remaining <= 30 && !paused;
  const pct = Math.max(0, Math.min(100, (remaining / Math.max(seconds, 1)) * 100));

  return (
    <div className="irth-timer" dir="ltr" aria-live="polite" aria-label="عدّاد الوقت">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full border ${low ? "border-red-500/60 text-red-300" : "border-amber-500/40 text-amber-300"}`}>
          <Timer className="h-4 w-4" />
        </span>
        <span
          className={`irth-timer-digits tabular-nums font-bold ${low ? "text-red-300" : "text-amber-100"}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {pad(m)}:<span key={s} className="irth-timer-tick">{pad(s)}</span>
        </span>
      </div>
      <div className="irth-timer-rail" aria-hidden>
        <span style={{ width: `${pct}%`, background: low ? "linear-gradient(90deg,#ef4444,#fca5a5,#ef4444)" : undefined }} />
      </div>
    </div>
  );
}
