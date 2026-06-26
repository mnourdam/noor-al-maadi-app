import { useEffect, useRef, useState } from "react";
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

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

type Tone = "green" | "gold" | "red";

/**
 * Premium countdown timer — large, elegant, mm:ss format.
 * Color transitions subtly: Green → Gold → Red (final 20%).
 */
export function GameTimer({ seconds, paused, onExpire }: Props) {
  androidMark("render:GameTimer");
  const androidStable = isAndroidUltraStableMode();
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    expiredRef.current = false;
  }, [seconds]);

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
