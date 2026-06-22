# Atlas v2 — Frozen Edit Specification

**Status:** FROZEN SPEC — not yet executed. Awaiting external raster pipeline (Photoshop / Krita / ComfyUI inpaint).
**Source of truth:** `src/assets/atlas/atlas-v1-master.jpg.asset.json` (CDN-hosted).
**Authoring rule:** Atlas v2 is a *refinement* of v1, not a regeneration. Western 14192 columns must remain byte-identical outside the explicit inpaint masks below.

---

## 1. Canonical Dimensions

| Property | Atlas v1 (frozen) | Atlas v2 (target) |
|---|---|---|
| Width | 14192 px | **17744 px** |
| Height | 7088 px | **7088 px** |
| Aspect ratio | 2.003 : 1 | **2.503 : 1** |
| Format | JPEG (temp source) | **PNG (lossless, mandatory)** |
| Color | sRGB 8-bit | sRGB 8-bit |
| Area | ~100.6 MP | ~125.8 MP (+25%) |
| Eastern extension | — | +3552 px (cols 14192–17743) |

**Coordinate scaling from the original 12288×8192 spec to the real 14192×7088 v1 canvas:**

```
x_v2 = round(x_spec * 14192 / 12288)   // ×1.15560
y_v2 = round(y_spec * 7088  / 8192)    // ×0.86523
```

All bounding boxes below are already rescaled. Original spec coords retained in parentheses for traceability.

---

## 2. Preservation Zones (DO NOT TOUCH)

1. **Western core** — cols `0 … 14191`, all rows. Byte-identical to v1 except inside the 16 inpaint masks in §4.
2. **Approved coastlines** — every existing coastline polygon in v1. No re-shaping. Cleanup of stray pixels only.
3. **Existing labels & cartouches** — typography is locked. No font, kerning, or placement edits.
4. **Compass rose, scale bar, ornamental border** — locked.
5. **Parchment grain & paper texture** — must extend, not be re-synthesized, across the seam.

---

## 3. Outpaint Specification (East Extension)

| Field | Value |
|---|---|
| Region | cols `14192 … 17743`, rows `0 … 7087` |
| Width added | 3552 px |
| Seam column | `x = 14192` |
| Feather into v1 | 256 px (cols `13936 … 14191` are feather-only; pixels remain v1, alpha-blended with new content) |
| Geographic intent | Far-eastern steppe → desert basin → distant mountain wall; sparse settlement; trade-route termini |
| Density target | ≤ 30% of core (sparse, "edge of the known world") |
| Style anchors | Same parchment tone, same ink hatching, same mountain shading vocabulary, same coastline line-weight |

**Negative prompt (outpaint):** modern lettering, neon palette, photographic detail, sci-fi geometry, repeated tiling, watermark, signature, white border, sharp rectangular seam.

---

## 4. Inpaint Sequence (16 Regions, Priority Order)

Execute in order. Re-export PNG between each pass. Mask = exact bbox below, feathered 32 px inward.

