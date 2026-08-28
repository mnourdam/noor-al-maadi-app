#!/usr/bin/env node
// ============================================================
// Build-time offline snapshot generator (schema v2)
// ------------------------------------------------------------
// Reads the CURRENT canonical production content through the public
// (anon / RLS-enforced) read path — the same filters the runtime uses —
// fully paginates every collection, asserts exact counts against the
// authoritative PostgREST count, validates the candidate completely and
// only then atomically replaces `public/offline-snapshot.json`.
//
// On ANY failure the process exits non-zero and the previously committed
// snapshot file is left untouched.
//
// Usage:  node scripts/generate-offline-snapshot.mjs
// Opt-out (developer, offline builds): SKIP_SNAPSHOT_GEN=1
// ============================================================
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildCollectionDefs,
  buildSnapshot,
  validateCandidate,
  compareWithManifest,
  assertExactCount,
  pruneRow,
} from "./lib/offline-snapshot-build.mjs";

const OUT_PATH = resolve(process.cwd(), "public/offline-snapshot.json");
const TMP_PATH = `${OUT_PATH}.tmp`;
const GZ_PATH = `${OUT_PATH}.gz`;
const PAGE = 200;

function fail(msg) {
  console.error(`\n[snapshot-gen] FAIL: ${msg}\n`);
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch {
    /* ignore */
  }
  process.exit(1);
}

if (process.env.SKIP_SNAPSHOT_GEN === "1") {
  console.warn("[snapshot-gen] SKIP_SNAPSHOT_GEN=1 — keeping the committed snapshot (developer opt-out)");
  process.exit(0);
}

function readEnv() {
  const env = { ...process.env };
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i < 1 || line.trim().startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      const v = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!(k in env) || !env[k]) env[k] = v;
    }
  }
  return env;
}

function readAtlasColumns() {
  const src = readFileSync(resolve(process.cwd(), "src/lib/atlas-entities.ts"), "utf8");
  const m = src.match(/export const ATLAS_PUBLIC_COLUMNS\s*=\s*([\s\S]*?);/);
  if (!m) fail("could not read ATLAS_PUBLIC_COLUMNS from src/lib/atlas-entities.ts");
  const parts = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  if (parts.length === 0) fail("ATLAS_PUBLIC_COLUMNS parsed empty");
  return parts.join("");
}

async function fetchExactCount(client, def) {
  let q = client.from(def.table).select("id", { count: "exact", head: true });
  if (def.filter) q = def.filter(q);
  const { count, error } = await q;
  if (error) throw new Error(`${def.table}: count query failed — ${error.message}`);
  return typeof count === "number" ? count : null;
}

async function fetchAll(client, def) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = client
      .from(def.table)
      .select(def.columns ?? "*")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (def.filter) q = def.filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${def.table}: page ${from} failed — ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    if (from > 200_000) throw new Error(`${def.table}: pagination safety cap hit`);
  }
  return out.map((row) => pruneRow(def.key, row));
}

async function main() {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) fail("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not available");

  const client = createClient(url, key, { auth: { persistSession: false } });
  const defs = buildCollectionDefs(readAtlasColumns());

  const collections = {};
  for (const def of defs) {
    const expected = await fetchExactCount(client, def);
    const rows = await fetchAll(client, def);
    assertExactCount(def.key, rows.length, expected);
    console.log(`[snapshot-gen] ${def.key}: ${rows.length} rows (expected ${expected})`);
    collections[def.key] = rows;
  }

  const candidate = buildSnapshot(collections);
  const report = validateCandidate(candidate);
  if (!report.ok) fail(`candidate failed integrity validation:\n  - ${report.issues.join("\n  - ")}`);

  // Cross-check against the server content manifest so a candidate that is
  // already behind production never gets written.
  const { data: manifest, error: manifestError } = await client.rpc("get_content_manifest");
  if (manifestError) {
    console.warn(`[snapshot-gen] manifest cross-check unavailable: ${manifestError.message}`);
  } else {
    const stale = compareWithManifest(candidate, manifest);
    if (stale.length > 0) fail(`candidate is already behind production:\n  - ${stale.join("\n  - ")}`);
  }

  // Atomic write: temp file → validated re-read → rename over the target.
  writeFileSync(TMP_PATH, JSON.stringify(candidate), "utf8");
  const reread = JSON.parse(readFileSync(TMP_PATH, "utf8"));
  const rereadReport = validateCandidate(reread);
  if (!rereadReport.ok) fail(`written candidate failed re-validation:\n  - ${rereadReport.issues.join("\n  - ")}`);
  renameSync(TMP_PATH, OUT_PATH);

  // The expanded JSON is too large for the repository; the committed
  // canonical artifact is the gzipped twin, expanded again by
  // `npm run snapshot:ensure` before every build.
  const gzTmp = `${GZ_PATH}.tmp`;
  writeFileSync(gzTmp, gzipSync(readFileSync(OUT_PATH), { level: 9 }));
  renameSync(gzTmp, GZ_PATH);

  console.log(
    `[snapshot-gen] wrote public/offline-snapshot.json ` +
      `(snapshot_version=${candidate.snapshot_version}, generated_at=${candidate.generated_at})`,
  );
  console.log(`  counts: ${JSON.stringify(candidate.content_counts)}`);
}

main().catch((e) => fail(e?.message ?? String(e)));
