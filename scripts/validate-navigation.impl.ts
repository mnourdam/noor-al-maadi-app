// ============================================================
// scripts/validate-navigation.impl.ts
// ------------------------------------------------------------
// Runs under `tsx` so it can import the TypeScript navigation
// registry directly. Parses the generated route tree at
// `src/routeTree.gen.ts` (single source of truth for known
// routes) and passes those IDs into `validateNavigationRegistry`.
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  formatValidationReport,
  validateNavigationRegistry,
} from "../src/lib/navigation/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function readKnownRouteIds(): string[] | undefined {
  const genPath = resolve(projectRoot, "src/routeTree.gen.ts");
  let source: string;
  try {
    source = readFileSync(genPath, "utf8");
  } catch {
    return undefined;
  }
  const blockMatch = source.match(
    /interface FileRoutesByFullPath\s*\{([\s\S]*?)\n\}/,
  );
  if (!blockMatch) return undefined;
  const ids: string[] = [];
  for (const line of blockMatch[1].split("\n")) {
    const m = line.match(/^\s*'([^']+)':/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

const knownRouteIds = readKnownRouteIds();
if (!knownRouteIds) {
  console.warn(
    "[validate-navigation] Could not read src/routeTree.gen.ts — running registry-only checks.",
  );
}

const report = validateNavigationRegistry({ knownRouteIds });
console.log(formatValidationReport(report));
if (!report.ok) process.exit(1);
