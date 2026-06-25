// ============================================================
// Irth Opening Sequence — SFX Hook
// ------------------------------------------------------------
// A single optional startup sound. No music is embedded. To
// enable later, drop the file at /audio/splash-startup.mp3
// (or change SFX_URL) — playSplashSfx() will autoplay it once
// per launch. If the file is missing or autoplay is blocked
// the sequence remains completely silent.
// ============================================================

const SFX_URL = "/audio/splash-startup.mp3";

let played = false;

export function playSplashSfx(): void {
  if (played) return;
  played = true;
  try {
    const audio = new Audio(SFX_URL);
    audio.volume = 0.45;
    void audio.play().catch(() => { /* autoplay blocked or file missing — silent */ });
  } catch { /* silent */ }
}
