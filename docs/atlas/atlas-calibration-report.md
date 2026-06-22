# Atlas Calibration Report

_Generated: 2026-06-22T20:30:30.511Z_

**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (14192×7088)
**Anchors:** 16
**Overall:** ⚠️ PASS WITH WARNINGS

## Checks

| # | Check | Status | Detail |
|---|---|---|---|
| 1 | Boundary clamp (APS inside raster) | PASS | all 16 anchors inside [0, 14192) × [0, 7088) |
| 2 | Affine residuals (median ≤ 25 px, max ≤ 80 px) | WARN | median=263.0 px, max=1019.0 px |
| 3 | Leave-one-out (median ≤ 25 px, max ≤ 80 px) | WARN | median=349.2 px, max=1378.8 px |
| 4 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | worst residual = 3.75e-12 px |
| 5 | Close-pair scale check (within 5% of global px/km) | WARN | alexandria↔cairo: 1.055× ref (drift); mecca↔medina: 1.091× ref (drift); samarkand↔bukhara: 4.425× ref (drift) |
| 6 | Anchor verification (visual measurement on v1 raster) | WARN | 2/16 anchors PROVISIONAL — re-measure per plan §3.4: mecca, medina |

## Per-anchor residuals (affine fit on all 16)

| Anchor | Δx | Δy | dist (px) |
|---|---|---|---|
| samarkand | -93.6 | 1014.7 | 1019.0 |
| nishapur | -445.8 | -638.9 | 779.1 |
| delhi | 768.8 | -103.2 | 775.7 |
| medina | -88.3 | 516.7 | 524.2 |
| baghdad | -42.0 | -426.7 | 428.8 |
| mecca | -298.4 | -150.2 | 334.1 |
| cordoba | 297.7 | -103.6 | 315.2 |
| marrakech | 91.8 | 251.5 | 267.8 |
| cairo | -174.0 | 190.8 | 258.2 |
| damascus | 47.4 | -237.5 | 242.2 |
| isfahan | 194.9 | -53.7 | 202.2 |
| basra | 19.3 | -201.0 | 201.9 |
| bukhara | -168.9 | 6.0 | 169.0 |
| constantinople | 41.9 | -150.7 | 156.4 |
| alexandria | -59.1 | 88.6 | 106.5 |
| jerusalem | -91.6 | -2.5 | 91.6 |

## Leave-one-out residuals

| Held-out | Δx | Δy | dist (px) |
|---|---|---|---|
| samarkand | -126.6 | 1372.9 | 1378.8 |
| delhi | 1063.8 | -142.9 | 1073.3 |
| nishapur | -514.6 | -737.6 | 899.4 |
| medina | -113.1 | 662.1 | 671.7 |
| mecca | -464.2 | -233.7 | 519.7 |
| cordoba | 481.3 | -167.5 | 509.6 |
| baghdad | -45.0 | -456.7 | 458.9 |
| marrakech | 142.3 | 389.9 | 415.1 |
| cairo | -190.9 | 209.3 | 283.3 |
| damascus | 50.7 | -254.2 | 259.2 |
| bukhara | -224.8 | 7.9 | 224.9 |
| basra | 21.1 | -219.0 | 220.0 |
| isfahan | 211.8 | -58.3 | 219.7 |
| constantinople | 54.9 | -197.6 | 205.1 |
| alexandria | -64.3 | 96.3 | 115.8 |
| jerusalem | -98.2 | -2.7 | 98.2 |

## Fitted affine parameters (lon, lat → APS)

```
x = 104.3419 · lon + -21.7050 · lat + 1925.4150
y = 1.4199 · lon + -88.7254 · lat + 6134.1882
```

## Notes

- Anchor APS values are PROVISIONAL until `verified: true` per docs §3.4.
- While provisional, residual tests will look artificially low because anchors were seeded by linear bbox projection. Real validation begins once anchors are visually measured.
- TPS local refinement is intentionally deferred — affine is enough to seed bulk lon/lat ingestion.
