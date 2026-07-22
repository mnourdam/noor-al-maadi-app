#!/usr/bin/env node
// ============================================================
// APK Offline Snapshot Verifier
// ------------------------------------------------------------
// Reads assets/public/offline-snapshot.json from the built debug
// APK and confirms it matches public/offline-snapshot.json in the
// source tree (byte size + sha256 + schema/version + counts).
// ============================================================

import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const APK = "android/app/build/outputs/apk/debug/app-debug.apk";
const ENTRY = "assets/public/offline-snapshot.json";
const SOURCE = "public/offline-snapshot.json";

function fatal(msg) {
  console.error(`\n[apk-snapshot-verify] FAIL: ${msg}\n`);
  process.exit(1);
}
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

if (!existsSync(APK)) fatal(`APK not found at ${APK} — run gradle assembleDebug first`);
if (!existsSync(SOURCE)) fatal(`source snapshot missing at ${SOURCE}`);

const srcBuf = readFileSync(resolve(SOURCE));
const srcSize = statSync(resolve(SOURCE)).size;
const srcSha = sha256(srcBuf);
const srcParsed = JSON.parse(srcBuf.toString("utf8"));

let apkBuf;
try {
  apkBuf = execFileSync("unzip", ["-p", APK, ENTRY], { maxBuffer: 128 * 1024 * 1024 });
} catch (e) {
  fatal(`could not extract ${ENTRY} from APK: ${e?.message ?? e}`);
}
if (!apkBuf || apkBuf.length === 0) fatal(`APK entry ${ENTRY} is empty`);

const apkSha = sha256(apkBuf);
const apkParsed = JSON.parse(apkBuf.toString("utf8"));

if (apkBuf.length !== srcSize) {
  fatal(`APK snapshot size ${apkBuf.length} != source ${srcSize}`);
}
if (apkSha !== srcSha) {
  fatal(`APK snapshot sha256 ${apkSha} != source ${srcSha}`);
}
if (apkParsed.schema_version !== srcParsed.schema_version) {
  fatal(`schema_version mismatch: apk=${apkParsed.schema_version} src=${srcParsed.schema_version}`);
}
if (apkParsed.snapshot_version !== srcParsed.snapshot_version) {
  fatal(`snapshot_version mismatch: apk=${apkParsed.snapshot_version} src=${srcParsed.snapshot_version}`);
}
for (const [k, v] of Object.entries(srcParsed.content_counts || {})) {
  const av = apkParsed.content_counts?.[k];
  if (av !== v) fatal(`content_counts.${k}: apk=${av} src=${v}`);
}

console.log(`[apk-snapshot-verify] ok`);
console.log(`  size=${apkBuf.length} sha256=${apkSha}`);
console.log(`  schema=${apkParsed.schema_version} snapshot_version=${apkParsed.snapshot_version}`);
console.log(`  counts=${JSON.stringify(apkParsed.content_counts)}`);
