#!/usr/bin/env node
// ============================================================
// Build secret leakage gate (V16).
// ------------------------------------------------------------
// `SUPABASE_SERVICE_ROLE_KEY` is a BUILD-TIME ONLY secret used to
// package private story media. It must never reach a shipped
// artifact. This gate scans the generated client / Android output
// for the literal key and for service-role JWT fragments.
//
// Usage: node scripts/verify-no-build-secrets.mjs [...extraDirs]
// ============================================================
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const TARGETS = [
  "dist",
  "dist/android",
  "android/app/src/main/assets",
  "public/story-media/manifest.json",
  "public/baseline-content.json",
  "src/lib/stories/media/offline-pack.generated.ts",
  ...process.argv.slice(2),
];

const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const needles = [];
if (key.length >= 12) needles.push({ label: "service-role key", value: key });
// Service-role JWTs carry this exact role claim segment.
needles.push({ label: 'role:"service_role" claim', value: '"role":"service_role"' });
// NOTE: a bare `service_role` string is NOT a leak signal — the Supabase
// auth library legitimately names the role in its own type/enum tables.
needles.push({ label: "sb_secret_ key prefix", value: "sb_secret_" });

const MAX_BYTES = 64 * 1024 * 1024;
const hits = [];
let scanned = 0;

function scanFile(path) {
  try {
    if (statSync(path).size > MAX_BYTES) return;
    const text = readFileSync(path, "latin1");
    scanned++;
    for (const n of needles) {
      if (text.includes(n.value)) hits.push(`${path}: ${n.label}`);
    }
  } catch {
    /* unreadable — ignore */
  }
}

function walk(path) {
  let s;
  try {
    s = statSync(path);
  } catch {
    return;
  }
  if (s.isFile()) return scanFile(path);
  if (!s.isDirectory()) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    walk(join(path, entry.name));
  }
}

for (const t of TARGETS) {
  const abs = resolve(process.cwd(), t);
  if (existsSync(abs)) walk(abs);
}

if (hits.length > 0) {
  console.error("\n[secret-gate] FAIL: build secret material found in shipped artifacts:");
  for (const h of hits.slice(0, 40)) console.error(`  - ${h}`);
  console.error("");
  process.exit(1);
}

console.log(`[secret-gate] ok: ${scanned} generated file(s) scanned, 0 service-role matches`);
