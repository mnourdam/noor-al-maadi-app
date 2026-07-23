// ============================================================
// SentenceReveal — staggered fade-in-up of narrative sentences.
// Not typewriter; each sentence lands as a unit at 900ms stride.
// ============================================================

import { useEffect, useState } from "react";
import { SENTENCE_STAGGER_MS } from "./timing";

interface Props {
  sentences: string[];
  className?: string;
  /** Reset key — bump to restart the reveal. */
  epoch: string | number;
  paused?: boolean;
}

export function SentenceReveal({ sentences, className, epoch, paused }: Props) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
  }, [epoch]);

  useEffect(() => {
    if (paused) return;
    if (shown >= sentences.length) return;
    const t = window.setTimeout(
      () => setShown((n) => Math.min(n + 1, sentences.length)),
      shown === 0 ? 250 : SENTENCE_STAGGER_MS,
    );
    return () => window.clearTimeout(t);
  }, [shown, sentences.length, paused, epoch]);

  return (
    <div dir="rtl" className={className}>
      {sentences.map((s, i) => (
        <p
          key={`${epoch}:${i}`}
          className="mb-2 text-[16px] leading-[1.9] text-white/95 transition-all duration-700 ease-out"
          style={{
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "translateY(0)" : "translateY(10px)",
            textShadow: "0 2px 12px rgba(0,0,0,0.55)",
          }}
        >
          {s}
        </p>
      ))}
    </div>
  );
}
