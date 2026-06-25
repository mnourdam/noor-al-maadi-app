#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const projectDir = "android";
const wrapper = isWindows ? "gradlew.bat" : "./gradlew";
const wrapperPath = join(projectDir, isWindows ? "gradlew.bat" : "gradlew");

if (!existsSync(wrapperPath)) {
  console.error(`[android-gradle] missing ${wrapperPath}`);
  process.exit(1);
}

const result = spawnSync(wrapper, ["assembleDebug"], {
  cwd: projectDir,
  stdio: "inherit",
  shell: isWindows,
});

process.exit(result.status ?? 1);