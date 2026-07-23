// ============================================================
// SentenceReveal — staggered fade-in-up of narrative sentences.
// Not typewriter; each sentence lands as a unit at 900ms stride.
// Phase 4 (typography polish):
//   * fluid clamp() sizing for phone → tablet
//   * generous paragraph spacing + 1.95 line-height for Arabic
//   * layered text-shadow so body reads over bright artwork
// ============================================================

import { useEffect, useState } from "react";
import { SENTENCE_STAGGER_MS } from "./timing";

interface Props {
  sentences: string[];
  className?: string;
  /** Reset key — bump to restart the reveal. */
  epoch: string | number;
  paused?: boolean;
  /** `body` (default narrative) or `quote` (larger, display face). */
  variant?: "body" | "quote";
}

export function SentenceReveal({ sentences, className, epoch, paused, variant = "body" }: Props) {
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

  const paraClass =
    variant === "quote"
      ? "mb-5 font-display font-medium text-[clamp(17px,4.6vw,20px)] leading-[2.05] text-white/95"
      : "mb-4 text-[clamp(15px,3.9vw,17px)] leading-[1.95] text-white/95";

  return (
    <div dir="rtl" className={className}>
      {sentences.map((s, i) => (
        <p
          key={`${epoch}:${i}`}
          className={`${paraClass} transition-all duration-700 ease-out`}
          style={{
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "translateY(0)" : "translateY(10px)",
            // Layered shadow: soft halo + tight drop keeps text legible
            // over both bright and dark artwork without dimming the image.
            textShadow:
              "0 1px 2px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.45)",
          }}
        >
          {s}
        </p>
      ))}
    </div>
  );
}
