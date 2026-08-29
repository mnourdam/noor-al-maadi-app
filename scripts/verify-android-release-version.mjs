#!/usr/bin/env node
/**
 * Release-only Android version guard (V16 Phase A).
 * Run explicitly: `npm run verify:android:release`
 * Also runs automatically inside `build:android:web:release`.
 * Debug builds (`npm run apk:debug`) never invoke this.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRelease } from "./lib/android-release-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const gradle = readFileSync(join(ROOT, "android/app/build.gradle"), "utf8");
const baseline = JSON.parse(readFileSync(join(ROOT, "android/release-version.json"), "utf8"));

const result = validateRelease(gradle, baseline);
if (!result.ok) {
  console.error("[android-release-version] RELEASE BLOCKED:");
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `[android-release-version] OK — versionCode=${result.versionCode} versionName=${result.versionName} ` +
    `(Play production baseline ${baseline.playProductionVersionCode})`,
);