| # | Region | bbox (x1,y1,x2,y2) v2 px | Original spec bbox | Intent |
|---|---|---|---|---|
| 1 | Aral Sea correction | 6240,2510, 7050,3110 | (5400,2900, 6100,3600) | Reshape to historically accurate basin; preserve surrounding terrain |
| 2 | Caspian eastern shore | 5320,2940, 6240,3890 | (4600,3400, 5400,4500) | Smooth coastline; remove v1 pixelation |
| 3 | Fergana valley | 7395,3110, 8085,3540 | (6400,3600, 7000,4090) | Add valley shading + river network |
| 4 | Tian Shan ridge | 8085,2770, 9590,3370 | (7000,3200, 8300,3900) | Reinforce mountain hatching; align ridgeline |
| 5 | Pamir knot | 8085,3540, 8895,4150 | (7000,4090, 7700,4800) | Tighten elevation gradient |
| 6 | Hindu Kush southern face | 7625,4150, 8895,4760 | (6600,4800, 7700,5500) | Add south-facing shadow pass |
| 7 | Indus headwaters | 8895,3890, 9935,4760 | (7700,4500, 8600,5500) | Add river system to coast |
| 8 | Tarim basin | 9590,2770, 11675,3540 | (8300,3200, 10110,4090) | Desert stipple + oasis dots |
| 9 | Taklamakan core | 10165,3110, 11440,3805 | (8800,3600, 9900,4400) | Dune hatching; no settlements |
| 10 | Gobi western reach | 11440,2510, 13180,3370 | (9900,2900, 11410,3900) | Sparse desert texture |
| 11 | Mongolian steppe edge | 11440,1730, 13755,2510 | (9900,2000, 11910,2900) | Grass hatching; nomadic camp glyphs |
| 12 | Black Sea NE coast | 3700,2335, 4625,2940 | (3200,2700, 4000,3400) | Coastline smoothing |
| 13 | Anatolian plateau | 2890,2940, 4625,3540 | (2500,3400, 4000,4090) | Plateau shading consistency |
| 14 | Mesopotamian rivers | 3470,3805, 4625,4760 | (3000,4400, 4000,5500) | Tigris + Euphrates ink darkening |
| 15 | Persian Gulf head | 4395,4760, 5320,5455 | (3800,5500, 4600,6300) | Coastline cleanup |
| 16 | Arabian NE coast | 4625,5455, 6010,6320 | (4000,6300, 5200,7300) | Coastal hatching + small ports |

**Per-region negative prompt:** modern roads, GPS grid, lat/long printed numerals, satellite imagery look, anachronistic borders.

---

## 5. Seam-Blending Rules

- **Parchment tone match:** sample mean RGB of a 512×512 patch at `(13700,3500)`; constrain new pixels at the seam to ΔE < 3 vs that sample.
- **Coastline continuity:** any coastline crossing the seam must be hand-stroked in the editor (no model continuation), matching v1 line weight (~3 px) and ink density.
- **Sea texture:** continue v1's horizontal hatching frequency (~7 px period) across the seam.
- **Mountain shading:** match v1's NW-lit shadow convention (light from upper-left).
- **No visible vertical artifact** between col 14191 and 14192 at 100% zoom.

---

## 6. QA Checklist (must all pass to freeze v2)

- [ ] Final canvas is exactly **17744 × 7088** PNG, sRGB, 8-bit, no alpha.
- [ ] Pixel diff vs v1 (cols 0–14191) outside the 16 masks = **0** (bitwise identical).
- [ ] Combined inpaint mask area ≤ **15%** of v1 area (≤ 15.08 MP).
- [ ] Seam ΔE (mean) **< 3** across rows sampled every 256 px.
- [ ] No coastline discontinuity at seam (visual review at 100% and 25%).
- [ ] Eastern third feature density ≤ **30%** of core third density (count labels + glyphs per MP).
- [ ] Each of regions 1–16 visually approved against its stated intent.
- [ ] File size sanity: PNG between 80 MB and 250 MB (outside → investigate).
- [ ] SHA-256 recorded in §8 below.

---

## 7. Freeze Criteria

When all §6 boxes are checked:

1. Export final as `atlas-v2-master.png`.
2. Upload via `lovable-assets create --file <path> --filename atlas-v2-master.png` → write pointer to `src/assets/atlas/atlas-v2-master.png.asset.json`.
3. Update §8 with SHA-256, asset_id, freeze date.
4. Tag in `docs/atlas/atlas-master-plan.md` history table.
5. Mark this document header: `Status: FROZEN — IRTH MASTER ATLAS V2`.

---

## 8. Freeze Record (filled at freeze time)

| Field | Value |
|---|---|
| Asset ID | _pending_ |
| SHA-256 | _pending_ |
| Freeze date | _pending_ |
| Approver | _pending_ |
| Source v1 asset_id | `ee043b12-de34-450a-b8f7-0510eadb423d` |
