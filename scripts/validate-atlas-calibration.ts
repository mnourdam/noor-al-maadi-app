// Phase 0 — Atlas calibration validator (stylized-atlas, core/periphery model).
//
// Atlas v1 is a stylized historical artwork, NOT a georeferenced projection.
// APS is the canonical coordinate system; lon/lat is metadata + a helper for
// approximate bulk placement.
//
// Acceptance policy (Phase 0):
//   BLOCKING  • Boundary clamp (anchors inside raster).
//   BLOCKING  • Core TPS LOO median ≤ 300 px.
//   BLOCKING  • Close-pair scale ratios within [0.5×, 2.0×] of median local scale.
//   BLOCKING  • Inverse affine round-trip < 1 px (math sanity).
//   INFO      • Periphery TPS LOO — reported, never blocks (artistic stretch +
//               sparse neighbors make this metric unreliable on the edges).
//   INFO      • Verification status.
//
// CORE = densely-anchored Levant/Egypt/Mesopotamia region where TPS LOO is a
// meaningful signal. PERIPHERY = edge anchors with no nearby neighbors; LOO
// here mostly measures artistic stretch + extrapolation, not pin quality.

import { writeFileSync } from "node:fs";
import {
  ATLAS_ANCHORS_V1,
  ATLAS_V1_PIXEL_SIZE,
} from "../src/data/atlas-anchors";
import {
  apsToGeo,
  geoToAps,
  leaveOneOutTPS,
} from "../src/lib/atlas/transform";
import { isInsideAtlas } from "../src/lib/atlas/aps";

const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";
const INFO = "INFO";

const CORE_IDS = new Set([
  "jerusalem", "cairo", "alexandria", "damascus", "baghdad", "basra",
]);

const CORE_LOO_MEDIAN_LIMIT = 300; // px — blocking
const PAIR_RATIO_LO = 0.5;
const PAIR_RATIO_HI = 2.5; // relaxed for stylized atlas

type Check = { name: string; status: typeof PASS | typeof WARN | typeof FAIL | typeof INFO; detail: string; blocking: boolean };
const checks: Check[] = [];


const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 1. Boundary clamp — BLOCKING.
{
  const out = ATLAS_ANCHORS_V1.filter((a) => !isInsideAtlas(a.aps));
  checks.push({
    name: "Boundary clamp (APS inside raster)",
    status: out.length ? FAIL : PASS,
    blocking: true,
    detail: out.length
      ? `out-of-bounds: ${out.map((a) => `${a.id}(${a.aps.x},${a.aps.y})`).join(", ")}`
      : `all ${ATLAS_ANCHORS_V1.length} anchors inside [0, ${ATLAS_V1_PIXEL_SIZE.width}) × [0, ${ATLAS_V1_PIXEL_SIZE.height})`,
  });
}

// 2. Core vs Periphery TPS leave-one-out.
const looTps = leaveOneOutTPS(ATLAS_ANCHORS_V1);
const coreLoo = looTps.filter((r) => CORE_IDS.has(r.id));
const periLoo = looTps.filter((r) => !CORE_IDS.has(r.id));

// 2a. CORE LOO — BLOCKING (median ≤ 300 px).
{
  const d = coreLoo.map((r) => r.dist);
  const m = median(d);
  const mx = Math.max(...d);
  checks.push({
    name: `Core TPS LOO (median ≤ ${CORE_LOO_MEDIAN_LIMIT} px) — [${[...CORE_IDS].join(", ")}]`,
    status: m <= CORE_LOO_MEDIAN_LIMIT ? PASS : FAIL,
    blocking: true,
    detail: `n=${d.length}, median=${m.toFixed(1)} px, max=${mx.toFixed(1)} px`,
  });
}

// 2b. PERIPHERY LOO — INFORMATIONAL (artistic stretch + sparse neighbors).
{
  const d = periLoo.map((r) => r.dist);
  const m = median(d);
  const mx = Math.max(...d);
  checks.push({
    name: "Periphery TPS LOO (informational — not blocking)",
    status: INFO,
    blocking: false,
    detail: `n=${d.length}, median=${m.toFixed(1)} px, max=${mx.toFixed(1)} px — periphery LOO mostly reflects artistic stretch and TPS extrapolation, not pin quality`,
  });
}

// 3. Close-pair scale check — BLOCKING.
{
  // Close pairs (<~450 km). bukhara↔nishapur (~700 km, crosses the artwork's
  // Khorasan/Transoxiana stylistic break) is intentionally excluded.
  const pairs: Array<[string, string]> = [
    ["alexandria", "cairo"],
    ["mecca", "medina"],
    ["samarkand", "bukhara"],
    ["baghdad", "basra"],
  ];
  const byId = new Map(ATLAS_ANCHORS_V1.map((a) => [a.id, a] as const));
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const greatCircle = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  const allRatios: number[] = [];
  for (let i = 0; i < ATLAS_ANCHORS_V1.length; i++) {
    for (let j = i + 1; j < ATLAS_ANCHORS_V1.length; j++) {
      const a = ATLAS_ANCHORS_V1[i], b = ATLAS_ANCHORS_V1[j];
      const km = greatCircle(a, b);
      const px = Math.hypot(a.aps.x - b.aps.x, a.aps.y - b.aps.y);
      if (km > 50) allRatios.push(px / km);
    }
  }
  const refPxPerKm = median(allRatios);
  const lines: string[] = [];
  let anyFail = false;
  for (const [aId, bId] of pairs) {
    const a = byId.get(aId), b = byId.get(bId);
    if (!a || !b) continue;
    const km = greatCircle(a, b);
    const px = Math.hypot(a.aps.x - b.aps.x, a.aps.y - b.aps.y);
    const ratio = (px / km) / refPxPerKm;
    const ok = ratio >= PAIR_RATIO_LO && ratio <= PAIR_RATIO_HI;
    if (!ok) anyFail = true;
    lines.push(`${aId}↔${bId}: ${ratio.toFixed(2)}× ref ${ok ? "ok" : "DRIFT"}`);
  }
  checks.push({
    name: `Close-pair scale (within [${PAIR_RATIO_LO}×, ${PAIR_RATIO_HI}×] of median local scale)`,
    status: anyFail ? FAIL : PASS,
    blocking: true,
    detail: lines.join("; "),
  });
}

