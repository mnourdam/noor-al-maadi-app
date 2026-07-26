/**
 * Atlas render-pipeline trace.
 *
 * The Atlas can fail *visually* without throwing: the React tree mounts, no
 * error boundary fires, navigation keeps working — yet the surface paints
 * black. A JS crash reporter cannot see that. This module records the ordered
 * milestones of the render pipeline so a device session can be inspected
 * afterwards in /admin/crash-diagnostics.
 *
 * Milestones (in expected order):
 *   route.mount → shell.mount → stage.mount → stage.size → raster.load
 *   → camera.init → pins.init → frame.first → interaction.ready
 *
 * If the trace stops at a milestone, that is the exact point the pipeline died.
 * Cheap (a bounded array + one localStorage write), never throws.
 */

const KEY = "irth.atlas.trace.v1";
const MAX = 40;

export type AtlasTraceEntry = {
  at: number;
  stage: string;
  detail?: Record<string, unknown>;
};

let buffer: AtlasTraceEntry[] = [];

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(buffer));
  } catch {
    /* storage full / disabled — the in-memory trace still works */
  }
}

/** Starts a fresh trace for one Atlas mount. */
export function beginAtlasTrace(): void {
  buffer = [];
  atlasTrace("trace.begin");
}

export function atlasTrace(stage: string, detail?: Record<string, unknown>): void {
  try {
    buffer.push({ at: Math.round(performance.now()), stage, detail });
    if (buffer.length > MAX) buffer = buffer.slice(-MAX);
    persist();
    if (typeof console !== "undefined") {
      console.info("[atlas:trace]", stage, detail ?? "");
    }
  } catch {
    /* diagnostics must never break the render path */
  }
}

/** Reads back the last recorded trace (in-memory first, then storage). */
export function readAtlasTrace(): AtlasTraceEntry[] {
  if (buffer.length > 0) return [...buffer];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as AtlasTraceEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearAtlasTrace(): void {
  buffer = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
