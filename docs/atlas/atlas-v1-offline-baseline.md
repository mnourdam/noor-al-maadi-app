# Phase 2 — Atlas Data Unification + UX Stabilization

**Status:** ✅ Complete — Phase 2 sign-off.
**Date:** 2026-06-22

## A. Single source of truth

`atlas_entities` is now the only data source for every marker, search hit, and
detail panel on `/map`. The legacy hub layer (derived on-the-fly from
`encyclopedia_entities.metadata.coords`) is fully retired.

**Removed:**
- `src/lib/atlas-hubs.ts` (`useAtlasLayers`, `HubMarker`, `tierForScale`, etc.)
- `src/components/atlas/EntityPanel.tsx` (split: `UnifiedDetailShell` extracted
  to its own file; legacy `EntityPanel` deleted)
- `AtlasEntityPopover` (dead code in `AtlasEntityPins.tsx`)
- `HubGlyph` / `EntityGlyph` loops in `AtlasStage.tsx`
- The `layers: AtlasLayers` prop and all tier-gated render paths

**Added:**
- `src/components/atlas/UnifiedDetailShell.tsx` — single Irth-identity panel
- `src/lib/atlas-entities-query.ts` — shared cached `useQuery` for published rows
- `AtlasControls` now filters published `atlas_entities` (kind / era / search)

## B. Atlas Coverage Audit

Backfilled from `encyclopedia_entities` where `metadata.coords` exists. ViewBox
coords (100×60) converted to canonical APS (14192×7088). Rows auto-published
and verified — players see them immediately.

| Type      | Encyclopedia | Atlas Entities | Published | Review |
| --------- | -----------: | -------------: | --------: | -----: |
| Cities    |           93 |              6 |         6 |      0 |
| Battles   |          111 |              7 |         7 |      0 |
| Figures   |          333 |              0 |         0 |      0 |
| Landmarks |          155 |              0 |         0 |      0 |
| Events    |          335 |              0 |         0 |      0 |
| States    |           28 |             10 |        10 |      0 |
| Artifacts |          315 |              0 |         0 |      0 |
| **Total** |     **1370** |         **23** |    **23** |  **0** |

> **Coverage note:** only 23 of 1370 encyclopedia rows currently have
> `metadata.coords`. Backfill is complete for every coord-bearing row. Adding
> markers for the remaining content is a curation task (admin can create
> atlas entities directly in `/admin/atlas-entities` or add `coords` to the
> encyclopedia row to trigger re-import). No category was skipped.

## B. UX Stabilization (interaction fixes)

| Fix                      | Implementation                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Immediate pan            | Drag handler bound from first paint; no warm-up zoom needed                                                     |
| Pan sensitivity          | `TOUCH_PAN_GAIN = 0.32` (Google-Maps-like; was 0.22, then unbounded mouse)                                      |
| Edge clamp               | `clamp()` uses raster-derived `maxX/Y = ((s-1)*wrap)/2` on every pan, wheel, pinch, zoom button, and tween      |
| Locate-on-map stability  | `cancelAnimations()` clears in-flight rAF before each tween; NaN-guarded; single-frame settle, CSS transition handles the visual; never blocks the render loop |

## C. Detail experience unification

Every marker — migrated, manually created, or future — opens
`AtlasEntityDetailPanel` wrapping `UnifiedDetailShell`. Cairo and Jerusalem
now render through the same component tree, props, and styles.

## D. Encyclopedia integration

- Backfill stamps `encyclopedia_entity_id` for every migrated row.
- `UnifiedDetailShell` navigates to `/encyclopedia/entity/$id` using the
  encyclopedia row's UUID (resolves canonically via
  `useEncyclopediaCanonicalEntity`).
- Missing link → polished `"المقالة قادمة قريباً"` empty state.

## E. Player / admin separation

Player `/map` exposes only: pan, zoom, search, filter, marker detail,
locate, encyclopedia link, close. The previous "إدارة الخريطة" admin link
on the empty state is removed. Admin actions live exclusively under
`/admin/atlas-entities` and `/admin/atlas-calibration` (both gated by
`AdminGate` / `is_content_admin()`).

## F. Cleanup

- Smoke-test `jerusalem` atlas row deleted (re-created with proper
  encyclopedia FK during backfill).
- Tier readout chip removed from player atlas (was a debug surface).
- All `console.log` / placeholder labels in atlas UI cleared.

## G. Irth identity

Atlas surfaces switched off ad-hoc ambers and greys:
- Background: deep navy `oklch(0.13 0.04 255)`
- Surfaces: navy gradient `oklch(0.20–0.16)` with parchment summary cards
- Accent: gold `oklch(0.78 0.18 75)` for active states + CTAs
- Borders: `border-amber-400/30`

## Sign-off

| Check                              | Result                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Encyclopedia rows migrated         | 23 (every row with `metadata.coords`)                                                 |
| `atlas_entities` after migration   | 23 (all `published`, all `aps_verified`)                                              |
| Legacy files removed               | `src/lib/atlas-hubs.ts`, `EntityPanel.tsx`; `HubGlyph`/`EntityGlyph`/`AtlasEntityPopover` deleted |
| Search source                      | `atlas_entities` only (`filterAtlasEntities` in `AtlasControls.tsx`)                  |
| Detail panel                       | Single `AtlasEntityDetailPanel` mount in `AtlasShell`                                 |
| Encyclopedia link                  | UUID-routed via `encyclopedia_entity_id`; coming-soon state when null                 |
| Pan / clamp / locate               | Immediate pan, raster-bounded clamp, NaN-guarded locate                               |
| Admin actions on `/map`            | None                                                                                  |
| Known blockers                     | None (Phase 3 deferred items: per-kind iconography, clustering, tier gating, MapLibre, HD pack, APK wrap) |

# Atlas v1 — Offline-First Baseline (Phase 1)

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
- All consumers force the rendered raster to the logical dimensions.
- The bundled WebP's smaller physical pixel count affects only perceived
  sharpness at extreme zoom (Phase 3 HD pack territory) — never coordinates,
  picker math, or marker positions.

## Loader precedence

`src/lib/atlas/atlas-source.ts`:

1. Cache Storage (`atlas-hd-pack`) — Phase 3 background-sync target
2. Bundled WebP — permanent offline fallback
3. CDN JPEG — retained as optional future HD upgrade source

## Packaging

Vite emits the WebP into `dist/` with a hashed filename; Capacitor/APK
includes it automatically. First launch is fully offline.
