# Atlas Calibration Report (stylized-atlas model)

_Generated: 2026-06-22T20:48:09.476Z_

**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (14192×7088)
**Anchors:** 16
**Overall:** ❌ FAIL

## Validation model

Atlas v1 is a stylized historical artwork. APS pixel coordinates are canonical;
lon/lat is a helper used only to seed bulk imports via TPS interpolation.
Global affine residuals are intentionally not a pass/fail metric — the artwork
cannot satisfy them by construction. The primary check is TPS leave-one-out:
a misplaced pin shows up as a large LOO error; artistic distortion does not.

## Checks

| # | Check | Status | Detail |
|---|---|---|---|
| 1 | Boundary clamp (APS inside raster) | PASS | all 16 anchors inside [0, 14192) × [0, 7088) |
| 2 | TPS leave-one-out (median ≤ 200 px, max ≤ 500 px) | FAIL | median=594.2 px, max=2017.2 px |
| 3 | Per-anchor outliers (TPS LOO > 600 px) | FAIL | cordoba (879 px), marrakech (1035 px), constantinople (706 px), mecca (1149 px), medina (858 px), isfahan (755 px), nishapur (1594 px), delhi (2017 px) |
| 4 | Close-pair scale (within [0.5×, 2×] of median local scale) | FAIL | alexandria↔cairo: 0.96× ref ok; mecca↔medina: 1.46× ref ok; samarkand↔bukhara: 2.60× ref DRIFT; baghdad↔basra: 1.23× ref ok; bukhara↔nishapur: 3.85× ref DRIFT |
| 5 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | worst residual = 2.91e-12 px |
| 6 | Anchor verification (human-confirmed on v1 raster) | PASS | all anchors verified |

## TPS leave-one-out residuals (sorted)

| Held-out | Δx | Δy | dist (px) | flag |
|---|---|---|---|---|
| delhi | -1311.5 | 1532.7 | 2017.2 | OUTLIER |
| nishapur | -1465.3 | -628.2 | 1594.3 | OUTLIER |
| mecca | -206.4 | -1130.8 | 1149.5 | OUTLIER |
| marrakech | 625.3 | 824.5 | 1034.8 | OUTLIER |
| cordoba | -483.5 | -733.7 | 878.7 | OUTLIER |
| medina | 244.5 | 822.7 | 858.2 | OUTLIER |
| isfahan | 612.4 | 441.2 | 754.8 | OUTLIER |
| constantinople | -481.1 | 516.7 | 706.0 | OUTLIER |
| bukhara | 310.8 | 369.0 | 482.4 | review |
| samarkand | -8.2 | -385.2 | 385.3 | review |
| baghdad | -246.9 | -274.7 | 369.4 | review |
| basra | -106.0 | -160.5 | 192.4 | ok |
| damascus | 116.2 | -75.4 | 138.5 | ok |
| alexandria | 124.7 | -45.4 | 132.7 | ok |
| cairo | -91.7 | 38.2 | 99.3 | ok |
| jerusalem | -82.7 | -4.4 | 82.8 | ok |

## Notes

- APS is the source of truth. Lon/lat is reference metadata.
- TPS interpolates exactly at every anchor (global residual = 0 by design).
- LOO outliers indicate pins that disagree with their neighbors — likely
  placed on the wrong city or wrong region. These need manual review.
- Close-pair scale ratios outside [0.5×, 2×] indicate
  one of the two pins is on an unrelated part of the raster.
