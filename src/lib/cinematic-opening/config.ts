// ============================================================
// Cinematic Opening — Config Loader
// ------------------------------------------------------------
// The engine consumes a bundled, typed configuration. The data
// lives at `./data.ts` and is imported statically — there is
// NO async fetch of `/data/cinematic-opening.json` at runtime.
//
// The exported function keeps an async signature so existing
// callers do not have to change, but the returned Promise
// resolves synchronously on the microtask queue.
// ============================================================

import type { CinematicOpeningConfig } from "./types";
import { CINEMATIC_OPENING_DATA } from "./data";

export async function loadCinematicOpeningConfig(): Promise<CinematicOpeningConfig | null> {
  // Structured clone so callers cannot mutate the module singleton.
  try {
    return JSON.parse(JSON.stringify(CINEMATIC_OPENING_DATA)) as CinematicOpeningConfig;
  } catch {
    return CINEMATIC_OPENING_DATA;
  }
}

/** Retained for test compatibility. No-op — config is bundled. */
export function __resetCinematicOpeningCache(): void { /* no-op */ }
