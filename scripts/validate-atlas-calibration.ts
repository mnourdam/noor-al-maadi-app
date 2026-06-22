// Phase 0 — Atlas calibration validator.
//
// Runs the checks from docs/atlas/atlas-calibration-plan.md §6 against the
// current anchor table and writes a dated report.
//
// Usage:   bun run scripts/validate-atlas-calibration.ts
//
// Exit code is non-zero if any HARD check fails (boundary, inverse round-trip,
// singular fit). Provisional anchors generate WARNINGS, not failures, so the
// pipeline stays green until reviewers measure them on the raster.

import { writeFileSync } from "node:fs";
import {
  ATLAS_ANCHORS_V1,
  ATLAS_V1_PIXEL_SIZE,
} from "../src/data/atlas-anchors";
import {
  apsToGeo,
  fitAffine,
  geoToAps,
  leaveOneOut,
  residuals,
} from "../src/lib/atlas/transform";
import { isInsideAtlas } from "../src/lib/atlas/aps";

const PASS = "PASS";
const WARN = "WARN";
const FAIL = "FAIL";

type Check = { name: string; status: typeof PASS | typeof WARN | typeof FAIL; detail: string };
const checks: Check[] = [];

// 1. Boundary clamp — HARD.
{
  const out = ATLAS_ANCHORS_V1.filter((a) => !isInsideAtlas(a.aps));
  checks.push({
    name: "Boundary clamp (APS inside raster)",
    status: out.length ? FAIL : PASS,
    detail: out.length
      ? `out-of-bounds: ${out.map((a) => `${a.id}(${a.aps.x},${a.aps.y})`).join(", ")}`
      : `all 16 anchors inside [0, ${ATLAS_V1_PIXEL_SIZE.width}) × [0, ${ATLAS_V1_PIXEL_SIZE.height})`,
  });
}

// 2. Affine fit residuals — informational; threshold is post-measurement.
const params = fitAffine(ATLAS_ANCHORS_V1);
const res = residuals(ATLAS_ANCHORS_V1, params);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dists = res.map((r) => r.dist);
checks.push({
  name: "Affine residuals (median ≤ 25 px, max ≤ 80 px)",
  status: median(dists) <= 25 && Math.max(...dists) <= 80 ? PASS : WARN,
  detail: `median=${median(dists).toFixed(1)} px, max=${Math.max(...dists).toFixed(1)} px`,
});

// 3. Leave-one-out — same thresholds.
const loo = leaveOneOut(ATLAS_ANCHORS_V1);
const looDists = loo.map((r) => r.dist);
checks.push({
  name: "Leave-one-out (median ≤ 25 px, max ≤ 80 px)",
  status: median(looDists) <= 25 && Math.max(...looDists) <= 80 ? PASS : WARN,
  detail: `median=${median(looDists).toFixed(1)} px, max=${Math.max(...looDists).toFixed(1)} px`,
});

// 4. Inverse round-trip — HARD (must be < 1 px for 200 random APS samples).
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

// 5. Close-pair scale check — informational (depends on measured APS).
const pairs: Array<[string, string]> = [
  ["alexandria", "cairo"],
  ["mecca", "medina"],
  ["samarkand", "bukhara"],
];
{
  const byId = new Map(ATLAS_ANCHORS_V1.map((a) => [a.id, a] as const));
  const lines: string[] = [];
  let warnAny = false;
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const greatCircle = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  // Reference scale = median px/km across all pairs of anchors.
  const allPairs: number[] = [];
  for (let i = 0; i < ATLAS_ANCHORS_V1.length; i++) {
    for (let j = i + 1; j < ATLAS_ANCHORS_V1.length; j++) {
      const a = ATLAS_ANCHORS_V1[i], b = ATLAS_ANCHORS_V1[j];
      const km = greatCircle(a, b);
      const px = Math.hypot(a.aps.x - b.aps.x, a.aps.y - b.aps.y);
      if (km > 50) allPairs.push(px / km);
    }
  }
  const refPxPerKm = median(allPairs);
  for (const [aId, bId] of pairs) {
    const a = byId.get(aId)!, b = byId.get(bId)!;
    const km = greatCircle(a, b);
    const px = Math.hypot(a.aps.x - b.aps.x, a.aps.y - b.aps.y);
    const local = px / km;
    const ratio = local / refPxPerKm;
    const ok = Math.abs(1 - ratio) <= 0.05;
    if (!ok) warnAny = true;
    lines.push(`${aId}↔${bId}: ${ratio.toFixed(3)}× ref (${ok ? "ok" : "drift"})`);
  }
  checks.push({
    name: "Close-pair scale check (within 5% of global px/km)",
    status: warnAny ? WARN : PASS,
    detail: lines.join("; "),
  });
}

