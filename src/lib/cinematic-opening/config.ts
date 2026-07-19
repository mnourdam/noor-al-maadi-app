// ============================================================
// Cinematic Opening — Config Loader & Validator
// ------------------------------------------------------------
// The engine is data-driven. Content lives in a JSON file at
// /data/cinematic-opening.json and is supplied by the product
// team. This module loads it, validates every field, and drops
// malformed scenes rather than crashing the app.
//
// If the file is missing, empty, disabled, invalid, or contains
// zero valid scenes, the engine treats the opening as absent and
// the app boots normally.
// ============================================================

import type {
  CinematicOpeningConfig,
  CinematicScene,
  ParticlePreset,
  SceneTransition,
} from "./types";

const CONFIG_URL = "/data/cinematic-opening.json";

const VALID_TRANSITIONS: readonly SceneTransition[] = [
  "fade-from-black",
  "fade-to-black",
  "crossfade",
  "cut",
];
const VALID_PARTICLES: readonly ParticlePreset[] = ["dust", "gold", "fog", "smoke"];

let cache: CinematicOpeningConfig | null | undefined;

function warn(msg: string, extra?: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.warn(`[cinematic-opening] ${msg}`, extra ?? "");
  } catch { /* ignore */ }
}

function clamp01(n: unknown, fallback?: number): number | undefined {
  if (typeof n !== "number" || !isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function positiveInt(n: unknown, min = 1): number | null {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= min ? v : null;
}

function validateScene(raw: unknown, seenIds: Set<string>, idx: number): CinematicScene | null {
  if (!raw || typeof raw !== "object") {
    warn(`scene[${idx}] rejected — not an object`);
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) {
    warn(`scene[${idx}] rejected — missing id`);
    return null;
  }
  if (seenIds.has(r.id)) {
    warn(`scene[${idx}] rejected — duplicate id "${r.id}"`);
    return null;
  }
  const duration = positiveInt(r.durationMs, 300);
  if (duration === null) {
    warn(`scene[${idx}] "${r.id}" rejected — durationMs must be >= 300ms`);
    return null;
  }
  // Enabled flag: default true; explicit false skips the scene.
  if (r.enabled === false) return null;

  const transitionIn = typeof r.transitionIn === "string" && VALID_TRANSITIONS.includes(r.transitionIn as SceneTransition)
    ? (r.transitionIn as SceneTransition)
    : undefined;
  const transitionOut = typeof r.transitionOut === "string" && VALID_TRANSITIONS.includes(r.transitionOut as SceneTransition)
    ? (r.transitionOut as SceneTransition)
    : undefined;
  const particles = typeof r.particles === "string" && VALID_PARTICLES.includes(r.particles as ParticlePreset)
    ? (r.particles as ParticlePreset)
    : undefined;

  const image = typeof r.image === "string" && r.image.length > 0 ? r.image : undefined;
  const imageAlt = typeof r.imageAlt === "string" ? r.imageAlt : undefined;
  const title = typeof r.title === "string" ? r.title : undefined;
  const subtitle = typeof r.subtitle === "string" ? r.subtitle : undefined;
  const ambientAudio = typeof r.ambientAudio === "string" && r.ambientAudio.length > 0
    ? r.ambientAudio
    : undefined;

  const textDelayMs = positiveInt(r.textDelayMs, 0) ?? undefined;
  const textHoldMsRaw = positiveInt(r.textHoldMs, 0);
  const textHoldMs = textHoldMsRaw === null ? undefined : textHoldMsRaw;

  seenIds.add(r.id);
  return {
    id: r.id,
    image,
    imageAlt,
    title,
    subtitle,
    durationMs: duration,
    textDelayMs,
    textHoldMs,
    transitionIn,
    transitionOut,
    ambientAudio,
    ambientVolume: clamp01(r.ambientVolume, undefined),
    particles,
    particleIntensity: clamp01(r.particleIntensity, undefined),
    overlayDarkness: clamp01(r.overlayDarkness, undefined),
    kenBurns: r.kenBurns === false ? false : undefined,
    allowSkip: r.allowSkip === false ? false : undefined,
    showFinalLogo: r.showFinalLogo === true ? true : undefined,

  };
}

function validate(raw: unknown): CinematicOpeningConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Enabled flag at the top level — a way to ship the file with content
  // ready but temporarily disabled.
  if (r.enabled === false) return null;

  const version = typeof r.version === "string" && r.version.length > 0 ? r.version : null;
  if (!version) {
    warn("config rejected — missing/empty version");
    return null;
  }
  if (!Array.isArray(r.scenes)) {
    warn("config rejected — scenes must be an array");
    return null;
  }
  const seenIds = new Set<string>();
  const scenes: CinematicScene[] = [];
  r.scenes.forEach((s, i) => {
    const v = validateScene(s, seenIds, i);
    if (v) scenes.push(v);
  });
  if (scenes.length === 0) {
    warn("config rejected — no valid scenes after validation");
    return null;
  }
  return {
    version,
    scenes,
    replayForAllUsers: r.replayForAllUsers === true,
  };
}

export async function loadCinematicOpeningConfig(): Promise<CinematicOpeningConfig | null> {
  if (cache !== undefined) return cache;
  try {
    const res = await fetch(CONFIG_URL, { cache: "force-cache" });
    if (!res.ok) { cache = null; return null; }
    const text = await res.text();
    if (!text.trim()) { cache = null; return null; }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      warn("config rejected — invalid JSON");
      cache = null;
      return null;
    }
    cache = validate(json);
    return cache;
  } catch {
    cache = null;
    return null;
  }
}

/** Reset the in-memory cache. Test-only. */
export function __resetCinematicOpeningCache(): void {
  cache = undefined;
}
