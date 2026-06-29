// ============================================================
// Irth Opening Sequence — SFX Hook
// ------------------------------------------------------------
// A single optional startup sound played once per page-load.
//
// - Respects the user's audio settings (soundEnabled & sfxEnabled
//   from audioManager / irth_audio_settings).
// - Respects prefers-reduced-motion.
// - Honors browser autoplay restrictions: if play() rejects, the
//   splash continues silently.
// - Never loops. Never restarts. Cleans up on cancel / unmount.
// - If the file is missing or fails to load, the splash carries
//   on normally.
// ============================================================

import { audioManager } from "@/lib/audioManager";
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { deviceAllowsAudio } from "@/lib/androidSilentMode";

const SFX_URL = "/audio/splash-startup.mp3";

let played = false;
let current: HTMLAudioElement | null = null;

export interface PlaySplashSfxOptions {
  /** Called when SFX naturally ends (for logo-reveal sync). */
  onEnded?: () => void;
}

/** Returns a cleanup function that stops + releases the audio. */
export function playSplashSfx(opts: PlaySplashSfxOptions = {}): () => void {
  if (isAndroidUltraStableMode()) return () => { /* noop */ };
  if (played) return () => { /* noop */ };
  played = true;

  // Respect user audio prefs.
  let allowed = true;
  try {
    const s = audioManager.getSettings();
    allowed = s.soundEnabled && s.sfxEnabled;
  } catch { /* ignore */ }

  // Respect reduced-motion as a sound proxy too.
  try {
    if (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      allowed = false;
    }
  } catch { /* ignore */ }

  if (!allowed) return () => { /* noop */ };

  let cancelled = false;
  try {
    const audio = new Audio(SFX_URL);
    audio.preload = "auto";
    audio.loop = false;

    // master * sfx volume, clamped.
    let vol = 0.45;
    try {
      const s = audioManager.getSettings();
      vol = Math.max(0, Math.min(1, s.masterVolume * s.sfxVolume * 2.5));
    } catch { /* ignore */ }
    audio.volume = vol;

    const handleEnded = () => {
      try { opts.onEnded?.(); } catch { /* ignore */ }
      cleanup();
    };
    const handleError = () => { cleanup(); };

    audio.addEventListener("ended", handleEnded, { once: true });
    audio.addEventListener("error", handleError, { once: true });

    current = audio;
    void audio.play().catch(() => {
      // Autoplay blocked or load failed — stay silent.
      cleanup();
    });

    function cleanup() {
      if (current !== audio) return;
      try { audio.pause(); } catch { /* ignore */ }
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      try { audio.src = ""; } catch { /* ignore */ }
      current = null;
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  } catch {
    return () => { /* ignore */ };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void cancelled;
}
