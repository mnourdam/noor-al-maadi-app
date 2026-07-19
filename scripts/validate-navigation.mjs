#!/usr/bin/env node
// ============================================================
// scripts/validate-navigation.mjs
// ------------------------------------------------------------
// CI-friendly validator for the navigation registry.
//
// Usage:
//   node scripts/validate-navigation.mjs
//
// Exits with code 1 (build fails) when the graph is invalid.
// ============================================================

import { pathToFileURL } from "node:url";
import { register } from "node:module";

// Register a TS loader so we can import the TypeScript sources directly.
try {
  register("ts-node/esm", pathToFileURL("./"));
} catch {
  // ts-node is optional locally; fall back to tsx via bunx if available.
}

const mod = await import(
  pathToFileURL(new URL("../src/lib/navigation/index.ts", import.meta.url)).href
).catch(async () => {
  // Bun executes TS directly. This branch runs under `bun run` / `bunx tsx`.
  return await import("../src/lib/navigation/index.ts");
});

const { validateNavigationRegistry, formatValidationReport } = mod;

const report = validateNavigationRegistry();
console.log(formatValidationReport(report));
if (!report.ok) process.exit(1);
