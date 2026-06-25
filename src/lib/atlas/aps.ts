// Phase 3 — APS coordinate utilities.
//
// APS (Atlas Pixel Space): origin top-left of the v1 master, Y-down, integer
// pixels of the 14192×7088 frozen raster. APS is the canonical storage space
// AND the SVG viewBox we render into — eliminating any aspect-ratio drift
// between the raster and the pins. The renderer letterboxes/crops via
// `preserveAspectRatio` on the outer <svg>, never by stretching coords.
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

/** SVG viewBox of the live atlas stage = the raster's intrinsic size. */
export const ATLAS_VIEWBOX = {
  width: ATLAS_V1_PIXEL_SIZE.width,
  height: ATLAS_V1_PIXEL_SIZE.height,
} as const;

/** Aspect ratio (w/h) shared by raster and viewBox. */
export const ATLAS_ASPECT = ATLAS_VIEWBOX.width / ATLAS_VIEWBOX.height;

/**
 * Reference scalar: pin sizes and stroke widths were originally tuned for a
 * 100-unit-wide viewBox. Multiply by this to translate those tunings into
 * the current APS-sized viewBox.
 */
export const APS_UNIT_SCALE = ATLAS_VIEWBOX.width / 100;

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
 * APS → atlas viewBox position. Since the viewBox is now the raster's own
 * pixel grid, this is an identity transform — kept as a function for call-site
 * clarity and so any future viewBox change is centralized here.
 */
export function apsToViewBox(p: ApsCoord): ViewBoxCoord {
  return { x: p.x, y: p.y };
}

/** Atlas viewBox position → APS. Inverse of `apsToViewBox`. */
export function viewBoxToAps(p: ViewBoxCoord): ApsCoord {
  return { x: p.x, y: p.y };
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
