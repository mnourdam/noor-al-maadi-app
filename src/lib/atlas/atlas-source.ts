/**
 * Atlas v1 raster source — offline-first.
 *
 * Precedence (synchronous, never blocks first paint):
 *   1. Future HD/tile pack cached via Cache Storage  (key: "atlas-hd-pack")
 *      → wired in Phase 2 alongside the tile pyramid.
 *   2. Bundled WebP shipped with the build (this file).
 *      → permanent offline floor. Always available, no network.
 *
 * The original 51.8 MB JPEG remains addressable via
 *   src/assets/atlas/atlas-v1-master.jpg.asset.json
 * and is kept as the optional online HD upgrade path that a future
 * background sync can swap in. The bundled WebP below is the canonical
 * source used by AtlasStage, AtlasApsPicker, and the calibration screen.
 *
 * Coordinate-space invariant: APS coordinates are stored in the frozen
 * 14192×7088 logical raster (ATLAS_V1_PIXEL_SIZE). The bundled WebP can
 * have any natural pixel size as long as the aspect ratio is preserved
 * (the SVG <image> tag forces width/height to the logical raster size,
 * so the rendered geometry is identical regardless of source resolution).
 */

import atlasBaseWebp from "@/assets/atlas/atlas-v1-base.webp";

/** Bundled offline baseline. Synchronous, always available. */
export const ATLAS_BASE_URL: string = atlasBaseWebp;

/**
 * Returns the URL the atlas UI should render right now.
 * Synchronous on purpose — first paint must never wait on the network.
 * A future Phase 2 hook may upgrade this asynchronously to a cached HD pack.
 */
export function useAtlasRasterUrl(): string {
  return ATLAS_BASE_URL;
}
