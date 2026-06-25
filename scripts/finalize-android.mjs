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
 *   - The Android build is a normal Vite SPA build. It must emit a root
 *     index.html. This script only rewrites absolute asset URLs to relative
 *     WebView-safe URLs and verifies the output shape before Capacitor sync.
 *
 * This runs as part of `npm run sync:android` so the developer never has to
 * hand-edit index.html.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
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

function main() {
  if (!existsSync(OUT_DIR)) {
    console.error(`[finalize-android] missing ${OUT_DIR}; did the vite build run?`);
    process.exit(1);
  }

  if (!existsSync(TARGET)) {
    const serverFiles = walk(join(OUT_DIR, "server"));
    if (serverFiles.length > 0) {
      console.error("[finalize-android] failed: Android build emitted TanStack Start server output instead of a static SPA root.");
    } else {
      console.error("[finalize-android] failed: dist/android/index.html was not emitted by Vite.");
    }
    process.exit(1);
  }

  const html = rewriteRelative(readFileSync(TARGET, "utf8"));
  writeFileSync(TARGET, html, "utf8");
  console.log(`[finalize-android] verified ${relative(ROOT, TARGET)}`);

  if (!existsSync(join(OUT_DIR, "assets"))) {
    console.error("[finalize-android] failed: dist/android/assets is missing.");
    process.exit(1);
  }

  // Sanity check
  if (!existsSync(TARGET)) {
    console.error("[finalize-android] post-check failed: index.html still missing.");
    process.exit(1);
  }
}

main();
