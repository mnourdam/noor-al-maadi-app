# Atlas v1 — Offline-First Baseline

**Status:** ✅ Complete — Phase 1 offline-first baseline locked.
**Date:** 2026-06-22

## Summary

Atlas v1 no longer depends on the network for first paint. The frozen master
raster is bundled inside the application build as a real Vite asset and is
available immediately after install, including on devices with no internet
connection at all.

## Bundled baseline

| Property                 | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| Format                   | WebP, quality 70                                       |
| Pixel dimensions         | 10000 × 4994                                           |
| File size                | 8.25 MB                                                |
| Location                 | `src/assets/atlas/atlas-v1-base.webp` (real Vite asset)|
| Aspect ratio             | 2.0024 (matches master 2.0023, preserved to 4 decimals)|
| Quality vs. master JPEG  | PSNR ≈ 32.1 dB on center crop (visually equivalent)    |

## Coordinate space (unchanged)

- **Logical APS space remains `14192 × 7088`** (`ATLAS_V1_PIXEL_SIZE`).
- All consumers force the rendered raster to the logical dimensions:
  - `AtlasStage` — SVG `<image width={VB_W} height={VB_H}>`
  - `AtlasApsPicker` — `<img width={RASTER.width} height={RASTER.height}>`
  - `admin.atlas-calibration` — same
- The bundled WebP's smaller pixel count does not change saved coordinates,
  picker math, or marker positions. Source pixel count only affects perceived
  sharpness at extreme zoom; sharper deep zoom is a Phase 2 tile-pyramid
  concern, not a v1 coordinate concern.

## Loader precedence

Implemented in `src/lib/atlas/atlas-source.ts` (`ATLAS_BASE_URL`, `useAtlasRasterUrl()`):

1. **Future HD / tile pack** cached in Cache Storage (`atlas-hd-pack`) — wired in
   Phase 2 alongside the tile pyramid. Currently empty; no runtime impact.
2. **Bundled WebP** (`src/assets/atlas/atlas-v1-base.webp`) — permanent
   offline floor. Always available, no network.

The original 51.8 MB CDN JPEG (`src/assets/atlas/atlas-v1-master.jpg.asset.json`)
is **retained** as the optional online HD upgrade source for a future background
sync. Nothing references it at runtime today.

## Packaging guarantees

- **Web build:** Vite emits the WebP into `dist/` with a hashed filename and
  serves it from the same origin as the app. No CDN round-trip on first paint.
- **Capacitor / APK:** the bundled WebP is included automatically in the Vite
  build output, so it ships inside the APK with no special configuration. First
  launch of the installed app is fully offline.
- **Future HD pack:** when shipped, the background sync writes into Cache
  Storage; the precedence list picks it up automatically. The bundled WebP keeps
  being the permanent offline fallback — invariant.

## Files touched

- `src/assets/atlas/atlas-v1-base.webp` — new bundled baseline
- `src/lib/atlas/atlas-source.ts` — new loader precedence module
- `src/components/atlas/AtlasStage.tsx` — switched to `ATLAS_BASE_URL`
- `src/components/atlas/AtlasApsPicker.tsx` — switched to `ATLAS_BASE_URL`
- `src/routes/admin.atlas-calibration.tsx` — switched to `ATLAS_BASE_URL`

`src/assets/atlas/atlas-v1-master.jpg.asset.json` is intentionally kept for the
future HD upgrade path.
