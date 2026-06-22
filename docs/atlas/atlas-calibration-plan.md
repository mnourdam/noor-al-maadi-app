# Phase 0 — Atlas Calibration Plan

**Status:** DESIGN ONLY — no code yet.
**Base atlas:** `IRTH MASTER ATLAS V1 — FROZEN` (14192 × 7088 px, asset `ee043b12-de34-450a-b8f7-0510eadb423d`).
**Goal:** a stable coordinate foundation that supports thousands of future entities (cities, landmarks, battles, campaign routes, encyclopedia entries, overlays) without ever requiring another atlas migration.

---

## 1. Coordinate System Design

### 1.1 Authoritative space — Atlas Pixel Space (APS)

- Origin `(0, 0)` = top-left pixel of v1 master.
- Units: integer pixels of the v1 master (14192 × 7088).
- Y axis points **down** (image convention), not up. All docs and code use this convention; no mixed cartographic Y.
- Stored as `{ x: int, y: int, atlas_version: 'v1' }` on every spatial row.
- **APS is canonical.** All gameplay, rendering, search and overlay logic reads APS.

### 1.2 Derived spaces (computed, never stored)

| Space | Use | Derivation |
|---|---|---|
| Normalized `(u, v)` ∈ [0,1] | tile/viewport math | `u = x / 14192`, `v = y / 7088` |
| Tile `(z, tx, ty)` | rendering | from `(u, v)` and zoom level, 256 px tiles |
| Pseudo-geographic `(lon°, lat°)` | UI labels only, "where on Earth" hints | affine fit from anchor table (§3) |
| Hex / grid cell | future gameplay | bucket of APS, defined at gameplay phase |

Pseudo-geographic coordinates are **display-only**. The atlas is a stylized Irth map, not a Mercator projection, so lon/lat is an *approximation* — never the source of truth and never persisted as the primary key.

### 1.3 Versioning rule

Every stored coordinate carries `atlas_version`. A v2 freeze does not migrate rows in place; it adds a remap table (`atlas-master-plan.md §7`). APS values for v1 remain valid forever.

---

## 2. Calibration Architecture

```text
            ┌──────────────────────────────┐
            │  Frozen Atlas v1 raster      │
            │  14192 × 7088, APS canonical │
            └──────────────┬───────────────┘
                           │
              ┌────────────┴────────────┐
              │   Anchor Table (§3)     │  ← 16 hand-placed anchors in APS
              │   src/data/atlas-       │     + real-world (lon, lat) pair
              │   anchors.ts            │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼──────┐   ┌──────▼───────┐  ┌──────▼───────┐
   │ Forward fn │   │ Inverse fn   │  │ Validation   │
   │ geo→APS    │   │ APS→geo      │  │ (§6)         │
   │ (affine +  │   │ (least-sq    │  │              │
   │  warp)     │   │  inverse)    │  │              │
   └─────┬──────┘   └──────┬───────┘  └──────────────┘
         │                 │
         ▼                 ▼
   bulk-import       UI tooltips,
   encyclopedia      "find on Earth"
   entities from
   real lon/lat
```

Three pieces:

1. **Anchor table** — small, audited, version-frozen.
2. **Transform pair** — pure functions `geoToAps(lon, lat)` and `apsToGeo(x, y)` derived from anchors.
3. **Validation harness** — residual-error report per anchor, run on every anchor edit.

---

## 3. Anchor Selection Report

### 3.1 Selection criteria

1. **Spatial coverage** — anchors must span the four quadrants of the canvas; no clustering.
2. **Visual unambiguity on v1** — the anchor must correspond to a feature visible on the raster (coastline corner, river mouth, named city dot, mountain pass).
3. **Historical permanence** — locations whose Earth coordinates have not meaningfully moved in ~1000 years.
4. **Cross-era relevance** — useful across the campaigns, encyclopedia, trade routes, conquests planned for Irth.
5. **Iconic for the user** — anchors double as well-known landmarks for QA review.

