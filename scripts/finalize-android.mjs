#!/usr/bin/env node
/**
 * Post-build finalizer for the Android/Capacitor web bundle.
 *
 * Guarantees:
 *   1. `dist/android/index.html` exists.
 *   2. All asset URLs inside it are RELATIVE (`./assets/...`), so they load
 *      inside the Android WebView regardless of how Capacitor serves them.
 *   3. The frozen Premium Emblem offline pack is present in the Android web
 *      bundle, so installed apps never fall back to old SVG avatars.
 *
 * Strategy:
 *   - The Android build is a normal Vite SPA build. It must emit a root
 *     index.html. This script only rewrites absolute asset URLs to relative
 *     WebView-safe URLs and verifies the output shape before Capacitor sync.
 *
 * This runs as part of `npm run sync:android` so the developer never has to
 * hand-edit index.html.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
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

  // Android/Capacitor asset merging treats `offline-snapshot.json` and
  // `offline-snapshot.json.gz` as duplicate resources for the same asset and
  // fails at :app:mergeDebugAssets. The runtime only ever fetches the plain
  // JSON, so the compressed twin (a repository artifact only) is dropped from
  // the Android web bundle here — after Vite copied /public, before cap sync.
  const runtimeSnapshot = join(OUT_DIR, "offline-snapshot.json");
  const gzSnapshot = `${runtimeSnapshot}.gz`;
  if (!existsSync(runtimeSnapshot)) {
    console.error("[finalize-android] failed: dist/android/offline-snapshot.json is missing.");
    process.exit(1);
  }
  if (existsSync(gzSnapshot)) {
    rmSync(gzSnapshot);
    console.log("[finalize-android] removed dist/android/offline-snapshot.json.gz from the Android bundle");
  }
  console.log(
    `[finalize-android] verified runtime snapshot (${statSync(runtimeSnapshot).size} bytes)`,
  );


  const emblemDir = join(OUT_DIR, "emblems");
  const emblemManifest = join(emblemDir, "manifest.json");
  const emblemFiles = existsSync(emblemDir)
    ? readdirSync(emblemDir).filter((name) => /\.(webp|avif)$/i.test(name))
    : [];
  // Derive the expectation from the manifest instead of a hard-coded count:
  // the pack ships WebP at 128/256/512 (AVIF duplicates were dropped to keep
  // the APK small), so a magic number goes stale on every pipeline change.
  let expectedEmblems = 0;
  if (existsSync(emblemManifest)) {
    try {
      const manifest = JSON.parse(readFileSync(emblemManifest, "utf8"));
      const assetCount = Number(manifest?.asset_count) || 0;
      const emblemCount = Number(manifest?.emblem_count) || 0;
      const formats = Array.isArray(manifest?.bundled_formats) ? manifest.bundled_formats.length : 1;
      expectedEmblems = assetCount || emblemCount * 3 * formats;
    } catch {
      expectedEmblems = 0;
    }
  }
  if (!existsSync(emblemManifest) || expectedEmblems === 0 || emblemFiles.length < expectedEmblems) {
    console.error(
      `[finalize-android] failed: Premium Emblem offline pack incomplete in dist/android/emblems ` +
      `(manifest=${existsSync(emblemManifest)}, files=${emblemFiles.length}, expected>=${expectedEmblems}).`,
    );
    process.exit(1);
  }
  console.log(`[finalize-android] verified Premium Emblem offline pack (${emblemFiles.length} assets)`);

  // Sanity check
  if (!existsSync(TARGET)) {
    console.error("[finalize-android] post-check failed: index.html still missing.");
    process.exit(1);
  }
}

main();
