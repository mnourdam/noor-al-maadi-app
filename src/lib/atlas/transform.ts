// Phase 0 — geo ↔ APS transform.
//
// Implementation strategy: 6-parameter affine fit (least squares) over the
// 16 anchors. TPS refinement is deferred to a later phase; the affine alone
// is enough to validate the anchor table and to seed bulk lon/lat ingestion.
//
// Pure, deterministic, side-effect free. Safe in server functions and client.
import { ATLAS_ANCHORS_V1, type AtlasAnchor, type AtlasVersion } from "@/data/atlas-anchors";

export type GeoCoord = { lon: number; lat: number };
export type ApsCoord = { x: number; y: number };

/**
 * Affine parameters mapping (lon, lat, 1) → (x, y).
 *   x = ax*lon + bx*lat + cx
 *   y = ay*lon + by*lat + cy
 */
export type AffineParams = {
  ax: number; bx: number; cx: number;
  ay: number; by: number; cy: number;
};

// ── Linear algebra (3x3 symmetric solve via Gaussian elimination) ──────────
function solve3x3(A: number[][], b: number[]): number[] {
  // Gauss-Jordan with partial pivoting on a 3×4 augmented matrix.
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    // pivot
    let pivot = i;
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    }
    if (pivot !== i) [M[i], M[pivot]] = [M[pivot], M[i]];
    const div = M[i][i];
    if (Math.abs(div) < 1e-12) throw new Error("singular anchor matrix");
    for (let c = i; c < 4; c++) M[i][c] /= div;
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

/**
 * Least-squares fit of (lon, lat) → (x, y) over a set of anchors.
 * Solves the normal equations Aᵀ A p = Aᵀ b separately for x and y.
 */
export function fitAffine(anchors: readonly AtlasAnchor[]): AffineParams {
  if (anchors.length < 3) throw new Error("need ≥3 anchors to fit affine");
  // Build AᵀA (3×3) and AᵀBx, AᵀBy (3-vectors).
  const AtA: number[][] = [[0,0,0],[0,0,0],[0,0,0]];
  const AtBx = [0, 0, 0];
  const AtBy = [0, 0, 0];
  for (const a of anchors) {
    const row = [a.lon, a.lat, 1];
    for (let i = 0; i < 3; i++) {
      AtBx[i] += row[i] * a.aps.x;
      AtBy[i] += row[i] * a.aps.y;
      for (let j = 0; j < 3; j++) AtA[i][j] += row[i] * row[j];
    }
  }
  const [ax, bx, cx] = solve3x3(AtA.map((r) => [...r]), AtBx);
  const [ay, by, cy] = solve3x3(AtA.map((r) => [...r]), AtBy);
  return { ax, bx, cx, ay, by, cy };
}

/** Closed-form inverse of the 2×2 linear part for apsToGeo. */
export function invertAffine(p: AffineParams) {
  const det = p.ax * p.by - p.bx * p.ay;
  if (Math.abs(det) < 1e-12) throw new Error("non-invertible affine");
  const ia = p.by / det;
  const ib = -p.bx / det;
  const ic = -p.ay / det;
  const id = p.ax / det;
  // (lon, lat) = inv2x2 · (x - cx, y - cy)
  return (x: number, y: number): GeoCoord => {
    const dx = x - p.cx;
    const dy = y - p.cy;
    return { lon: ia * dx + ib * dy, lat: ic * dx + id * dy };
  };
}

// ── Cached default transform from the v1 anchor table ──────────────────────
let _cached: { params: AffineParams; inv: (x: number, y: number) => GeoCoord } | null = null;
function defaultTransform() {
  if (_cached) return _cached;
  const params = fitAffine(ATLAS_ANCHORS_V1);
  _cached = { params, inv: invertAffine(params) };
  return _cached;
}

/** Reset cache — used by validation when the anchor table changes at runtime. */
export function resetTransformCache() { _cached = null; }

/** Convert real-world (lon, lat) to APS using the v1 anchor-fit. */
export function geoToAps(lon: number, lat: number, version: AtlasVersion = "v1"): ApsCoord {
  if (version !== "v1") throw new Error(`unknown atlas version: ${version}`);
  const { params: p } = defaultTransform();
  return { x: p.ax * lon + p.bx * lat + p.cx, y: p.ay * lon + p.by * lat + p.cy };
}

/** Convert APS to (lon, lat). Display-only — atlas is stylized, not Mercator. */
export function apsToGeo(x: number, y: number, version: AtlasVersion = "v1"): GeoCoord {
  if (version !== "v1") throw new Error(`unknown atlas version: ${version}`);
  return defaultTransform().inv(x, y);
}