### 3.2 Recommended anchor set (16)

Earth lon/lat are WGS84, decimal degrees. APS `(x, y)` is **to be measured against the v1 raster** during execution — placeholder column included so the table layout is final.

| # | Name | Region | Earth (lon°, lat°) | APS (x, y) — to measure | Notes |
|---|---|---|---|---|---|
| 1 | Cordoba | Iberia (NW) | (−4.78, 37.89) | (tbd, tbd) | Far-west anchor; controls western edge tightness |
| 2 | Marrakech | Maghreb (SW) | (−7.99, 31.63) | (tbd, tbd) | Anchors SW quadrant + Atlas mountains |
| 3 | Cairo | Egypt | (31.24, 30.04) | (tbd, tbd) | Nile delta hinge |
| 4 | Alexandria | Egypt coast | (29.92, 31.20) | (tbd, tbd) | Coastline pair with Cairo, fixes delta shape |
| 5 | Jerusalem | Levant | (35.23, 31.78) | (tbd, tbd) | Center-south, dense reference region |
| 6 | Damascus | Levant inland | (36.29, 33.51) | (tbd, tbd) | Pairs with Jerusalem for inland scale |
| 7 | Constantinople | Bosporus | (28.98, 41.01) | (tbd, tbd) | NW anchor; locks Black Sea / Aegean hinge |
| 8 | Mecca | Hejaz | (39.83, 21.42) | (tbd, tbd) | South-central; controls Arabian peninsula |
| 9 | Medina | Hejaz | (39.61, 24.47) | (tbd, tbd) | Pairs with Mecca; small-scale residual check |
| 10 | Baghdad | Mesopotamia | (44.36, 33.31) | (tbd, tbd) | Central crossroad |
| 11 | Basra | Lower Mesopotamia | (47.78, 30.51) | (tbd, tbd) | Persian Gulf head |
| 12 | Isfahan | Persia | (51.67, 32.65) | (tbd, tbd) | Central Persia |
| 13 | Nishapur | Khorasan | (58.80, 36.21) | (tbd, tbd) | NE Persia, bridges to Transoxiana |
| 14 | Samarkand | Transoxiana | (66.97, 39.65) | (tbd, tbd) | Far-east-inland; Silk Road hinge |
| 15 | Bukhara | Transoxiana | (64.42, 39.77) | (tbd, tbd) | Small-scale residual pair with Samarkand |
| 16 | Delhi | Indian subcontinent | (77.10, 28.70) | (tbd, tbd) | SE anchor; locks far-east bound of v1 |

### 3.3 Coverage check

```text
       W────────────────────────E
   N   Const          Nishapur  Samarkand
       Cordoba                  Bukhara
       Marrakech  Damascus
       Alexandria  Jerusalem Baghdad Isfahan
                   Cairo     Basra        Delhi
   S                      Medina
                            Mecca
```

Four quadrants are populated. Three close pairs (Alex/Cairo, Mecca/Medina, Sam/Bukhara) double as small-scale residual probes that catch local warping the global fit would otherwise hide.

### 3.4 Anchor placement workflow (Phase 0 execution)

1. Open v1 master in a pixel-accurate viewer at 100% zoom.
2. For each anchor, identify the on-raster feature (city dot, coastline corner) and record `(x, y)` integers.
3. Two reviewers independently place each anchor; disagreement > 8 px → re-discuss, do not average silently.
4. Commit final values to `src/data/atlas-anchors.ts` and freeze with the v1 freeze record.

---

## 4. Transformation Strategy

### 4.1 Primary transform — global affine

A 6-parameter affine map fit to all 16 anchors via least squares:

```
[ x ]   [ a  b  c ] [ lon ]
[ y ] = [ d  e  f ] [ lat ]
                    [  1  ]
```

- Pure JS, no deps; one-time fit at app start (or precomputed and cached in `atlas-transform.json`).
- Cheap, deterministic, invertible.
- Adequate when residuals (§6) stay within tolerance.

