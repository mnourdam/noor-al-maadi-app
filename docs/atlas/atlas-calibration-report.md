# Atlas Calibration Report

_Generated: 2026-06-22T20:42:35.430Z_

**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (14192×7088)
**Anchors:** 16
**Overall:** ⚠️ PASS WITH WARNINGS

## Checks

| # | Check | Status | Detail |
|---|---|---|---|
| 1 | Boundary clamp (APS inside raster) | PASS | all 16 anchors inside [0, 14192) × [0, 7088) |
| 2 | Affine residuals (median ≤ 25 px, max ≤ 80 px) | WARN | median=428.0 px, max=1291.0 px |
| 3 | Leave-one-out (median ≤ 25 px, max ≤ 80 px) | WARN | median=538.9 px, max=1724.0 px |
| 4 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | worst residual = 3.67e-12 px |
| 5 | Close-pair scale check (within 5% of global px/km) | WARN | alexandria↔cairo: 0.955× ref (ok); mecca↔medina: 1.464× ref (drift); samarkand↔bukhara: 2.604× ref (drift) |
| 6 | Anchor verification (visual measurement on v1 raster) | PASS | all anchors verified |

## Per-anchor residuals (affine fit on all 16)

| Anchor | Δx | Δy | dist (px) |
|---|---|---|---|
| nishapur | -1256.5 | -296.3 | 1291.0 |
| samarkand | 1272.7 | -59.7 | 1274.1 |
| bukhara | 915.4 | 204.6 | 938.0 |
| marrakech | 833.5 | 191.8 | 855.3 |
| constantinople | -718.5 | 145.1 | 733.0 |
| medina | 303.0 | 477.3 | 565.4 |
| baghdad | -474.4 | -268.4 | 545.1 |
| mecca | 243.7 | -474.5 | 533.4 |
| damascus | -297.0 | -125.9 | 322.6 |
| isfahan | -284.9 | 132.1 | 314.0 |
| jerusalem | -305.4 | 48.6 | 309.2 |
| cordoba | 184.9 | -243.6 | 305.8 |
| basra | -266.5 | -106.9 | 287.1 |
| cairo | -219.7 | 161.9 | 272.9 |
| delhi | 236.3 | 126.9 | 268.2 |
| alexandria | -166.7 | 87.0 | 188.1 |

## Leave-one-out residuals

| Held-out | Δx | Δy | dist (px) |
|---|---|---|---|
| samarkand | 1722.1 | -80.8 | 1724.0 |
| nishapur | -1450.6 | -342.1 | 1490.4 |
| marrakech | 1292.1 | 297.4 | 1325.8 |
| bukhara | 1218.1 | 272.2 | 1248.2 |
| constantinople | -941.9 | 190.2 | 960.9 |
| mecca | 379.0 | -738.1 | 829.7 |
| medina | 388.3 | 611.7 | 724.5 |
| baghdad | -507.8 | -287.3 | 583.4 |
| cordoba | 299.0 | -393.8 | 494.4 |
| delhi | 327.0 | 175.6 | 371.2 |
| damascus | -317.8 | -134.8 | 345.2 |
| isfahan | -309.6 | 143.6 | 341.3 |
| jerusalem | -327.4 | 52.1 | 331.6 |
| basra | -290.2 | -116.5 | 312.8 |
| cairo | -241.0 | 177.6 | 299.4 |
| alexandria | -181.3 | 94.6 | 204.5 |

## Fitted affine parameters (lon, lat → APS)

```
x = 116.9360 · lon + 46.0399 · lat + -457.4215
y = -5.1324 · lon + -119.6670 · lat + 7297.2109
```

## Notes

- Anchor APS values are PROVISIONAL until `verified: true` per docs §3.4.
- While provisional, residual tests will look artificially low because anchors were seeded by linear bbox projection. Real validation begins once anchors are visually measured.
- TPS local refinement is intentionally deferred — affine is enough to seed bulk lon/lat ingestion.
