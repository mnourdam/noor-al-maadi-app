#!/usr/bin/env node
// ============================================================
// Offline Snapshot Build Guard
// ------------------------------------------------------------
// Fails the Android build if the encyclopedia offline snapshot
// is missing, empty, or wildly smaller than expected. This is
// the last line of defense against shipping an APK with an
// unusable offline mode.
//
// Runs twice in the Android pipeline:
//   1. PRE-BUILD  — verifies `public/offline-snapshot.json` in
//      the source tree BEFORE Vite bundles it into `dist/`.
//   2. POST-SYNC  — verifies the same file exists inside the
//      APK input tree `android/app/src/main/assets/public/`
//      after `cap sync` copies it.
// ============================================================

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MODE = process.argv[2] ?? "pre"; // "pre" | "post"
const MIN_BYTES = 500_000;               // any smaller than 500KB = broken/stub
const MIN_ENTITIES = 500;                // sanity check on entity count

function fatal(msg) {
  console.error(`\n[offline-snapshot-guard] FAIL: ${msg}\n`);
  process.exit(1);
}

const targets =
  MODE === "post"
    ? ["android/app/src/main/assets/public/offline-snapshot.json"]
    : ["public/offline-snapshot.json"];

for (const rel of targets) {
  const abs = resolve(process.cwd(), rel);
  if (!existsSync(abs)) fatal(`missing ${rel}`);
  const st = statSync(abs);
  if (!st.isFile()) fatal(`${rel} is not a file`);
  if (st.size < MIN_BYTES) {
    fatal(`${rel} is only ${st.size} bytes (min ${MIN_BYTES}) — snapshot is empty or truncated`);
  }
  try {
    const raw = readFileSync(abs, "utf8");
    const parsed = JSON.parse(raw);
    const entities = Array.isArray(parsed?.entities) ? parsed.entities.length : 0;
    if (entities < MIN_ENTITIES) {
      fatal(`${rel} has only ${entities} entities (min ${MIN_ENTITIES})`);
    }
    // Structural sanity: every top-level slice should be a JSON array/object.
    if (!parsed || typeof parsed !== "object") fatal(`${rel} does not parse as an object`);
    console.log(`[offline-snapshot-guard] ok: ${rel} (${st.size} bytes, ${entities} entities)`);
  } catch (e) {
    fatal(`${rel} is not valid JSON: ${e?.message ?? e}`);
  }
}
