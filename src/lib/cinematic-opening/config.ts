// ============================================================
// Cinematic Opening — Config Loader
// ------------------------------------------------------------
// The engine is data-driven. Content lives in a JSON file at
// /data/cinematic-opening.json and is supplied by the product
// team. This module only loads and validates the shape.
//
// If the file is missing, empty, or contains no scenes, the
// engine treats the opening as absent and the app boots normally.
// No fallback content is ever fabricated here.
// ============================================================

import type { CinematicOpeningConfig, CinematicScene } from "./types";

const CONFIG_URL = "/data/cinematic-opening.json";

let cache: CinematicOpeningConfig | null | undefined;

function isScene(x: unknown): x is CinematicScene {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.durationMs === "number";
}

function validate(raw: unknown): CinematicOpeningConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = typeof r.version === "string" ? r.version : null;
  const scenes = Array.isArray(r.scenes) ? r.scenes.filter(isScene) : [];
  if (!version || scenes.length === 0) return null;
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
    const json = await res.json();
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
