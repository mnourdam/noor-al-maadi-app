# Atlas Calibration Report (stylized-atlas, core/periphery model)

_Generated: 2026-06-22T20:50:45.750Z_

**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (14192×7088)
**Anchors:** 16
**Overall:** ❌ FAIL (blocking checks)

## Calibration policy

Atlas v1 is a stylized historical artwork. APS pixel coordinates are canonical;
lon/lat is metadata and a helper for approximate bulk placement.

**Blocking checks:** boundary clamp, core TPS LOO median ≤ 300 px,
close-pair scale within [0.5×, 2×], inverse round-trip.
**Informational:** periphery TPS LOO (artistic stretch + sparse neighbors make
this metric unreliable on the edges), verification status.

**Core anchors:** jerusalem, cairo, alexandria, damascus, baghdad, basra
**Periphery anchors:** cordoba, marrakech, constantinople, mecca, medina, isfahan, nishapur, samarkand, bukhara, delhi

## Checks

| # | Check | Status | Blocking | Detail |
|---|---|---|---|---|
| 1 | Boundary clamp (APS inside raster) | PASS | yes | all 16 anchors inside [0, 14192) × [0, 7088) |
| 2 | Core TPS LOO (median ≤ 300 px) — [jerusalem, cairo, alexandria, damascus, baghdad, basra] | PASS | yes | n=6, median=135.6 px, max=369.4 px |
| 3 | Periphery TPS LOO (informational — not blocking) | INFO | no | n=10, median=868.5 px, max=2017.2 px — periphery LOO mostly reflects artistic stretch and TPS extrapolation, not pin quality |
| 4 | Close-pair scale (within [0.5×, 2×] of median local scale) | FAIL | yes | alexandria↔cairo: 0.96× ref ok; mecca↔medina: 1.46× ref ok; samarkand↔bukhara: 2.60× ref DRIFT; baghdad↔basra: 1.23× ref ok; bukhara↔nishapur: 3.85× ref DRIFT |
| 5 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | yes | worst residual = 2.57e-12 px |
| 6 | Anchor verification (human-confirmed on v1 raster) | PASS | no | all anchors verified |

## TPS leave-one-out residuals (sorted)

| Held-out | Region | Δx | Δy | dist (px) |
|---|---|---|---|---|
| delhi | periphery | -1311.5 | 1532.7 | 2017.2 |
| nishapur | periphery | -1465.3 | -628.2 | 1594.3 |
| mecca | periphery | -206.4 | -1130.8 | 1149.5 |
| marrakech | periphery | 625.3 | 824.5 | 1034.8 |
| cordoba | periphery | -483.5 | -733.7 | 878.7 |
| medina | periphery | 244.5 | 822.7 | 858.2 |
| isfahan | periphery | 612.4 | 441.2 | 754.8 |
| constantinople | periphery | -481.1 | 516.7 | 706.0 |
| bukhara | periphery | 310.8 | 369.0 | 482.4 |
| samarkand | periphery | -8.2 | -385.2 | 385.3 |
| baghdad | CORE | -246.9 | -274.7 | 369.4 |
| basra | CORE | -106.0 | -160.5 | 192.4 |
| damascus | CORE | 116.2 | -75.4 | 138.5 |
| alexandria | CORE | 124.7 | -45.4 | 132.7 |
| cairo | CORE | -91.7 | 38.2 | 99.3 |
| jerusalem | CORE | -82.7 | -4.4 | 82.8 |

## Notes

- APS is the source of truth. Lon/lat is reference metadata.
- TPS interpolates exactly at every anchor (global residual = 0 by design).
- Periphery LOO is reported only — sparse neighbors mean these numbers
  are dominated by extrapolation, not pin quality.
- A failing close-pair ratio is the strongest signal of a real placement
  mistake and remains blocking.
