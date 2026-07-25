#!/usr/bin/env node
// ============================================================
// Build the offline Campaign Key Art pack.
// ------------------------------------------------------------
// Downloads every approved campaign artwork from the
// `campaign-key-art` bucket, writes bundled derivatives under
// public/campaign-key-art/<id>/{hero,square}.webp, regenerates the
// integrity manifest and the frozen id list consumed by
// src/lib/campaign-art/offline-pack.ts.
//
// Run before cutting an APK so the next release ships every newly
// approved artwork:  node scripts/build-campaign-art-pack.mjs
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env and
// `sharp` (or an equivalent encoder) available locally.
// ============================================================
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "public/campaign-key-art";
const HERO_WIDTH = 1280;
const SQUARE_SIDE = 640;
const QUALITY = 72;

async function encode(buf, resize) {
  const { default: sharp } = await import("sharp");
  return sharp(buf).resize(resize).webp({ quality: QUALITY }).toBuffer();
}

async function download(path) {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/campaign-key-art/${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sync(rows) {
  for (const row of rows) {
    const dir = join(ROOT, row.id);
    await mkdir(dir, { recursive: true });
    if (row.key_art_path) {
      await writeFile(join(dir, "hero.webp"), await encode(await download(row.key_art_path), { width: HERO_WIDTH }));
    }
    if (row.key_art_square_path) {
      await writeFile(
        join(dir, "square.webp"),
        await encode(await download(row.key_art_square_path), { width: SQUARE_SIDE, height: SQUARE_SIDE }),
      );
    }
    console.log("packed", row.id);
  }
}

async function manifest() {
  const ids = (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const assets = {};
  let total = 0;
  for (const id of ids) {
    assets[id] = {};
    for (const [aspect, file] of [["hero", "hero.webp"], ["square", "square.webp"]]) {
      const p = join(ROOT, id, file);
      await stat(p);
      const buf = await readFile(p);
      total += buf.length;
      assets[id][aspect] = {
        path: `/campaign-key-art/${id}/${file}`,
        bytes: buf.length,
        sha256: createHash("sha256").update(buf).digest("hex"),
      };
    }
  }
  await writeFile(
    join(ROOT, "manifest.json"),
    JSON.stringify({ version: 1, generated_at: new Date().toISOString().slice(0, 10), count: ids.length, total_bytes: total, assets }, null, 1),
  );
  console.log(`manifest: ${ids.length} campaigns, ${(total / 1024 / 1024).toFixed(1)} MB`);
  console.log("Update OFFLINE_CAMPAIGN_ART_IDS in src/lib/campaign-art/offline-pack.ts with:");
  console.log(ids.map((i) => `  "${i}",`).join("\n"));
}

const rows = process.argv[2] ? JSON.parse(await readFile(process.argv[2], "utf8")) : [];
if (rows.length) await sync(rows);
await manifest();