/** Per-anchor residual = distance between measured APS and predicted APS. */
export function residuals(
  anchors: readonly AtlasAnchor[],
  params: AffineParams,
): Array<{ id: string; dx: number; dy: number; dist: number }> {
  return anchors.map((a) => {
    const px = params.ax * a.lon + params.bx * a.lat + params.cx;
    const py = params.ay * a.lon + params.by * a.lat + params.cy;
    const dx = a.aps.x - px;
    const dy = a.aps.y - py;
    return { id: a.id, dx, dy, dist: Math.hypot(dx, dy) };
  });
}

/**
 * Leave-one-out validation per docs §6.1.
 * Fits on the other 15 anchors, predicts the held-out one, returns pixel error.
 */
export function leaveOneOut(anchors: readonly AtlasAnchor[]) {
  return anchors.map((held) => {
    const rest = anchors.filter((a) => a.id !== held.id);
    const p = fitAffine(rest);
    const px = p.ax * held.lon + p.bx * held.lat + p.cx;
    const py = p.ay * held.lon + p.by * held.lat + p.cy;
    const dx = held.aps.x - px;
    const dy = held.aps.y - py;
    return { id: held.id, dx, dy, dist: Math.hypot(dx, dy) };
  });
}

// ── Thin-Plate Spline (TPS) ────────────────────────────────────────────────
// Stylized-atlas model: TPS interpolates exactly at every anchor and produces
// a smooth artistic-aware warp elsewhere. The useful diagnostic is leave-one-
// out TPS: a "good" pin sits where its neighbors would predict; a misplaced
// pin (wrong city / wrong region) yields a large LOO error.

/** Solve a general n×n linear system via Gauss-Jordan w/ partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    }
    if (pivot !== i) [M[i], M[pivot]] = [M[pivot], M[i]];
    const div = M[i][i];
    if (Math.abs(div) < 1e-12) throw new Error("singular TPS matrix");
    for (let c = i; c <= n; c++) M[i][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      if (f === 0) continue;
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}

const tpsKernel = (r2: number) => (r2 <= 0 ? 0 : r2 * Math.log(r2) * 0.5);

export type TpsModel = {
  ctrls: Array<{ lon: number; lat: number }>;
  /** Weights for x output: [w0..w_{n-1}, a0, a_lon, a_lat]. */
  wx: number[];
  wy: number[];
};

/**
 * Fit a TPS that interpolates (lon, lat) → (x, y) exactly at every anchor.
 * Requires ≥3 non-colinear control points.
 */
export function fitTPS(anchors: readonly AtlasAnchor[]): TpsModel {
  const n = anchors.length;
  if (n < 3) throw new Error("need ≥3 anchors for TPS");
  const sz = n + 3;
  const L: number[][] = Array.from({ length: sz }, () => new Array(sz).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dlon = anchors[i].lon - anchors[j].lon;
      const dlat = anchors[i].lat - anchors[j].lat;
      L[i][j] = tpsKernel(dlon * dlon + dlat * dlat);
    }
    L[i][n] = 1;
    L[i][n + 1] = anchors[i].lon;
    L[i][n + 2] = anchors[i].lat;
    L[n][i] = 1;
    L[n + 1][i] = anchors[i].lon;
    L[n + 2][i] = anchors[i].lat;
  }
  const bx = new Array(sz).fill(0);
  const by = new Array(sz).fill(0);
  for (let i = 0; i < n; i++) {
    bx[i] = anchors[i].aps.x;
    by[i] = anchors[i].aps.y;
  }
  const wx = solveLinear(L.map((r) => [...r]), bx);
  const wy = solveLinear(L.map((r) => [...r]), by);
  return { ctrls: anchors.map((a) => ({ lon: a.lon, lat: a.lat })), wx, wy };
}

/** Evaluate a TPS model at (lon, lat). */
export function evalTPS(m: TpsModel, lon: number, lat: number): ApsCoord {
  const n = m.ctrls.length;
  let x = m.wx[n] + m.wx[n + 1] * lon + m.wx[n + 2] * lat;
  let y = m.wy[n] + m.wy[n + 1] * lon + m.wy[n + 2] * lat;
  for (let i = 0; i < n; i++) {
    const dlon = lon - m.ctrls[i].lon;
    const dlat = lat - m.ctrls[i].lat;
    const k = tpsKernel(dlon * dlon + dlat * dlat);
    x += m.wx[i] * k;
    y += m.wy[i] * k;
  }
  return { x, y };
}

/** Leave-one-out using TPS: fit on n-1 anchors, predict the held-out one. */
export function leaveOneOutTPS(anchors: readonly AtlasAnchor[]) {
  return anchors.map((held) => {
    const rest = anchors.filter((a) => a.id !== held.id);
    const m = fitTPS(rest);
    const p = evalTPS(m, held.lon, held.lat);
    const dx = held.aps.x - p.x;
    const dy = held.aps.y - p.y;
    return { id: held.id, dx, dy, dist: Math.hypot(dx, dy) };
  });
}
