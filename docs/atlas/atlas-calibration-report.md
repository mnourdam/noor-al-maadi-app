# Atlas Calibration Report (stylized-atlas, core/periphery model)

_Generated: 2026-06-22T20:55:49.608Z_

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
| 2 | Core TPS LOO (median ≤ 300 px) — [jerusalem, cairo, alexandria, damascus, baghdad, basra] | PASS | yes | n=6, median=134.0 px, max=342.9 px |
| 3 | Periphery TPS LOO (informational — not blocking) | INFO | no | n=10, median=855.0 px, max=1405.4 px — periphery LOO mostly reflects artistic stretch and TPS extrapolation, not pin quality |
| 4 | Close-pair scale (within [0.5×, 2×] of median local scale) | FAIL | yes | alexandria↔cairo: 0.95× ref ok; mecca↔medina: 1.46× ref ok; samarkand↔bukhara: 2.08× ref DRIFT; baghdad↔basra: 1.22× ref ok; bukhara↔nishapur: 3.45× ref DRIFT |
| 5 | Inverse round-trip (APS→geo→APS < 1 px) | PASS | yes | worst residual = 2.42e-12 px |
| 6 | Anchor verification (human-confirmed on v1 raster) | PASS | no | all anchors verified |

## TPS leave-one-out residuals (sorted)

| Held-out | Region | Δx | Δy | dist (px) |
|---|---|---|---|---|
| nishapur | periphery | -1352.2 | -382.8 | 1405.4 |
| mecca | periphery | -229.6 | -1128.7 | 1151.8 |
| delhi | periphery | -802.6 | 732.3 | 1086.5 |
| marrakech | periphery | 568.6 | 822.3 | 999.7 |
| medina | periphery | 251.5 | 819.6 | 857.3 |
| cordoba | periphery | -435.4 | -733.2 | 852.8 |
| isfahan | periphery | 581.6 | 412.2 | 712.9 |
| constantinople | periphery | -432.3 | 557.5 | 705.5 |
| baghdad | CORE | -231.0 | -253.4 | 342.9 |
| bukhara | periphery | 320.4 | 89.5 | 332.6 |
| basra | CORE | -112.1 | -167.9 | 201.9 |
| damascus | CORE | 116.0 | -74.4 | 137.8 |
| alexandria | CORE | 121.2 | -48.0 | 130.3 |
| cairo | CORE | -89.9 | 39.5 | 98.2 |
| samarkand | periphery | -66.7 | -70.5 | 97.1 |
| jerusalem | CORE | -83.0 | -5.8 | 83.2 |

## Notes

- APS is the source of truth. Lon/lat is reference metadata.
- TPS interpolates exactly at every anchor (global residual = 0 by design).
- Periphery LOO is reported only — sparse neighbors mean these numbers
  are dominated by extrapolation, not pin quality.
- A failing close-pair ratio is the strongest signal of a real placement
  mistake and remains blocking.
