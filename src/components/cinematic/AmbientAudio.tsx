// ============================================================
// Cinematic Opening — Ambient Audio Controller
// ------------------------------------------------------------
// Plays one looping ambient track for the active scene, and
// crossfades smoothly when the src changes. Uses two <audio>
// elements ping-ponged. No music, no narration — only whatever
// URL the scene config provides.
// ============================================================

import { useEffect, useRef } from "react";

interface Props {
  src?: string;
  volume?: number; // 0..1
  fadeMs?: number;
}

export function AmbientAudio({ src, volume = 0.4, fadeMs = 900 }: Props) {
  const aRef = useRef<HTMLAudioElement | null>(null);
  const bRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef<"a" | "b">("a");
  const currentSrc = useRef<string | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentSrc.current === src) return;
    currentSrc.current = src;

    const nextKey = activeRef.current === "a" ? "b" : "a";
    const outEl = activeRef.current === "a" ? aRef.current : bRef.current;
    const inEl = nextKey === "a" ? aRef.current : bRef.current;

    // Stop and fade out the outgoing element.
    const startOutVol = outEl?.volume ?? 0;

    // Configure and start incoming.
    if (src && inEl) {
      try {
        inEl.src = src;
        inEl.loop = true;
        inEl.volume = 0;
        const p = inEl.play();
        if (p && typeof p.catch === "function") p.catch(() => { /* autoplay blocked; silent */ });
      } catch { /* ignore */ }
    }

    const startedAt = performance.now();
    const target = Math.max(0, Math.min(1, volume));

    const tick = () => {
      const t = Math.min(1, (performance.now() - startedAt) / fadeMs);
      if (outEl) outEl.volume = Math.max(0, startOutVol * (1 - t));
      if (src && inEl) inEl.volume = target * t;
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        if (outEl && (!src || outEl !== inEl)) {
          try { outEl.pause(); } catch { /* */ }
        }
      }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    activeRef.current = nextKey;
  }, [src, volume, fadeMs]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      [aRef.current, bRef.current].forEach((el) => {
        if (!el) return;
        try { el.pause(); el.src = ""; } catch { /* */ }
      });
    };
  }, []);

  return (
    <>
      <audio ref={aRef} preload="auto" playsInline />
      <audio ref={bRef} preload="auto" playsInline />
    </>
  );
}
