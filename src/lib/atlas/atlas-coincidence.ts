// V16 — Atlas coincident-marker resolution (pure, deterministic).
//
// Some published atlas entities share identical or near-identical APS
// coordinates (e.g. دلهي / سلطنة دلهي, الخلافة الراشدة / المدينة المنورة,
// معركة وادي لكة / معركة العقاب). Their emblem circles fully overlap, so one
// of the pair is effectively untappable.
//
// This module computes a MICRO-OFFSET, applied at render time only:
//   • deterministic — derived from stable id ordering, never random
//   • applied ONLY to genuinely overlapping markers (a unique marker gets 0,0)
//   • visually small, so geographic meaning is preserved
//   • never a cluster glyph, never spiderfy, never a DB/content mutation
//   • always clamped inside the APS raster bounds
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

/** Two markers closer than this (APS px) are treated as physically overlapping. */
export const COINCIDENCE_EPSILON = 45;
/** Radial displacement applied to each member of an overlapping group (APS px). */
export const COINCIDENCE_SEPARATION = 120;

const MAX_X = ATLAS_V1_PIXEL_SIZE.width - 1;
const MAX_Y = ATLAS_V1_PIXEL_SIZE.height - 1;

export type CoincidenceInput = { id: string; x: number; y: number };
export type CoincidenceOffset = { dx: number; dy: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Build a deterministic id → offset map. Only ids belonging to a group of two
 * or more overlapping markers appear in the map; everything else is absent
 * (equivalent to a zero offset).
 */
export function computeCoincidenceOffsets(
  points: readonly CoincidenceInput[],
  opts?: { epsilon?: number; separation?: number },
): Map<string, CoincidenceOffset> {
  const epsilon = opts?.epsilon ?? COINCIDENCE_EPSILON;
  const separation = opts?.separation ?? COINCIDENCE_SEPARATION;
  const out = new Map<string, CoincidenceOffset>();

  // Stable input order → stable groups → stable offsets.
  const items = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (items.length < 2) return out;

  // Spatial hash on an epsilon grid, then link across the 3×3 neighbourhood.
  const cell = Math.max(1, epsilon);
  const buckets = new Map<string, number[]>();
  items.forEach((p, i) => {
    const key = `${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
    const b = buckets.get(key);
    if (b) b.push(i); else buckets.set(key, [i]);
  });

  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const eps2 = epsilon * epsilon;
  items.forEach((p, i) => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const b = buckets.get(`${gx}:${gy}`);
        if (!b) continue;
        for (const j of b) {
          if (j <= i) continue;
          const q = items[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          if (dx * dx + dy * dy <= eps2) union(i, j);
        }
      }
    }
  });

  const groups = new Map<number, number[]>();
  items.forEach((_, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i); else groups.set(r, [i]);
  });

  for (const members of groups.values()) {
    if (members.length < 2) continue; // unique marker → zero offset
    const k = members.length;
    // Members are already in sorted-id order (indices ascend with sort order).
    members.forEach((idx, n) => {
      const p = items[idx];
      const angle = (2 * Math.PI * n) / k - Math.PI / 2;
      const radius = separation * (k === 2 ? 0.5 : 0.75);
      const rawX = p.x + Math.cos(angle) * radius;
      const rawY = p.y + Math.sin(angle) * radius;
      const nx = clamp(rawX, 0, MAX_X);
      const ny = clamp(rawY, 0, MAX_Y);
      out.set(p.id, { dx: nx - p.x, dy: ny - p.y });
    });
  }

  return out;
}

/** Apply an offset map to a single point, clamped into APS bounds. */
export function applyCoincidenceOffset(
  id: string,
  x: number,
  y: number,
  offsets: Map<string, CoincidenceOffset> | null | undefined,
): { x: number; y: number } {
  const o = offsets?.get(id);
  if (!o) return { x, y };
  return { x: clamp(x + o.dx, 0, MAX_X), y: clamp(y + o.dy, 0, MAX_Y) };
}
