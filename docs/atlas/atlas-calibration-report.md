# Atlas Calibration Report

_Generated: 2026-06-22T20:07:46.864Z_

**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (14192×7088)
**Anchors:** 16
**Overall:** ⚠️ PASS WITH WARNINGS

## Checks

| # | Check | Status | Detail |
|---|---|---|---|
| 1 | Boundary clamp (APS inside raster) | PASS | all 16 anchors inside [0, 14192) × [0, 7088) |
| 2 | Affine residuals (median ≤ 25 px, max ≤ 80 px) | PASS | median=0.4 px, max=0.5 px |
| 3 | Leave-one-out (median ≤ 25 px, max ≤ 80 px) | PASS | median=0.5 px, max=0.8 px |
| 4 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | worst residual = 2.60e-12 px |
| 5 | Close-pair scale check (within 5% of global px/km) | WARN | alexandria↔cairo: 0.978× ref (ok); mecca↔medina: 0.972× ref (ok); samarkand↔bukhara: 1.099× ref (drift) |
| 6 | Anchor verification (visual measurement on v1 raster) | WARN | 16/16 anchors PROVISIONAL — re-measure per plan §3.4: cordoba, marrakech, cairo, alexandria, jerusalem, damascus, constantinople, mecca, medina, baghdad, basra, isfahan, nishapur, samarkand, bukhara, delhi |

## Per-anchor residuals (affine fit on all 16)

| Anchor | Δx | Δy | dist (px) |
|---|---|---|---|
| damascus | -0.4 | 0.3 | 0.5 |
| samarkand | -0.3 | 0.4 | 0.5 |
| cordoba | -0.1 | -0.5 | 0.5 |
| cairo | -0.3 | 0.4 | 0.5 |
| medina | -0.3 | 0.3 | 0.4 |
| constantinople | 0.0 | 0.4 | 0.4 |
| basra | 0.2 | -0.3 | 0.4 |
| delhi | 0.4 | -0.1 | 0.4 |
| marrakech | 0.3 | 0.2 | 0.3 |
| bukhara | 0.1 | -0.3 | 0.3 |
| alexandria | 0.3 | -0.0 | 0.3 |
| jerusalem | 0.2 | -0.3 | 0.3 |
| baghdad | -0.3 | -0.1 | 0.3 |
| nishapur | 0.1 | -0.2 | 0.2 |
| mecca | -0.1 | -0.2 | 0.2 |
| isfahan | 0.1 | -0.1 | 0.1 |

## Leave-one-out residuals

| Held-out | Δx | Δy | dist (px) |
|---|---|---|---|
| cordoba | -0.1 | -0.8 | 0.8 |
| samarkand | -0.4 | 0.6 | 0.7 |
| medina | -0.4 | 0.4 | 0.6 |
| damascus | -0.4 | 0.3 | 0.6 |
| constantinople | 0.0 | 0.5 | 0.5 |
| cairo | -0.3 | 0.4 | 0.5 |
| marrakech | 0.5 | 0.2 | 0.5 |
| delhi | 0.5 | -0.1 | 0.5 |
| bukhara | 0.1 | -0.4 | 0.4 |
| basra | 0.3 | -0.3 | 0.4 |
| alexandria | 0.3 | -0.0 | 0.3 |
| mecca | -0.2 | -0.3 | 0.3 |
| jerusalem | 0.2 | -0.3 | 0.3 |
| baghdad | -0.3 | -0.1 | 0.3 |
| nishapur | 0.1 | -0.2 | 0.3 |
| isfahan | 0.1 | -0.1 | 0.1 |

## Fitted affine parameters (lon, lat → APS)

```
x = 154.2603 · lon + 0.0290 · lat + 1850.3190
y = -0.0001 · lon + -177.2118 · lat + 8506.0474
```

## Notes

- Anchor APS values are PROVISIONAL until `verified: true` per docs §3.4.
- While provisional, residual tests will look artificially low because anchors were seeded by linear bbox projection. Real validation begins once anchors are visually measured.
- TPS local refinement is intentionally deferred — affine is enough to seed bulk lon/lat ingestion.
