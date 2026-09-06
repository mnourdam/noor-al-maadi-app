#!/usr/bin/env node
// ============================================================
// ANDROID RELEASE PREPARATION — single canonical entry point.
// ------------------------------------------------------------
//   npm run release:android:prepare
//
// Makes it impossible to prepare an Android release while missing
// Story pre-generation or Campaign/Chapter Art Pack generation.
//
// Order (each step hard-fails the run):
//   1. Android release version guard
//   2. Campaign + chapter art pack (regenerated from CURRENT content)
//   3. Story canonical content + media pack (live when the build
//      secret is present, otherwise the approved artifact only)
//   4. Android web release build  -> dist/android
//   5. Android branding + Capacitor sync -> android/app/src/main/assets/public
//   6. All release gates (snapshot, media, refs, intros, secrets, version)
//
// Cross-platform: every environment variable is injected through
// scripts/with-env.mjs, never through Unix-only `FOO=1 cmd` syntax.
// Debug builds (`npm run apk:debug`) are untouched.
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY is only read as a presence
// flag here and forwarded to child processes by the OS. It is
// never printed, persisted or bundled.
// ============================================================
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateRelease } from "./lib/android-release-version.mjs";
import {
  readBaselineSummary,
  readMediaSummary,
  verifyApproval,
  writeApproval,
  APPROVAL_PATH,
} from "./lib/story-artifact-approval.mjs";

const ROOT = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const LIVE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const RELEASE_ENV = { ANDROID_BUILD_TYPE: "release", REQUIRE_LIVE_CONTENT: LIVE ? "1" : "0" };

function fail(msg, details = []) {
  console.error(`\n[release:android] BLOCKED: ${msg}`);
  for (const d of details) console.error(`  ${d}`);
  console.error("");
  process.exit(1);
}

let stepNo = 0;
function run(label, cmd, args, env = {}) {
  stepNo += 1;
  console.log(`\n=== [${stepNo}] ${label} ===`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if ((res.status ?? 1) !== 0) fail(`step failed — ${label}`);
}

function runNpm(label, script, env = {}) {
  run(label, npm, ["run", script], env);
}

function runNode(label, script, args = [], env = {}) {
  run(label, process.execPath, [script, ...args], env);
}

// ------------------------------------------------------------
// 1. Release version guard
// ------------------------------------------------------------
runNpm("Android release version guard", "verify:android:release");

// ------------------------------------------------------------
// 2. Campaign + chapter artwork pack
// ------------------------------------------------------------
runNode("Campaign / chapter art pack", "scripts/build-campaign-art-pack.mjs");

// ------------------------------------------------------------
// 3. Story canonical content + media pack
// ------------------------------------------------------------
if (LIVE) {
  console.log("\n[release:android] build secret present — regenerating Story content from LIVE production");
  runNpm("Story canonical content (live)", "content:stories", RELEASE_ENV);
  runNpm("Story media pack", "pack:story-media", RELEASE_ENV);
  runNpm("Story cover map", "content:cover-map", RELEASE_ENV);
  runNpm("Story media completeness", "verify:story-media");
  runNpm("Story unlock references", "verify:story-refs");
  runNpm("Campaign intro assets", "verify:campaign-intros");
  const stamp = writeApproval();
  console.log(
    `[release:android] approved Story artifact stamped at ${stamp.approved_at} ` +
      `(release/story-artifact-approval.json)`,
  );
} else {
  console.log("\n[release:android] no build secret — validating the approved pre-generated Story artifact");
  const result = verifyApproval();
  if (!result.ok) {
    fail("pre-generated Story artifact is not an approved fresh release artifact", result.errors);
  }
  console.log(
    `[release:android] PREGENERATED_VERIFIED artifact approved at ${result.stamp.approved_at} ` +
      `(generated_at ${result.stamp.baseline.generated_at})`,
  );
  runNpm("Story media completeness", "verify:story-media");
  runNpm("Story unlock references", "verify:story-refs");
  runNpm("Campaign intro assets", "verify:campaign-intros");
}

// ------------------------------------------------------------
// 4-5. Android web release build + branding + Capacitor sync
// ------------------------------------------------------------
// Release-specific Android Vite pipeline (never the generic `npm run build`).
// `build:android:web` under release env — the Android-specific Vite pipeline,
// never the generic `npm run build`. REQUIRE_LIVE_CONTENT mirrors secret
// availability so a keyless run reuses the already-approved Story artifact.
runNpm("Android web release build (dist/android)", "build:android:web", RELEASE_ENV);
runNode("Android branding", "scripts/generate-android-branding.mjs");
run("Capacitor sync (android)", process.platform === "win32" ? "npx.cmd" : "npx", ["cap", "sync", "android"]);

if (!existsSync(resolve(ROOT, "dist/android/index.html"))) {
  fail("dist/android/index.html is missing — the Android web build did not produce dist/android");
}
const SYNCED = resolve(ROOT, "android/app/src/main/assets/public/index.html");
if (!existsSync(SYNCED)) fail("Capacitor sync did not copy dist/android into android/app/src/main/assets/public");

// ------------------------------------------------------------
// 6. Final release gates
// ------------------------------------------------------------
runNpm("Offline snapshot (source)", "verify:offline-snapshot");
runNpm("Offline snapshot (source === synced)", "verify:offline-snapshot:post");
runNpm("Story media completeness", "verify:story-media");
runNpm("Story unlock references", "verify:story-refs");
runNpm("Campaign intro assets", "verify:campaign-intros");
runNpm("No build secrets in output", "verify:no-secrets");
runNpm("Android release version", "verify:android:release");

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
const gradle = readFileSync(resolve(ROOT, "android/app/build.gradle"), "utf8");
const baselineJson = JSON.parse(readFileSync(resolve(ROOT, "android/release-version.json"), "utf8"));
const version = validateRelease(gradle, baselineJson);
const story = readBaselineSummary();
const media = readMediaSummary();

const ART_ROOT = resolve(ROOT, "public/campaign-key-art");
let artFiles = 0;
let artBytes = 0;
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".webp")) {
      artFiles += 1;
      artBytes += statSync(p).size;
    }
  }
})(ART_ROOT);

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

console.log(`
ANDROID RELEASE PREPARED

versionCode: ${version.versionCode}
versionName: ${version.versionName}
Story artifact generated_at: ${story.generated_at} (${LIVE ? "GENERATED_LIVE" : "PREGENERATED_VERIFIED"})
Story media assets: ${media.assets} (${mb(media.bytes)})
Campaign/chapter art pack: ${artFiles} images (${mb(artBytes)})
Offline snapshot: verified
Capacitor sync: verified
Secrets gate: verified
Story approval stamp: ${existsSync(APPROVAL_PATH) ? "present" : "missing"}

NEXT STEP:
Open /android in Android Studio and generate the Signed Android App Bundle.
`);
