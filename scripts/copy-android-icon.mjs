#!/usr/bin/env node
/**
 * Copies the Irth brand icon (public/irth-icon.png) into every Android
 * mipmap launcher slot, replacing the default Capacitor icon. Runs as part
 * of `npm run sync:android` so the launcher always reflects the brand.
 *
 * We intentionally do a straight copy (no resize) to avoid adding a native
 * image dependency (sharp/ImageMagick) to the toolchain. Android's launcher
 * scales the bitmap per density bucket; the source asset is already large
 * enough (>1024px) for crisp rendering on xxxhdpi devices.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const SRC = join(ROOT, "public", "irth-icon.png");
const RES = join(ROOT, "android", "app", "src", "main", "res");

if (!existsSync(SRC)) {
  console.error(`[android-icon] source icon missing: ${SRC}`);
  process.exit(1);
}

const buckets = [
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
];

const files = ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"];

for (const bucket of buckets) {
  const dir = join(RES, bucket);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const f of files) {
    copyFileSync(SRC, join(dir, f));
  }
}
console.log("[android-icon] launcher icons updated from public/irth-icon.png");