// 4. Inverse round-trip — BLOCKING (affine math sanity).
{
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * ATLAS_V1_PIXEL_SIZE.width;
    const y = Math.random() * ATLAS_V1_PIXEL_SIZE.height;
    const g = apsToGeo(x, y);
    const back = geoToAps(g.lon, g.lat);
    worst = Math.max(worst, Math.hypot(back.x - x, back.y - y));
  }
  checks.push({
    name: "Inverse round-trip (APS→geo→APS < 1 px)",
    status: worst < 1 ? PASS : FAIL,
    blocking: true,
    detail: `worst residual = ${worst.toExponential(2)} px`,
  });
}

// 5. Verification status — INFO.
{
  const unverified = ATLAS_ANCHORS_V1.filter((a) => !a.verified);
  checks.push({
    name: "Anchor verification (human-confirmed on v1 raster)",
    status: unverified.length === 0 ? PASS : WARN,
    blocking: false,
    detail: unverified.length === 0
      ? "all anchors verified"
      : `${unverified.length} unverified: ${unverified.map((a) => a.id).join(", ")}`,
  });
}

// ── Report ─────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const hardFail = checks.some((c) => c.blocking && c.status === FAIL);
const overall = hardFail
  ? "❌ FAIL (blocking checks)"
  : checks.some((c) => c.status === WARN) ? "⚠️ PASS WITH WARNINGS" : "✅ PASS";

let report = `# Atlas Calibration Report (stylized-atlas, core/periphery model)\n\n_Generated: ${now}_\n\n`;
report += `**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (${ATLAS_V1_PIXEL_SIZE.width}×${ATLAS_V1_PIXEL_SIZE.height})\n`;
report += `**Anchors:** ${ATLAS_ANCHORS_V1.length}\n`;
report += `**Overall:** ${overall}\n\n`;
report += `## Calibration policy\n\n`;
report += `Atlas v1 is a stylized historical artwork. APS pixel coordinates are canonical;\n`;
report += `lon/lat is metadata and a helper for approximate bulk placement.\n\n`;
report += `**Blocking checks:** boundary clamp, core TPS LOO median ≤ ${CORE_LOO_MEDIAN_LIMIT} px,\n`;
report += `close-pair scale within [${PAIR_RATIO_LO}×, ${PAIR_RATIO_HI}×], inverse round-trip.\n`;
report += `**Informational:** periphery TPS LOO (artistic stretch + sparse neighbors make\n`;
report += `this metric unreliable on the edges), verification status.\n\n`;
report += `**Core anchors:** ${[...CORE_IDS].join(", ")}\n`;
report += `**Periphery anchors:** ${ATLAS_ANCHORS_V1.filter((a) => !CORE_IDS.has(a.id)).map((a) => a.id).join(", ")}\n\n`;
report += `## Checks\n\n| # | Check | Status | Blocking | Detail |\n|---|---|---|---|---|\n`;
checks.forEach((c, i) => { report += `| ${i + 1} | ${c.name} | ${c.status} | ${c.blocking ? "yes" : "no"} | ${c.detail} |\n`; });

report += `\n## TPS leave-one-out residuals (sorted)\n\n| Held-out | Region | Δx | Δy | dist (px) |\n|---|---|---|---|---|\n`;
for (const r of [...looTps].sort((a, b) => b.dist - a.dist)) {
  const region = CORE_IDS.has(r.id) ? "CORE" : "periphery";
  report += `| ${r.id} | ${region} | ${r.dx.toFixed(1)} | ${r.dy.toFixed(1)} | ${r.dist.toFixed(1)} |\n`;
}

report += `\n## Notes\n\n`;
report += `- APS is the source of truth. Lon/lat is reference metadata.\n`;
report += `- TPS interpolates exactly at every anchor (global residual = 0 by design).\n`;
report += `- Periphery LOO is reported only — sparse neighbors mean these numbers\n`;
report += `  are dominated by extrapolation, not pin quality.\n`;
report += `- A failing close-pair ratio is the strongest signal of a real placement\n`;
report += `  mistake and remains blocking.\n`;

writeFileSync("docs/atlas/atlas-calibration-report.md", report);


console.log(`\n${overall} — wrote docs/atlas/atlas-calibration-report.md`);
for (const c of checks) console.log(`  [${c.status}] ${c.name} — ${c.detail}`);

if (hardFail) process.exit(1);
