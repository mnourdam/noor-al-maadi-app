#!/usr/bin/env node
/**
 * Post-build finalizer for the Android/Capacitor web bundle.
 *
 * Guarantees:
 *   1. `dist/android/index.html` exists.
 *   2. All asset URLs inside it are RELATIVE (`./assets/...`), so they load
 *      inside the Android WebView regardless of how Capacitor serves them.
 *
 * Strategy:
 *   - If TanStack Start's SPA prerender already produced an index.html
 *     somewhere under dist/android, surface it at the root and rewrite
 *     absolute asset paths to relative.
 *   - Otherwise, synthesize a minimal SPA shell from Vite's manifest
 *     (`.vite/manifest.json`) using the discovered client entry chunk
 *     and its CSS imports.
 *
 * This runs as part of `npm run sync:android` so the developer never has to
 * hand-edit index.html.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const OUT_DIR = join(ROOT, "dist", "android");
const TARGET = join(OUT_DIR, "index.html");

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function rewriteRelative(html) {
  // Make absolute Vite asset URLs relative so they resolve inside the
  // Android WebView (which serves the bundle from a non-root origin).
  return html
    .replace(/(["'(])\/assets\//g, "$1./assets/")
    .replace(/(["'(])\/__l5e\//g, "$1./__l5e/")
    .replace(/<base\s+href=["'][^"']*["']\s*\/?>(\s*)/i, "");
}

function findPrerenderedIndex() {
  const candidates = walk(OUT_DIR).filter((p) => p.endsWith("index.html"));
  if (candidates.length === 0) return null;
  // Prefer root-level index.html if present, otherwise shallowest.
  candidates.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length);
  return candidates[0];
}

function synthesizeFromManifest() {
  const manifestPaths = [
    join(OUT_DIR, ".vite", "manifest.json"),
    join(OUT_DIR, "manifest.json"),
  ];
  const manifestPath = manifestPaths.find(existsSync);
  if (!manifestPath) return false;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  // Find the entry chunk.
  const entry = Object.values(manifest).find((e) => e && e.isEntry);
  if (!entry) return false;

  const cssLinks = (entry.css || [])
    .map((href) => `    <link rel="stylesheet" href="./${href}">`)
    .join("\n");

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>إرث</title>
${cssLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${entry.file}"></script>
  </body>
</html>
`;
  writeFileSync(TARGET, html, "utf8");
  return true;
}

function main() {
  if (!existsSync(OUT_DIR)) {
    console.error(`[finalize-android] missing ${OUT_DIR}; did the vite build run?`);
    process.exit(1);
  }

  const found = findPrerenderedIndex();
  if (found && found !== TARGET) {
    const html = rewriteRelative(readFileSync(found, "utf8"));
    mkdirSync(dirname(TARGET), { recursive: true });
    writeFileSync(TARGET, html, "utf8");
    console.log(`[finalize-android] moved ${relative(ROOT, found)} -> ${relative(ROOT, TARGET)}`);
  } else if (found === TARGET) {
    const html = rewriteRelative(readFileSync(TARGET, "utf8"));
    writeFileSync(TARGET, html, "utf8");
    console.log(`[finalize-android] rewrote asset URLs in ${relative(ROOT, TARGET)}`);
  } else {
    console.log("[finalize-android] no prerendered index.html found; synthesizing from manifest...");
    if (!synthesizeFromManifest()) {
      console.error("[finalize-android] failed: no index.html and no vite manifest found in dist/android.");
      process.exit(1);
    }
    console.log(`[finalize-android] wrote ${relative(ROOT, TARGET)}`);
  }

  // Sanity check
  if (!existsSync(TARGET)) {
    console.error("[finalize-android] post-check failed: index.html still missing.");
    process.exit(1);
  }
}

main();
