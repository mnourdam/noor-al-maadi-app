import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Link2 } from "lucide-react";
import type { ConnectionsStage } from "@/lib/games/types";
import { sfx } from "./sfx";
import { AttemptsChip } from "./AttemptsChip";
import { isAndroidUltraStableMode, recordAndroidAction } from "@/lib/androidFreezeDiagnostics";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";

interface Props {
  stage: ConnectionsStage;
  onComplete: (score: number) => void;
  onWrong?: () => void;
  attemptsLeft?: number;
  maxAttempts?: number;
}


function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ConnectionsRenderer({ stage, onComplete, onWrong, attemptsLeft, maxAttempts }: Props) {
  const androidStable = isAndroidUltraStableMode();
  const disableKeyboardViewportResize = isAndroidFocusABDisabled("disableKeyboardViewportResize");
  // pairIndex (i) is the source of truth for matching. Visual order on each side may differ.
  const lefts = useMemo(() => shuffle(stage.pairs.map((p, i) => ({ i, text: p.left }))), [stage]);
  const rights = useMemo(() => shuffle(stage.pairs.map((p, i) => ({ i, text: p.right }))), [stage]);

  const [pickedLeft, setPickedLeft] = useState<number | null>(null);
  const [pickedRight, setPickedRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<Record<number, number>>({}); // leftPairIdx -> rightPairIdx (always same number when correct)
  const [wrongFlash, setWrongFlash] = useState<{ l: number; r: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPickedLeft(null); setPickedRight(null); setMatched({}); setWrongFlash(null); setDone(false);
  }, [stage]);

  // Attempt match whenever both sides selected
  useEffect(() => {
    if (pickedLeft === null || pickedRight === null) return;
    if (pickedLeft === pickedRight) {
      const next = { ...matched, [pickedLeft]: pickedRight };
      setMatched(next);
      sfx("thread_connect");
      sfx("correct");
      setPickedLeft(null);
      setPickedRight(null);
      if (Object.keys(next).length === stage.pairs.length && !done) {
        setDone(true);
        sfx("gold_unlock");
        onComplete(100);
      }
    } else {
      const flash = { l: pickedLeft, r: pickedRight };
      setWrongFlash(flash);
      sfx("wrong");
      onWrong?.();

      const t = setTimeout(() => {
        setWrongFlash(null);
        setPickedLeft(null);
        setPickedRight(null);
      }, 550);
      return () => clearTimeout(t);
    }
  }, [pickedLeft, pickedRight]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickLeft = (pairIdx: number) => {
    recordAndroidAction("game.connections.pickLeft");
    if (pairIdx in matched) return;
    setPickedLeft((cur) => (cur === pairIdx ? null : pairIdx));
  };
  const onPickRight = (pairIdx: number) => {
    recordAndroidAction("game.connections.pickRight");
    if (Object.values(matched).includes(pairIdx)) return;
    setPickedRight((cur) => (cur === pairIdx ? null : pairIdx));
  };

  // ---- Thread geometry (SVG overlay) ----
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [lines, setLines] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number; kind: "locked" | "wrong" }[]>([]);

  const recomputeLines = () => {
    const wrap = containerRef.current;
    if (!wrap) return;
    const wrapBox = wrap.getBoundingClientRect();
    const out: typeof lines = [];
    Object.entries(matched).forEach(([lStr, r]) => {
      const l = Number(lStr);
      const a = leftRefs.current[l];
      const b = rightRefs.current[r];
      if (!a || !b) return;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      out.push({
        key: `m-${l}-${r}`,
        // In RTL the left column is on the right side. Use the inner edges.
        x1: ar.left - wrapBox.left,
        y1: ar.top + ar.height / 2 - wrapBox.top,
        x2: br.right - wrapBox.left,
        y2: br.top + br.height / 2 - wrapBox.top,
        kind: "locked",
      });
    });
    if (wrongFlash) {
      const a = leftRefs.current[wrongFlash.l];
      const b = rightRefs.current[wrongFlash.r];
      if (a && b) {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        out.push({
          key: `w-${wrongFlash.l}-${wrongFlash.r}`,
          x1: ar.left - wrapBox.left,
          y1: ar.top + ar.height / 2 - wrapBox.top,
          x2: br.right - wrapBox.left,
          y2: br.top + br.height / 2 - wrapBox.top,
          kind: "wrong",
        });
      }
    }
    setLines(out);
  };

  useLayoutEffect(() => {
    recomputeLines();
    if (androidStable || disableKeyboardViewportResize) return;
    const onResize = () => recomputeLines();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [matched, wrongFlash, lefts, rights, androidStable, disableKeyboardViewportResize]); // eslint-disable-line

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-300/80">
          <Link2 className="h-3.5 w-3.5" />
          الخيوط التاريخية
        </div>
        <div className="flex items-center gap-2">
          {typeof attemptsLeft === "number" && typeof maxAttempts === "number" && (
            <AttemptsChip attemptsLeft={attemptsLeft} total={maxAttempts} />
          )}
          <span className="text-[11px] text-slate-400">{Object.keys(matched).length}/{stage.pairs.length}</span>
        </div>

      </div>

      <p className="mb-3 text-[11px] text-slate-500">
        اختر بطاقة من أي جانب، ثم اختر ما يقابلها من الجانب الآخر. الاتجاه حر.
      </p>

      <div ref={containerRef} className="relative grid grid-cols-2 items-start gap-6 sm:gap-10">
        {/* SVG threads overlay */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="thread-gold" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(251,191,36,0.4)" />
              <stop offset="50%" stopColor="rgba(251,191,36,1)" />
              <stop offset="100%" stopColor="rgba(251,191,36,0.4)" />
            </linearGradient>
          </defs>
          {lines.map((ln) => {
            const mx = (ln.x1 + ln.x2) / 2;
            const d = `M ${ln.x1} ${ln.y1} C ${mx} ${ln.y1}, ${mx} ${ln.y2}, ${ln.x2} ${ln.y2}`;
            const stroke = ln.kind === "locked" ? "url(#thread-gold)" : "rgba(239,68,68,0.85)";
            return (
              <path
                key={ln.key}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={ln.kind === "locked" ? 2.4 : 2}
                strokeLinecap="round"
                style={{
                  filter: ln.kind === "locked" ? "drop-shadow(0 0 4px rgba(251,191,36,0.55))" : undefined,
                  animation: ln.kind === "locked" ? "irth-thread-pulse 2.6s ease-in-out infinite" : "irth-thread-fade 0.55s ease-out forwards",
                }}
              />
            );
          })}
        </svg>

        {/* Left column */}
        <ul className="space-y-2">
          {lefts.map((l) => {
            const isMatched = l.i in matched;
            const isPicked = pickedLeft === l.i;
            const isWrong = wrongFlash?.l === l.i;
            return (
              <li key={l.i}>
                <button
                  ref={(el) => { leftRefs.current[l.i] = el; }}
                  onClick={() => onPickLeft(l.i)}
                  disabled={isMatched}
                  className={`w-full min-h-12 rounded-lg border p-3 text-right text-sm leading-7 transition ${
                    isMatched ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                      : isPicked ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : isWrong ? "border-red-500/60 bg-red-500/10 irth-shake"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}
                >
                  {l.text}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Right column */}
        <ul className="space-y-2">
          {rights.map((r) => {
            const isMatched = Object.values(matched).includes(r.i);
            const isPicked = pickedRight === r.i;
            const isWrong = wrongFlash?.r === r.i;
            return (
              <li key={r.i}>
                <button
                  ref={(el) => { rightRefs.current[r.i] = el; }}
                  onClick={() => onPickRight(r.i)}
                  disabled={isMatched}
                  className={`w-full rounded-lg border p-3 text-right text-sm transition ${
                    isMatched ? "border-amber-500/50 bg-amber-500/10 text-amber-100"
                      : isPicked ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : isWrong ? "border-red-500/60 bg-red-500/10 irth-shake"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}
                >
                  {r.text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {done && (
        <div className="irth-reveal mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 p-3 text-sm text-amber-100">
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتملت جميع الروابط — تتوهج خيوط التاريخ.
        </div>
      )}
    </div>
  );
}
