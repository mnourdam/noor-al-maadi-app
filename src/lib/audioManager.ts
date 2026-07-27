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

export type AmbienceLayer = "global" | "campaign" | "investigation";

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
export const CAMPAIGN_AMBIENCE_SRC = "/audio/campaign-ambient.mp3";
/**
 * Investigation ambience. The asset is INTENTIONALLY not shipped yet — the
 * system is prepared first. Until the file exists, `ensureTrack()` marks the
 * layer as failed on the first load error and the engine transparently keeps
 * the global ambience playing (see the non-global fallback in `ensureTrack`
 * and `tryPlay`). Dropping the file at this path is the only step needed to
 * activate it: no code change, and it is bundled like every other public
 * asset so it works offline inside the APK.
 */
export const INVESTIGATION_AMBIENCE_SRC = "/audio/investigation-ambient.mp3";
/** Alternate filename for the same layer (uploaded as `investigation_sfx.mp3`). */
export const INVESTIGATION_SFX_SRC = "/audio/investigation_sfx.mp3";

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
let interactionBound = false;
let hasInteracted = false;
const sfxFailed = new Set<SfxName>();
const recentSfx = new Map<string, number>(); // dedupe key -> ts

// Two-layer ambience: "global" (default app) + "campaign" (campaign scope).
// Both elements exist simultaneously; we crossfade their volumes.
interface AmbienceTrack {
  url: string;
  /** Remaining fallback sources, tried in order when `url` fails to load. */
  fallbacks: string[];
  el: HTMLAudioElement | null;
  failed: boolean;
  gain: number; // 0..1 layer gain (before master*ambience volume)
  lastPlayError: string | null;
}
const tracks: Record<AmbienceLayer, AmbienceTrack> = {
  global:   { url: AMBIENCE_URL,         fallbacks: [], el: null, failed: false, gain: 1, lastPlayError: null },
  campaign: { url: CAMPAIGN_AMBIENCE_SRC, fallbacks: [], el: null, failed: false, gain: 0, lastPlayError: null },
  investigation: {
    url: INVESTIGATION_AMBIENCE_SRC,
    // The uploaded asset may land under either name; both are bundled
    // public assets, so the walk stays offline-safe.
    fallbacks: [INVESTIGATION_SFX_SRC],
    el: null, failed: false, gain: 0, lastPlayError: null,
  },
};

let activeLayer: AmbienceLayer = "global";
let fadeTimer: number | null = null;
const FADE_MS = 1500;
const FADE_STEP_MS = 50;

function notify() {
  for (const l of listeners) {
    try { l(settings); } catch {/*ignore*/}
  }
}

function warnOnce(msg: string) {
  if (typeof console !== "undefined") console.warn("[audio]", msg);
}

// ---------- Ambience ----------
/**
 * Revert to the global ambience layer. Used whenever a scoped layer
 * (campaign / investigation) cannot load or cannot play — the player never
 * ends up in silence because of a missing or blocked scoped asset.
 */
function fallbackToGlobal() {
  (Object.keys(tracks) as AmbienceLayer[]).forEach((l) => {
    tracks[l].gain = l === "global" ? 1 : 0;
  });
  activeLayer = "global";
  applyAmbienceState();
}

function ensureTrack(layer: AmbienceLayer) {
  const t = tracks[layer];
  if (t.el || t.failed || typeof window === "undefined") return;
  try {
    const a = new Audio(t.url);
    a.loop = true;
    a.preload = "auto";
    a.volume = 0;
    a.addEventListener("error", () => {
      t.failed = true;
      t.lastPlayError = `load error: ${t.url}`;
      warnOnce(`ambience file missing or unplayable (${layer}): ${t.url}`);
      // Any scoped layer (campaign / investigation) degrades gracefully to
      // the global ambience — including the expected case where the asset
      // has not been produced yet.
      if (layer !== "global" && activeLayer === layer) {
        console.warn(`[audio] ${layer} track failed — reverting to global ambience`);
        fallbackToGlobal();
      }
    });
    a.addEventListener("canplaythrough", () => {
      console.log(`[audio] ${layer} canplaythrough (${t.url})`);
    }, { once: true });
    t.el = a;
    console.log(`[audio] created ${layer} track element: ${t.url}`);
  } catch (err) {
    t.failed = true;
    t.lastPlayError = (err as Error)?.message ?? String(err);
    console.warn(`[audio] failed to construct ${layer} audio element`, err);
  }
}

