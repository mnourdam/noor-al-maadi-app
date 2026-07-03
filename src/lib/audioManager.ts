// ============================================================

import { androidMark, isAndroidNativeApp, isAndroidUltraStableMode } from "./androidFreezeDiagnostics";
import { deviceAllowsAudio, initAndroidSilentMode } from "./androidSilentMode";
// audioManager.ts — Global audio singleton for Irth
// ------------------------------------------------------------
// - Subtle background ambience (looping)
// - Premium achievement / completion / unlock SFX
// - Persistent user settings (irth_audio_settings)
// - Browser autoplay-safe: waits for first user interaction
// - Fails silently if audio files are missing
// ============================================================

import errorSfxAsset from "@/assets/audio-error.mp3.asset.json";
import campaignAmbienceAsset from "@/assets/campaign-ambience.mp3.asset.json";

export type AmbienceLayer = "global" | "campaign";

export type SfxName =
  | "success"
  | "chapter-complete"
  | "campaign-complete"
  | "unlock-reward"
  | "error";

export interface AudioSettings {
  soundEnabled: boolean;
  ambienceEnabled: boolean;
  sfxEnabled: boolean;
  masterVolume: number;   // 0..1
  ambienceVolume: number; // 0..1
  sfxVolume: number;      // 0..1
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  soundEnabled: true,
  ambienceEnabled: true,
  sfxEnabled: true,
  masterVolume: 0.35,
  ambienceVolume: 0.18,
  sfxVolume: 0.45,
};

const STORAGE_KEY = "irth_audio_settings";

const AMBIENCE_URL = "/audio/irth-ambience.mp3";
const SFX_URLS: Record<SfxName, string> = {
  "success":            "/audio/success-soft.mp3",
  "chapter-complete":   "/audio/chapter-complete.mp3",
  "campaign-complete":  "/audio/campaign-complete.mp3",
  "unlock-reward":      "/audio/unlock-reward.mp3",
  "error":              errorSfxAsset.url,
};

// Per-SFX volume trim. Intentionally empty for "error" so the uploaded
// asset plays bit-for-bit at the same level as other UI SFX.
const SFX_VOLUME_SCALE: Partial<Record<SfxName, number>> = {};


// ---------- Settings persistence ----------
function readSettings(): AudioSettings {
  if (typeof window === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AUDIO_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function writeSettings(s: AudioSettings) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {/*ignore*/}
}

// ---------- Internal state ----------
let settings: AudioSettings = readSettings();
const listeners = new Set<(s: AudioSettings) => void>();
let ambience: HTMLAudioElement | null = null;
let ambienceFailed = false;
let interactionBound = false;
let hasInteracted = false;
const sfxFailed = new Set<SfxName>();
const recentSfx = new Map<string, number>(); // dedupe key -> ts

function notify() {
  for (const l of listeners) {
    try { l(settings); } catch {/*ignore*/}
  }
}

function warnOnce(msg: string) {
  if (typeof console !== "undefined") console.warn("[audio]", msg);
}

// ---------- Ambience ----------
function ensureAmbience() {
  if (ambience || ambienceFailed || typeof window === "undefined") return;
  try {
    const a = new Audio(AMBIENCE_URL);
    a.loop = true;
    a.preload = "auto";
    a.volume = settings.masterVolume * settings.ambienceVolume;
    a.addEventListener("error", () => {
      ambienceFailed = true;
      warnOnce(`ambience file missing or unplayable: ${AMBIENCE_URL}`);
    });
    ambience = a;
  } catch {
    ambienceFailed = true;
  }
}

function ambienceShouldPlay(): boolean {
  return settings.soundEnabled && settings.ambienceEnabled && hasInteracted && deviceAllowsAudio();
}

function applyAmbienceState() {
  if (typeof window === "undefined") return;
  if (ambienceShouldPlay()) {
    ensureAmbience();
    if (!ambience || ambienceFailed) return;
    ambience.volume = settings.masterVolume * settings.ambienceVolume;
    const p = ambience.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { /* autoplay blocked — will retry on next interaction */ });
    }
  } else if (ambience) {
    try { ambience.pause(); } catch {/*ignore*/}
  }
}

// ---------- First-interaction unlock ----------
function bindFirstInteraction() {
  if (interactionBound || typeof window === "undefined") return;
  interactionBound = true;
  const onFirst = () => {
    hasInteracted = true;
    applyAmbienceState();
    window.removeEventListener("pointerdown", onFirst);
    window.removeEventListener("keydown", onFirst);
    window.removeEventListener("touchstart", onFirst);
  };
  window.addEventListener("pointerdown", onFirst, { once: true, passive: true });
    if (!isAndroidNativeApp()) window.addEventListener("keydown", onFirst, { once: true });
  window.addEventListener("touchstart",  onFirst, { once: true, passive: true });
}

// ---------- App lifecycle (background/foreground) ----------
let lifecycleBound = false;
function bindLifecycle() {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;
  const onHidden = () => {
    if (ambience) { try { ambience.pause(); } catch {/*ignore*/} }
  };
  const onVisible = () => {
    // Only resume if the user has it enabled and previously interacted.
    if (ambienceShouldPlay()) applyAmbienceState();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onHidden();
    else onVisible();
  });
  window.addEventListener("pagehide", onHidden);
  window.addEventListener("blur", onHidden);
  window.addEventListener("focus", onVisible);
}

