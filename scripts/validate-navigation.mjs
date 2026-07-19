#!/usr/bin/env node
// ============================================================
// scripts/validate-navigation.mjs
// ------------------------------------------------------------
// CI-friendly validator for the navigation registry.
//
// Usage:
//   node scripts/validate-navigation.mjs
//   bunx tsx scripts/validate-navigation.mjs
//
// The runtime source for router-known routes is the generated route
// tree at `src/routeTree.gen.ts` (the same file TanStack Router uses
// to build the router at runtime). We parse `FileRoutesByFullPath`
// out of it — never maintain a second copy.
//
// Exits with code 1 (build fails) when the graph is invalid.
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readKnownRouteIds() {
  const genPath = resolve(projectRoot, "src/routeTree.gen.ts");
  let source;
  try {
    source = readFileSync(genPath, "utf8");
  } catch {
    return undefined;
  }
  const blockMatch = source.match(
    /interface FileRoutesByFullPath\s*\{([\s\S]*?)\n\}/,
  );
  if (!blockMatch) return undefined;
  const ids = [];
  for (const line of blockMatch[1].split("\n")) {
    const m = line.match(/^\s*'([^']+)':/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

const mod = await import(
  pathToFileURL(resolve(projectRoot, "src/lib/navigation/index.ts")).href
);

const { validateNavigationRegistry, formatValidationReport } = mod;

const knownRouteIds = readKnownRouteIds();
if (!knownRouteIds) {
  console.warn(
    "[validate-navigation] Could not read src/routeTree.gen.ts — running registry-only checks.",
  );
}

const report = validateNavigationRegistry({ knownRouteIds });
console.log(formatValidationReport(report));
if (!report.ok) process.exit(1);