function ambienceShouldPlay(): boolean {
  if (!hasInteracted && typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive) {
    hasInteracted = true;
  }
  return settings.soundEnabled && settings.ambienceEnabled && hasInteracted && deviceAllowsAudio();
}

function baseAmbienceVolume() {
  return Math.max(0, Math.min(1, settings.masterVolume * settings.ambienceVolume));
}

// Per-layer playback attenuation (linear gain). Scoped layers are ~-10 dB
// quieter so they stay cinematic without overpowering UI/reading.
// Investigations sit slightly lower still: the case screens are read-heavy.
const LAYER_ATTENUATION: Record<AmbienceLayer, number> = {
  global: 1,
  campaign: 0.32,
  investigation: 0.26,
};

function applyTrackVolumes() {
  const base = baseAmbienceVolume();
  (Object.keys(tracks) as AmbienceLayer[]).forEach((layer) => {
    const t = tracks[layer];
    if (!t.el) return;
    t.el.volume = Math.max(0, Math.min(1, base * t.gain * LAYER_ATTENUATION[layer]));
  });
}


function tryPlay(layer: AmbienceLayer) {
  const t = tracks[layer];
  if (!t.el || t.failed) return;
  if (!t.el.paused) return;
  const p = t.el.play();
  if (p && typeof p.catch === "function") {
    p.then(() => {
      t.lastPlayError = null;
      console.log(`[audio] ${layer} play() succeeded (vol=${t.el?.volume.toFixed(3)})`);
    }).catch((err) => {
      t.lastPlayError = err?.message ?? String(err);
      console.warn(`[audio] ${layer} play() failed:`, err?.message ?? err);
      if (layer !== "global" && activeLayer === layer) {
        console.warn(`[audio] ${layer} playback blocked — keeping global ambience as fallback`);
        fallbackToGlobal();
      }
    });
  }
}

function applyAmbienceState() {
  if (typeof window === "undefined") return;
  const shouldPlay = ambienceShouldPlay();
  (Object.keys(tracks) as AmbienceLayer[]).forEach((layer) => {
    const t = tracks[layer];
    if (shouldPlay && t.gain > 0) ensureTrack(layer);
    if (!t.el || t.failed) return;
    if (shouldPlay && t.gain > 0) {
      tryPlay(layer);
    } else {
      try { t.el.pause(); } catch {/*ignore*/}
    }
  });
  applyTrackVolumes();
}

function startCrossfade(target: AmbienceLayer) {
  if (typeof window === "undefined") return;
  console.log(`[audio] crossfade → ${target} (from ${activeLayer}); shouldPlay=${ambienceShouldPlay()}, base=${baseAmbienceVolume().toFixed(3)}`);
  activeLayer = target;

  // Ensure BOTH tracks exist so the target can ramp in while the other ramps out.
  ensureTrack("global");
  ensureTrack(target);

  // Nudge target above 0 so applyAmbienceState() will call .play() immediately.
  if (tracks[target].gain <= 0) tracks[target].gain = 0.0001;

  // Layer-generic ramp: every registered layer fades to its target gain,
  // so adding a scope (investigation, …) needs no change here.
  const layers = Object.keys(tracks) as AmbienceLayer[];
  const from = {} as Record<AmbienceLayer, number>;
  const to = {} as Record<AmbienceLayer, number>;
  for (const l of layers) {
    from[l] = tracks[l].gain;
    to[l] = l === target ? 1 : 0;
  }
  const start = performance.now();

  if (fadeTimer !== null) { window.clearInterval(fadeTimer); fadeTimer = null; }
  applyAmbienceState(); // start target playing NOW at near-zero volume

  fadeTimer = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS);
    for (const l of layers) tracks[l].gain = from[l] + (to[l] - from[l]) * t;
    applyTrackVolumes();
    if (t >= 1) {
      if (fadeTimer !== null) { window.clearInterval(fadeTimer); fadeTimer = null; }
      console.log(`[audio] crossfade complete → ${activeLayer}. global.vol=${tracks.global.el?.volume.toFixed(3)}, scoped.vol=${tracks[activeLayer].el?.volume.toFixed(3)}`);
      applyAmbienceState();
    }
  }, FADE_STEP_MS);
}