// ---------- Synthesized error tone (no asset needed) ----------
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch { return null; }
}

function playSynthError() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);
    const peak = 0.18 * settings.masterVolume * settings.sfxVolume;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {/*ignore*/}
}

// ---------- Public API ----------
export const audioManager = {
  init() {
    if (typeof window === "undefined") return;
    androidMark("audio.init");
    if (isAndroidUltraStableMode()) {
      audioManager.dispose();
      console.warn("[android:freeze] audio disabled in ultra-stable mode");
      return;
    }
    bindFirstInteraction();
    bindLifecycle();
    initAndroidSilentMode();
    // try immediately in case the user already interacted (e.g. SPA nav)
    applyAmbienceState();
  },

  getSettings(): AudioSettings {
    return { ...settings };
  },

  subscribe(listener: (s: AudioSettings) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  updateSettings(patch: Partial<AudioSettings>) {
    settings = { ...settings, ...patch };
    // Clamp volumes
    settings.masterVolume   = Math.max(0, Math.min(1, settings.masterVolume));
    settings.ambienceVolume = Math.max(0, Math.min(1, settings.ambienceVolume));
    settings.sfxVolume      = Math.max(0, Math.min(1, settings.sfxVolume));
    writeSettings(settings);
    applyAmbienceState();
    notify();
  },

  /** Play a one-shot effect. Safe: no-op if disabled or asset missing. */
  playSfx(name: SfxName, opts?: { dedupeKey?: string; dedupeMs?: number }) {
    if (typeof window === "undefined") return;
    androidMark("audio.sfx", { name });
    if (isAndroidUltraStableMode()) return;
    if (!settings.soundEnabled || !settings.sfxEnabled) return;
    if (!deviceAllowsAudio()) return;
    if (sfxFailed.has(name)) return;

    // Dedupe so the same activity doesn't fire twice
    if (opts?.dedupeKey) {
      const now = Date.now();
      const last = recentSfx.get(opts.dedupeKey) ?? 0;
      const window_ = opts.dedupeMs ?? 1500;
      if (now - last < window_) return;
      recentSfx.set(opts.dedupeKey, now);
    }

    const url = SFX_URLS[name];
    const scale = SFX_VOLUME_SCALE[name] ?? 1;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, settings.masterVolume * settings.sfxVolume * scale));
      a.addEventListener("error", () => {
        sfxFailed.add(name);
        warnOnce(`sfx missing or unplayable: ${url}`);
      });
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => { /* autoplay blocked; ignore */ });
      }
    } catch {
      sfxFailed.add(name);
    }
  },

  /**
   * Play the heart-loss / wrong-answer cue. Plays the uploaded error.mp3
   * asset exactly as-is, via the same playback path as other UI SFX.
   * No WebAudio processing, no pitch/EQ/filter, no synthesized layer.
   * The synth fallback is intentionally disabled — silence is preferred
   * over a tone that doesn't match the uploaded asset.
   */
  playError(scopeKey?: string) {
    const log = (status: "played" | "skipped", reason?: string) => {
      // eslint-disable-next-line no-console
      console.log(`[SFX] error_sfx ${status}${reason ? ` — ${reason}` : ""}${scopeKey ? ` (scope=${scopeKey})` : ""}`);
    };
    if (typeof window === "undefined") return log("skipped", "ssr");
    if (isAndroidUltraStableMode()) return log("skipped", "android ultra-stable mode");
    if (!settings.soundEnabled) return log("skipped", "disabled by user setting (sound)");
    if (!settings.sfxEnabled) return log("skipped", "disabled by user setting (sfx)");
    if (!deviceAllowsAudio()) return log("skipped", "blocked by silent/vibrate mode");
    if (sfxFailed.has("error")) return log("skipped", "missing asset / previous playback error");

    // Dedupe rapid re-fires (e.g. double-tap, parallel heart-lost event).
    const now = Date.now();
    const dedupeKey = "sfx:error";
    const last = recentSfx.get(dedupeKey) ?? 0;
    if (now - last < 220) return log("skipped", "already playing / throttled");
    recentSfx.set(dedupeKey, now);

    const url = SFX_URLS.error;
    try {
      const a = new Audio(url);
      a.volume = Math.max(0, Math.min(1, settings.masterVolume * settings.sfxVolume));
      a.addEventListener("error", () => {
        sfxFailed.add("error");
        log("skipped", `playback error (asset unplayable: ${url})`);
      });
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.then(() => log("played")).catch((err) => log("skipped", `playback error: ${err?.message ?? err}`));
      } else {
        log("played");
      }
    } catch (err) {
      sfxFailed.add("error");
      log("skipped", `exception: ${(err as Error)?.message ?? err}`);
    }
  },

  /** Cleanup — useful for hot reload / tests. */
  dispose() {
    androidMark("audio.dispose");
    if (ambience) {
      try { ambience.pause(); } catch {/*ignore*/}
      ambience = null;
    }
  },
};

