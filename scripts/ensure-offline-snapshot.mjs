#!/usr/bin/env node
// ============================================================
// Inflate the committed offline snapshot artifact.
// ------------------------------------------------------------
// `public/offline-snapshot.json` is too large to live in the repository,
// so the canonical committed artifact is `public/offline-snapshot.json.gz`.
// This script expands it into `public/offline-snapshot.json` before any
// build so Vite can bundle it into /public.
//
// It is fully offline: no network, no database access.
// ============================================================
import { existsSync, readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const JSON_PATH = resolve(process.cwd(), "public/offline-snapshot.json");
const GZ_PATH = `${JSON_PATH}.gz`;
const TMP_PATH = `${JSON_PATH}.inflate.tmp`;

if (!existsSync(GZ_PATH)) {
  console.error(`\n[snapshot-ensure] FAIL: missing ${GZ_PATH}\n`);
  process.exit(1);
}

const gzMtime = statSync(GZ_PATH).mtimeMs;
if (existsSync(JSON_PATH) && statSync(JSON_PATH).mtimeMs >= gzMtime) {
  console.log("[snapshot-ensure] public/offline-snapshot.json is already up to date");
  process.exit(0);
}

try {
  const json = gunzipSync(readFileSync(GZ_PATH));
  JSON.parse(json.toString("utf8")); // fail closed on a corrupt artifact
  writeFileSync(TMP_PATH, json);
  renameSync(TMP_PATH, JSON_PATH);
  console.log(`[snapshot-ensure] inflated public/offline-snapshot.json (${json.length} bytes)`);
} catch (e) {
  console.error(`\n[snapshot-ensure] FAIL: ${e?.message ?? e}\n`);
  process.exit(1);
}