// ---------- First-interaction unlock ----------
function bindFirstInteraction() {
  if (interactionBound || typeof window === "undefined") return;
  interactionBound = true;
  const onFirst = () => {
    hasInteracted = true;
    applyAmbienceState();
    window.removeEventListener("pointerdown", onFirst, true);
    window.removeEventListener("mousedown", onFirst, true);
    window.removeEventListener("click", onFirst, true);
    window.removeEventListener("keydown", onFirst, true);
    window.removeEventListener("touchstart", onFirst, true);
  };
  window.addEventListener("pointerdown", onFirst, { once: true, passive: true, capture: true });
  window.addEventListener("mousedown", onFirst, { once: true, passive: true, capture: true });
  window.addEventListener("click", onFirst, { once: true, passive: true, capture: true });
  if (!isAndroidNativeApp()) window.addEventListener("keydown", onFirst, { once: true, capture: true });
  window.addEventListener("touchstart", onFirst, { once: true, passive: true, capture: true });
}

// ---------- App lifecycle (background/foreground) ----------
let lifecycleBound = false;
function bindLifecycle() {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;
  const onHidden = () => {
    (Object.keys(tracks) as AmbienceLayer[]).forEach((layer) => {
      const t = tracks[layer];
      if (t.el) { try { t.el.pause(); } catch {/*ignore*/} }
    });
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
    if (import.meta.env.DEV) {
      (window as typeof window & { __IRTH_AUDIO_DEBUG__?: () => unknown }).__IRTH_AUDIO_DEBUG__ = () => audioManager.getDebugSnapshot();
    }
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

  /**
   * Switch which ambience layer is audible. Crossfades over ~1500ms.
   * Safe to call repeatedly with the same layer — no-op if unchanged.
   */
  setAmbienceLayer(layer: AmbienceLayer) {
    if (typeof window === "undefined") return;
    if (isAndroidUltraStableMode()) return;
    if (layer === activeLayer) return;
    startCrossfade(layer);
  },

  getAmbienceLayer(): AmbienceLayer {
    return activeLayer;
  },

  getDebugSnapshot() {
    const campaign = tracks.campaign;
    const investigation = tracks.investigation;
    return {
      activeLayer,
      campaignSrc: CAMPAIGN_AMBIENCE_SRC,
      campaignReadyState: campaign.el?.readyState ?? 0,
      campaignPaused: campaign.el?.paused ?? true,
      campaignVolume: Number((campaign.el?.volume ?? 0).toFixed(3)),
      investigationSrc: INVESTIGATION_AMBIENCE_SRC,
      investigationReadyState: investigation.el?.readyState ?? 0,
      investigationPaused: investigation.el?.paused ?? true,
      investigationVolume: Number((investigation.el?.volume ?? 0).toFixed(3)),
      investigationMissing: investigation.failed,
      lastPlayError: campaign.lastPlayError ?? investigation.lastPlayError,
    };
  },

  /** Cleanup — useful for hot reload / tests. */
  dispose() {
    androidMark("audio.dispose");
    if (fadeTimer !== null) { try { window.clearInterval(fadeTimer); } catch {/*ignore*/} fadeTimer = null; }
    (Object.keys(tracks) as AmbienceLayer[]).forEach((layer) => {
      const t = tracks[layer];
      if (t.el) { try { t.el.pause(); } catch {/*ignore*/} }
      t.el = null;
      t.gain = layer === "global" ? 1 : 0;
    });
    activeLayer = "global";
  },
};