### 4.2 Local refinement — thin-plate spline (TPS) warp

For Irth's stylized geography the affine alone will leave 30–80 px residuals in regions with distorted coastlines. Add a TPS warp on top of the affine:

```
APS = Affine(geo) + Σᵢ wᵢ · φ(‖geo − anchorᵢ‖)
   where φ(r) = r² log r
```

- Exact interpolation at every anchor (residual = 0 by construction).
- Smooth blend between anchors.
- Pure-function implementation; weights `wᵢ` solved once from the anchor table.

### 4.3 Inverse transform

- Affine: closed-form inverse of the 2×2 linear part.
- TPS: not closed-form; use 2D Newton iteration seeded by the affine inverse (3–5 iterations converges to sub-pixel).

### 4.4 What ships

`src/lib/atlas/transform.ts` (to be authored at execution) exports:

```ts
geoToAps(lon: number, lat: number, version?: 'v1'): { x: number; y: number }
apsToGeo(x: number, y: number, version?: 'v1'): { lon: number; lat: number }
```

Both are pure, deterministic, side-effect-free, and safe to call from server functions or the client.

---

## 5. Mapping Existing & Future Entities

### 5.1 Existing procedural atlas entities

The current `atlas-regions.ts` and `atlas-hubs.ts` live in SVG/abstract space. Plan:

1. Catalogue each procedural entity with its current coordinates.
2. For each, assign an APS coordinate by either:
   - mapping its known real-world city through `geoToAps`, or
   - hand-placing on the v1 raster when the entity is mythical/Irth-original (no Earth equivalent).
3. Record `{ id, name, aps: {x,y}, atlas_version: 'v1', source: 'geo' | 'hand' }`.
4. Keep procedural SVG as the **interactive overlay layer only**; the basemap is the frozen raster.

### 5.2 Future encyclopedia entities

Two ingestion paths, both writing APS:

**Path A — real-world-anchored entity** (most cities, real battles, real trade hubs)
- Author supplies `(lon, lat)`.
- Pipeline calls `geoToAps(lon, lat)` → APS.
- Stored fields: `aps_x`, `aps_y`, `atlas_version`, `source = 'geo'`, plus original `lon`, `lat` for traceability.

**Path B — Irth-original entity** (mythical city, invented landmark, in-world-only event)
- Author hand-places on the atlas via an internal placement tool.
- Stored fields: `aps_x`, `aps_y`, `atlas_version`, `source = 'hand'`, `lon`/`lat` null.

Both paths produce identical downstream shape — every consumer reads APS, never the source.

### 5.3 Supabase schema additions (designed, not applied)

Add to every spatial table (`encyclopedia_entities`, `investigations`, `today_in_history_events`, future `cities`, `battles`, `routes`):

```sql
ALTER TABLE <table>
  ADD COLUMN aps_x integer,
  ADD COLUMN aps_y integer,
  ADD COLUMN atlas_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN coord_source text CHECK (coord_source IN ('geo','hand')),
  ADD COLUMN lon double precision,
  ADD COLUMN lat double precision;

CREATE INDEX <table>_aps_idx ON <table> (atlas_version, aps_x, aps_y);
```

RLS unchanged. Routes (line/polygon) get an `aps_path jsonb` column with `[{x,y},…]`.

---

## 6. Validation Strategy

Run on every change to the anchor table; block freeze if any check fails.

1. **Leave-one-out residual test.** For each of the 16 anchors, fit the transform on the other 15, predict the held-out anchor's APS, record pixel error. Pass threshold: median ≤ 25 px, max ≤ 80 px.
2. **Close-pair scale check.** Distances Alex↔Cairo, Mecca↔Medina, Sam↔Bukhara must round-trip within 5% of their great-circle ratio.
3. **Coastline sanity.** Project 50 hand-picked coastline samples (Mediterranean, Red Sea, Persian Gulf, Caspian) through `geoToAps`; each must land within 40 px of the visible v1 coastline.
4. **Inverse round-trip.** For 200 random APS samples, `geoToAps(apsToGeo(x,y))` must return within 1 px.
5. **Boundary clamp.** All anchor APS values strictly inside `[0, 14192) × [0, 7088)`.
6. **Visual audit page.** A dev-only route renders the atlas with anchor dots + residual vectors; reviewed by eye before freeze.

