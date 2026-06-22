# Irth Master Atlas — Master Plan

**Status of base atlas:** `IRTH MASTER ATLAS V1 — FROZEN` (2026-06-22)
**Status of v2:** spec frozen, execution deferred — see `atlas-v2-edit-package.md`.

This document is the durable record of every atlas decision. Do not delete entries — append.

---

## 1. Atlas History

| Version | Date | Dimensions | Format | Status | Notes |
|---|---|---|---|---|---|
| v0 (procedural) | pre-2026-06 | SVG | vector | superseded | Components: `AtlasViewport`, `WorldAtlasCanvas`, `HistoricalAtlasBase`, data in `atlas-regions.ts` / `atlas-hubs.ts`. Retained only as procedural overlays. |
| **v1** | 2026-06-22 | **14192 × 7088** | JPEG | **FROZEN** | Uploaded master (`magnific__enhance__…`). Asset: `ee043b12-de34-450a-b8f7-0510eadb423d`. Aspect 2.003:1. JPEG accepted as temporary source under Option C. |
| v2 (spec) | 2026-06-22 | 17744 × 7088 | PNG | spec frozen, execution pending | +3552 px east outpaint, 16 inpaint regions. See edit package. |

---

## 2. Approved Bounds

- **v1 canvas:** 14192 × 7088 px, aspect 2.003 : 1.
- **v2 canvas (target):** 17744 × 7088 px, aspect 2.503 : 1.
- **Geographic envelope:** Mediterranean basin (west) → Mongolian/Far-East steppe (east); Caucasus/Aral latitude band centered; Arabian peninsula southern reach.
- **Calibration anchors (v1 pixel space):** Aral Sea centroid ≈ (6645, 2810); Fergana ≈ (7740, 3325); Caspian east shore ≈ (5780, 3415); seam reference column at x = 14192 (will exist only in v2).
- **Bounds policy:** these are timeless. No further bounds migrations after v2 freeze.

---

## 3. Offline-First Strategy

- The atlas is the single durable spatial substrate. All gameplay, encyclopedia, investigations, trade routes, conquests, scholars and museums attach by pixel-space coordinates against the frozen master.
- The app must render the atlas with **zero network dependency** after install.
- Online updates (Supabase) layer *data only* (entities, events, routes), never replace the base raster.
- Coordinate system is **atlas-pixel-space**, not lat/long. Real-world geo overlays are derived, not authoritative.

---

## 4. Tile Strategy (decision: C1)

- **Source:** frozen master PNG (v1 now, v2 when executed).
- **Tile size:** 256 × 256.
- **Pyramid:** standard XYZ, levels 0..N where level N covers the full master at 1:1.
- **Power-of-two padding:** **not enforced.** Non-pow2 master accepted; edge tiles padded with parchment-tone fill. Geographic integrity > tile-math purity.
- **Format:** WebP (lossy q=85) for mid/low zoom levels, PNG for level N (lossless detail).
- **Storage:** tiles bundled in APK at install time (see §6). No runtime tile fetch.
- **Generation:** offline pipeline (vips/gdal2tiles or libvips dzsave). Script lives in `scripts/atlas/build-tiles.sh` (to be authored at calibration phase).

---

## 5. Calibration Strategy

Phase 0 — Calibration Anchors:

1. Define 8–12 anchor points in atlas-pixel-space corresponding to canonical Irth landmarks (Aral, Fergana, Caspian-E, Mediterranean-E, Black Sea-N, Persian Gulf head, Indus mouth, Gobi-W, Mongolia-NE).
2. Store anchors in `src/data/atlas-anchors.ts` (typed `{ id, name, x, y, semantics }`).
3. Anchors define the affine transform between atlas-pixel-space and any future overlay coordinate systems (gameplay grid, hex grid, lat/long approximation).
4. Anchors are **frozen with the atlas version**. v2 freeze invalidates only the pixel positions, not the anchor IDs — values get re-recorded per version.

---

## 6. APK Bundling Strategy

- **Bundle target:** full tile pyramid + the highest-zoom master at install time.
- **Compression:** tiles already WebP/PNG; APK uses default Zip store (no recompression of compressed payloads).
- **Estimated payload:** ~120–250 MB for v1 pyramid; ~150–320 MB for v2.
- **Asset path inside APK:** `assets/atlas/tiles/{z}/{x}/{y}.webp` + `assets/atlas/master.png`.
- **Integrity:** SHA-256 of master recorded in `atlas-v2-edit-package.md §8` and shipped in `assets/atlas/manifest.json` so the client can verify on first launch.
- **No streaming fallback** in v1 of the app. If the bundled atlas is missing, the app refuses to start with a clear error.

---

## 7. Supabase Update Strategy

- Supabase stores **only overlay data** keyed to atlas-pixel-space: entities, POIs, routes, events, campaigns, encyclopedia links, user annotations.
- Schema rule: every spatial row carries `atlas_version` (text, e.g. `"v1"` / `"v2"`) and `(x, y)` integers. RLS enforced.
- Migration path between atlas versions: a one-off mapping table `atlas_coord_remap(from_version, to_version, x_in, y_in, x_out, y_out)` populated from anchor deltas. Client picks the active version on launch; legacy rows are remapped lazily.
- No atlas binary or tile ever lives in Supabase storage. Master + tiles live in the APK (offline) and the Lovable CDN (build-time).

---

## 8. Future Expansion Policy

- **No further bounds changes after v2 freeze.** Any new region must fit within the v2 canvas or be expressed as a *separate detail map* attached to a v2 anchor.
- New content types attach via overlay data only.
- If a v3 ever becomes necessary, it must follow the same Option-A workflow: refine, not regenerate; preserve ≥85% of v2 pixels; record decisions by appending to §1 here.
- The procedural SVG layer (`AtlasViewport` etc.) remains the *interactive overlay surface*, never the basemap.

---

## 9. Immediate Next Actions (post-freeze of v1)

1. Author `src/data/atlas-anchors.ts` with v1 anchor coordinates (Phase 0).
2. Author `scripts/atlas/build-tiles.sh` for the v1 pyramid (offline pipeline, not in-app).
3. Define `assets/atlas/manifest.json` schema (version, sha256, tile levels, anchor checksum).
4. Wire the in-app atlas renderer to consume the bundled tile pyramid via the manifest.
5. Defer v2 execution until a true raster-inpaint pipeline is available; spec is already frozen.
