// ============================================================

import { androidMark, isAndroidNativeApp, isAndroidUltraStableMode } from "./androidFreezeDiagnostics";
// audioManager.ts — Global audio singleton for Irth
// ------------------------------------------------------------
// - Subtle background ambience (looping)
// - Premium achievement / completion / unlock SFX
// - Persistent user settings (irth_audio_settings)
// - Browser autoplay-safe: waits for first user interaction
// - Fails silently if audio files are missing
// ============================================================

export type SfxName =
  | "success"
  | "chapter-complete"
  | "campaign-complete"
  | "unlock-reward";

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
};

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
  return settings.soundEnabled && settings.ambienceEnabled && hasInteracted;
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
    try {
      const a = new Audio(url);
      a.volume = settings.masterVolume * settings.sfxVolume;
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

  /** Cleanup — useful for hot reload / tests. */
  dispose() {
    androidMark("audio.dispose");
    if (ambience) {
      try { ambience.pause(); } catch {/*ignore*/}
      ambience = null;
    }
  },
};
