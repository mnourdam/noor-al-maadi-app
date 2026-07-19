// ============================================================
// Cinematic Opening — Continuous Ambient Audio
// ------------------------------------------------------------
// Renders a single, continuously-playing <audio> element for the
// whole cinematic opening. The parent supplies:
//   • `src`         — stable soundtrack URL (never restarted mid-play)
//   • `targetVolume` — the desired level for the *current* scene
//   • `paused`      — true when the app is backgrounded / hidden
//   • `stopping`    — true when Skip/Finish begins; audio fades to 0
//
// Behaviour:
//   • The audio loops seamlessly.
//   • Volume is ramped smoothly toward `targetVolume` (no jumps).
//   • Scene changes never pause, restart, or reload the track.
//   • Backgrounding pauses playback; foregrounding resumes at the
//     same position and target volume — no duplicate playback.
//   • Skip / finish fades to silence, then stops.
// ============================================================

import { useEffect, useRef } from "react";

interface Props {
  src?: string;
  /** Target playback volume for the current scene, 0..1. */
  targetVolume: number;
  /** When true, the audio is paused (background/hidden). */
  paused?: boolean;
  /** When true, the audio ramps to 0 and stops. */
  stopping?: boolean;
  /** Ramp duration for volume changes between scenes. Default 1500ms. */
  rampMs?: number;
  /** Ramp duration for the final fade-to-silence. Default 900ms. */
  stopRampMs?: number;
}

export function AmbientAudio({
  src,
  targetVolume,
  paused = false,
  stopping = false,
  rampMs = 1500,
  stopRampMs = 900,
}: Props) {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  // Kick off playback once we have a src (deferred to first user
  // interaction elsewhere in the app; play() is safe to call and
  // will simply reject if autoplay is blocked).
  useEffect(() => {
    const el = elRef.current;
    if (!el || !src) return;
    el.loop = true;
    if (el.src !== src) {
      try { el.src = src; } catch { /* ignore */ }
    }
    el.volume = 0;
    if (!startedRef.current) {
      startedRef.current = true;
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => { /* autoplay blocked — will start once unpaused */ });
      }
    }
  }, [src]);

  // React to pause/resume without ever changing `src` or currentTime.
  useEffect(() => {
    const el = elRef.current;
    if (!el || !src) return;
    if (paused) {
      if (!stopping) {
        try { el.pause(); } catch { /* */ }
      }
      return;
    }
    if (!stopping && el.paused) {
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* */ });
    }
  }, [paused, stopping, src]);

  // Smoothly ramp volume toward the current target. On `stopping`
  // ramp to 0 and, once silent, pause the element.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const target = stopping ? 0 : Math.max(0, Math.min(1, targetVolume));
    const duration = stopping ? stopRampMs : rampMs;
    const from = el.volume;
    const start = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / Math.max(1, duration));
      // ease-in-out
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const v = from + (target - from) * eased;
      try { el.volume = Math.max(0, Math.min(1, v)); } catch { /* */ }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        if (stopping) {
          try { el.pause(); } catch { /* */ }
        }
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [targetVolume, stopping, rampMs, stopRampMs]);

  // Cleanup on unmount — stop and detach.
  useEffect(() => {
    return () => {
      const el = elRef.current;
      if (!el) return;
      try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* */ }
    };
  }, []);

  return <audio ref={elRef} preload="auto" playsInline aria-hidden />;
}
