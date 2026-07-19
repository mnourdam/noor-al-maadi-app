#!/usr/bin/env node
// ============================================================
// scripts/validate-navigation.mjs
// ------------------------------------------------------------
// CI-friendly validator for the navigation registry.
//
// Usage:
//   node scripts/validate-navigation.mjs
//   npm run validate:navigation
//
// This entry point self-bootstraps through `tsx` (a devDependency)
// so it can import the TypeScript registry directly. The heavy
// lifting lives in `scripts/validate-navigation.impl.ts`, which
// parses `src/routeTree.gen.ts` and runs the registry validator.
//
// Exit codes:
//   0 — registry OK
//   1 — validation failed / bootstrap failed
// ============================================================

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const implPath = resolve(__dirname, "validate-navigation.impl.ts");
const tsxBin = resolve(projectRoot, "node_modules/.bin/tsx");

if (!existsSync(tsxBin)) {
  console.error(
    "[validate-navigation] node_modules/.bin/tsx not found. Run `bun install` first.",
  );
  process.exit(1);
}

const result = spawnSync(tsxBin, [implPath], {
  stdio: "inherit",
  cwd: projectRoot,
});

if (result.error) {
  console.error("[validate-navigation] failed to spawn tsx:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
