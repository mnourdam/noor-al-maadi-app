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
const PAIR_RATIO_HI = 2.0;

type Check = { name: string; status: typeof PASS | typeof WARN | typeof FAIL | typeof INFO; detail: string; blocking: boolean };
const checks: Check[] = [];


const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 1. Boundary clamp — HARD.
{
  const out = ATLAS_ANCHORS_V1.filter((a) => !isInsideAtlas(a.aps));
  checks.push({
    name: "Boundary clamp (APS inside raster)",
    status: out.length ? FAIL : PASS,
    detail: out.length
      ? `out-of-bounds: ${out.map((a) => `${a.id}(${a.aps.x},${a.aps.y})`).join(", ")}`
      : `all ${ATLAS_ANCHORS_V1.length} anchors inside [0, ${ATLAS_V1_PIXEL_SIZE.width}) × [0, ${ATLAS_V1_PIXEL_SIZE.height})`,
  });
}

// 2. TPS leave-one-out — PRIMARY check for the stylized-atlas model.
const looTps = leaveOneOutTPS(ATLAS_ANCHORS_V1);
const looDists = looTps.map((r) => r.dist);
const looMedian = median(looDists);
const looMax = Math.max(...looDists);
checks.push({
  name: `TPS leave-one-out (median ≤ ${LOO_MEDIAN_LIMIT} px, max ≤ ${LOO_MAX_LIMIT} px)`,
  status:
    looMedian <= LOO_MEDIAN_LIMIT && looMax <= LOO_MAX_LIMIT ? PASS :
    looMedian <= LOO_MEDIAN_LIMIT * 1.5 && looMax <= LOO_MAX_LIMIT * 1.5 ? WARN : FAIL,
  detail: `median=${looMedian.toFixed(1)} px, max=${looMax.toFixed(1)} px`,
});

// 2b. Per-anchor outliers — pins to manually review.
const outliers = looTps.filter((r) => r.dist > PER_ANCHOR_OUTLIER);
checks.push({
  name: `Per-anchor outliers (TPS LOO > ${PER_ANCHOR_OUTLIER} px)`,
  status: outliers.length === 0 ? PASS : FAIL,
  detail: outliers.length === 0
    ? "no outliers — every anchor consistent with its neighbors"
    : outliers.map((o) => `${o.id} (${o.dist.toFixed(0)} px)`).join(", "),
});

// 3. Close-pair scale check — local sanity.
{
  const pairs: Array<[string, string]> = [
    ["alexandria", "cairo"],
    ["mecca", "medina"],
    ["samarkand", "bukhara"],
    ["baghdad", "basra"],
    ["bukhara", "nishapur"],
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
    detail: lines.join("; "),
  });
}

// 4. Inverse round-trip — HARD (affine math sanity).
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
    detail: `worst residual = ${worst.toExponential(2)} px`,
  });
}

// 5. Verification status.
{
  const unverified = ATLAS_ANCHORS_V1.filter((a) => !a.verified);
  checks.push({
    name: "Anchor verification (human-confirmed on v1 raster)",
    status: unverified.length === 0 ? PASS : WARN,
    detail: unverified.length === 0
      ? "all anchors verified"
      : `${unverified.length} unverified: ${unverified.map((a) => a.id).join(", ")}`,
  });
}

// ── Report ─────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const hardFail = checks.some((c) => c.status === FAIL);
const overall = hardFail ? "❌ FAIL" : checks.some((c) => c.status === WARN) ? "⚠️ PASS WITH WARNINGS" : "✅ PASS";

let report = `# Atlas Calibration Report (stylized-atlas model)\n\n_Generated: ${now}_\n\n`;
report += `**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (${ATLAS_V1_PIXEL_SIZE.width}×${ATLAS_V1_PIXEL_SIZE.height})\n`;
report += `**Anchors:** ${ATLAS_ANCHORS_V1.length}\n`;
report += `**Overall:** ${overall}\n\n`;
report += `## Validation model\n\n`;
report += `Atlas v1 is a stylized historical artwork. APS pixel coordinates are canonical;\n`;
report += `lon/lat is a helper used only to seed bulk imports via TPS interpolation.\n`;
report += `Global affine residuals are intentionally not a pass/fail metric — the artwork\n`;
report += `cannot satisfy them by construction. The primary check is TPS leave-one-out:\n`;
report += `a misplaced pin shows up as a large LOO error; artistic distortion does not.\n\n`;
report += `## Checks\n\n| # | Check | Status | Detail |\n|---|---|---|---|\n`;
checks.forEach((c, i) => { report += `| ${i + 1} | ${c.name} | ${c.status} | ${c.detail} |\n`; });

report += `\n## TPS leave-one-out residuals (sorted)\n\n| Held-out | Δx | Δy | dist (px) | flag |\n|---|---|---|---|---|\n`;
for (const r of [...looTps].sort((a, b) => b.dist - a.dist)) {
  const flag = r.dist > PER_ANCHOR_OUTLIER ? "OUTLIER" : r.dist > LOO_MEDIAN_LIMIT ? "review" : "ok";
  report += `| ${r.id} | ${r.dx.toFixed(1)} | ${r.dy.toFixed(1)} | ${r.dist.toFixed(1)} | ${flag} |\n`;
}

report += `\n## Notes\n\n`;
report += `- APS is the source of truth. Lon/lat is reference metadata.\n`;
report += `- TPS interpolates exactly at every anchor (global residual = 0 by design).\n`;
report += `- LOO outliers indicate pins that disagree with their neighbors — likely\n`;
report += `  placed on the wrong city or wrong region. These need manual review.\n`;
report += `- Close-pair scale ratios outside [${PAIR_RATIO_LO}×, ${PAIR_RATIO_HI}×] indicate\n`;
report += `  one of the two pins is on an unrelated part of the raster.\n`;

writeFileSync("docs/atlas/atlas-calibration-report.md", report);

console.log(`\n${overall} — wrote docs/atlas/atlas-calibration-report.md`);
for (const c of checks) console.log(`  [${c.status}] ${c.name} — ${c.detail}`);

if (hardFail) process.exit(1);