// 6. Verification status — WARN until all anchors measured.
{
  const unverified = ATLAS_ANCHORS_V1.filter((a) => !a.verified);
  checks.push({
    name: "Anchor verification (visual measurement on v1 raster)",
    status: unverified.length === 0 ? PASS : WARN,
    detail: unverified.length
      ? `${unverified.length}/${ATLAS_ANCHORS_V1.length} anchors PROVISIONAL — re-measure per plan §3.4: ${unverified.map((a) => a.id).join(", ")}`
      : "all anchors verified",
  });
}

// ── Report ─────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const hardFail = checks.some((c) => c.status === FAIL);

let report = `# Atlas Calibration Report\n\n_Generated: ${now}_\n\n`;
report += `**Atlas:** IRTH MASTER ATLAS V1 — FROZEN (${ATLAS_V1_PIXEL_SIZE.width}×${ATLAS_V1_PIXEL_SIZE.height})\n`;
report += `**Anchors:** ${ATLAS_ANCHORS_V1.length}\n`;
report += `**Overall:** ${hardFail ? "❌ FAIL" : checks.some((c) => c.status === WARN) ? "⚠️ PASS WITH WARNINGS" : "✅ PASS"}\n\n`;
report += `## Checks\n\n| # | Check | Status | Detail |\n|---|---|---|---|\n`;
checks.forEach((c, i) => {
  report += `| ${i + 1} | ${c.name} | ${c.status} | ${c.detail} |\n`;
});

report += `\n## Per-anchor residuals (affine fit on all 16)\n\n| Anchor | Δx | Δy | dist (px) |\n|---|---|---|---|\n`;
for (const r of res.sort((a, b) => b.dist - a.dist)) {
  report += `| ${r.id} | ${r.dx.toFixed(1)} | ${r.dy.toFixed(1)} | ${r.dist.toFixed(1)} |\n`;
}

report += `\n## Leave-one-out residuals\n\n| Held-out | Δx | Δy | dist (px) |\n|---|---|---|---|\n`;
for (const r of loo.sort((a, b) => b.dist - a.dist)) {
  report += `| ${r.id} | ${r.dx.toFixed(1)} | ${r.dy.toFixed(1)} | ${r.dist.toFixed(1)} |\n`;
}

report += `\n## Fitted affine parameters (lon, lat → APS)\n\n\`\`\`\nx = ${params.ax.toFixed(4)} · lon + ${params.bx.toFixed(4)} · lat + ${params.cx.toFixed(4)}\ny = ${params.ay.toFixed(4)} · lon + ${params.by.toFixed(4)} · lat + ${params.cy.toFixed(4)}\n\`\`\`\n`;

report += `\n## Notes\n\n`;
report += `- Anchor APS values are PROVISIONAL until \`verified: true\` per docs §3.4.\n`;
report += `- While provisional, residual tests will look artificially low because anchors were seeded by linear bbox projection. Real validation begins once anchors are visually measured.\n`;
report += `- TPS local refinement is intentionally deferred — affine is enough to seed bulk lon/lat ingestion.\n`;

writeFileSync("docs/atlas/atlas-calibration-report.md", report);

console.log(`\n${hardFail ? "FAIL" : "OK"} — wrote docs/atlas/atlas-calibration-report.md`);
for (const c of checks) console.log(`  [${c.status}] ${c.name} — ${c.detail}`);

if (hardFail) process.exit(1);