Validation results are written to `docs/atlas/atlas-calibration-report.md` and dated.

---

## 7. Migration Strategy for Future Content

### 7.1 Within v1

- Schema is stable. Backfilling existing rows = run a one-shot script that calls `geoToAps` for rows with `lon/lat` set, leaves `coord_source='hand'` rows untouched.
- New rows always pass through Path A or Path B (§5.2).

### 7.2 v1 → v2 (when v2 freezes)

- Do **not** rewrite v1 rows. Insert a `atlas_coord_remap` table (per `atlas-master-plan.md §7`).
- Re-fit the transform against v2's anchor table (same 16 names, new APS values).
- Client picks the active atlas version on launch; rendering layer remaps APS via the remap table or by re-projecting through geo (for `source='geo'` rows, this is free).
- `source='hand'` rows on Irth-original entities: hand-review in the placement tool; the eastern outpaint region is empty in v1 so most hand placements remain valid as-is.

### 7.3 Authoring guardrails (encoded as lint / DB constraints)

- A row may not be inserted without `(aps_x, aps_y, atlas_version, coord_source)`.
- `coord_source='geo'` requires non-null `lon`, `lat`.
- `atlas_version` is foreign-keyed to a small `atlas_versions` table so old client builds reject unknown versions cleanly.

---

## 8. Deliverables Summary

| Deliverable | Location | State |
|---|---|---|
| Calibration plan (this doc) | `docs/atlas/atlas-calibration-plan.md` | ✅ delivered |
| Anchor selection report | §3 of this doc | ✅ delivered |
| Coordinate architecture | §1, §2, §4 of this doc | ✅ delivered |
| Validation strategy | §6 of this doc | ✅ delivered |
| Migration strategy | §7 of this doc | ✅ delivered |
| Anchor table (provisional APS) | `src/data/atlas-anchors.ts` | ✅ delivered, ⏳ visual re-measurement |
| Coordinate utilities (APS ↔ viewBox, normalized) | `src/lib/atlas/aps.ts` | ✅ delivered |
| Transform implementation (geo ↔ APS, affine) | `src/lib/atlas/transform.ts` | ✅ delivered (TPS deferred) |
| Validator | `scripts/validate-atlas-calibration.ts` | ✅ delivered (`bunx tsx scripts/validate-atlas-calibration.ts`) |
| Validation report | `docs/atlas/atlas-calibration-report.md` | ✅ auto-generated |
| Supabase schema migration | new migration file | ⏳ Phase 0.5 (after anchor re-measurement) |

---

## 9. Out of Scope for Phase 0

- Tile pyramid generation (Phase 1).
- APK bundling (Phase 2).
- In-app renderer wiring (Phase 3).
- Atlas v2 raster execution (deferred per `atlas-v2-edit-package.md`).

---

## 10. Phase 0 Execution Notes (this pass)

- Anchors were seeded by linear projection from `LONLAT_BBOX_V1` (lon −12…80, lat 8…48). Every anchor is flagged `verified: false`; per §3.4 a reviewer must place each one on the v1 raster at 100% zoom and replace the seed values.
- Affine fit currently shows artificially low residuals (median <1 px) because the anchors lie on the linear seed by construction. Real residual numbers will appear once anchors are visually measured.
- TPS local refinement is implemented in spec only; affine alone covers Phase 0's ingestion-seeding goal and validator scaffolding.
- The new utility module is additive — no existing atlas code (regions, hubs, stage) imports it yet. Visual atlas rendering is unchanged.

