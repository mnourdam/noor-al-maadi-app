// Phase 0 — APS coordinate utilities.
//
// APS (Atlas Pixel Space): origin top-left of the v1 master, Y-down, integer
// pixels of the 14192×7088 frozen raster. APS is the canonical storage space.
// Everything else — viewBox positions, normalized (u,v), tile coords — is
// derived. See docs/atlas/atlas-calibration-plan.md §1.
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

/** Current SVG viewBox of the live atlas stage (see AtlasStage.tsx). */
export const ATLAS_VIEWBOX = { width: 100, height: 60 } as const;

export type ApsCoord = { x: number; y: number };
export type ViewBoxCoord = { x: number; y: number };
export type NormalizedCoord = { u: number; v: number };

/** APS → normalized (u,v) ∈ [0,1]. */
export function apsToNormalized(p: ApsCoord): NormalizedCoord {
  return {
    u: p.x / ATLAS_V1_PIXEL_SIZE.width,
    v: p.y / ATLAS_V1_PIXEL_SIZE.height,
  };
}

/** Normalized (u,v) → APS. */
export function normalizedToAps(n: NormalizedCoord): ApsCoord {
  return {
    x: n.u * ATLAS_V1_PIXEL_SIZE.width,
    y: n.v * ATLAS_V1_PIXEL_SIZE.height,
  };
}

/**
 * APS → atlas viewBox position. The viewBox is 100×60 (display only); APS is
 * 14192×7088. Aspect ratios differ slightly (2.003 vs 1.667), so a strict
 * proportional mapping is used — the viewBox is the renderer's coordinate
 * frame, not a physical projection. Callers that need true aspect-correct
 * placement should use normalized coords + the renderer's `preserveAspectRatio`
 * behaviour.
 */
export function apsToViewBox(p: ApsCoord): ViewBoxCoord {
  const n = apsToNormalized(p);
  return {
    x: n.u * ATLAS_VIEWBOX.width,
    y: n.v * ATLAS_VIEWBOX.height,
  };
}

/** Atlas viewBox position → APS. Inverse of `apsToViewBox`. */
export function viewBoxToAps(p: ViewBoxCoord): ApsCoord {
  return normalizedToAps({
    u: p.x / ATLAS_VIEWBOX.width,
    v: p.y / ATLAS_VIEWBOX.height,
  });
}

/** Clamp an APS coord into the v1 raster bounds. */
export function clampAps(p: ApsCoord): ApsCoord {
  const { width, height } = ATLAS_V1_PIXEL_SIZE;
  return {
    x: Math.max(0, Math.min(width - 1, p.x)),
    y: Math.max(0, Math.min(height - 1, p.y)),
  };
}

/** True iff APS strictly inside the v1 raster — used by the validator. */
export function isInsideAtlas(p: ApsCoord): boolean {
  const { width, height } = ATLAS_V1_PIXEL_SIZE;
  return p.x >= 0 && p.x < width && p.y >= 0 && p.y < height;
}
