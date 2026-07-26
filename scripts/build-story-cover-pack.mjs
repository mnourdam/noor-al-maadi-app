#!/usr/bin/env node
// ============================================================
// Build the offline Story Cover pack.
// ------------------------------------------------------------
// Story covers are an APPLICATION ASSET, exactly like Premium
// Emblems and Campaign Key Art: they must render instantly, with
// zero network, on the very first paint of /stories.
//
// This script downloads the cover media of every published story
// from the private `story-media` bucket, re-encodes it to a tiny
// card-sized WebP (3:4, 360x480, target 10–20KB) and writes:
//
//   public/story-covers/<story_id>.webp
//   public/story-covers/manifest.json
//   src/lib/stories/covers/offline-pack.generated.ts
//
// Scene images are intentionally NOT part of this pack — they are
// full-bleed reading assets and stay on the normal media path.
//
// Run before cutting an APK / release build:
//   node scripts/build-story-cover-pack.mjs
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// ============================================================
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "public/story-covers";
const GENERATED = "src/lib/stories/covers/offline-pack.generated.ts";
const WIDTH = 360;
const HEIGHT = 480;
const MAX_BYTES = 20 * 1024;
const MIN_BYTES = 8 * 1024;
const QUALITY_LADDER = [78, 72, 66, 60, 54, 48, 42];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
}

async function rpcRows(sql) {
  // Uses PostgREST directly: read the two tables we need.
  const headers = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${sql}`, { headers });
  if (!res.ok) throw new Error(`rest ${sql}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function download(path) {
  const url = `${SUPABASE_URL}/storage/v1/object/story-media/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Encode to the smallest WebP that still looks excellent at card size.
 * Walks the quality ladder downwards until the result fits MAX_BYTES,
 * and stops early once we are already inside the 10–20KB band.
 */
async function encodeCard(buf) {
  const { default: sharp } = await import("sharp");
  let last = null;
  for (const quality of QUALITY_LADDER) {
    const out = await sharp(buf)
      .resize({ width: WIDTH, height: HEIGHT, fit: "cover", position: "attention" })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
    last = { out, quality };
    if (out.byteLength <= MAX_BYTES) return last;
  }
  return last;
}

async function main() {
  assertEnv();
  const stories = await rpcRows(
    "stories?select=id,cover_media_id,content_version,status&status=eq.published&cover_media_id=not.is.null",
  );
  const mediaIds = stories.map((s) => s.cover_media_id);
  const media = mediaIds.length
    ? await rpcRows(
        `story_media?select=id,storage_path,processing_version,checksum_sha256&id=in.(${mediaIds.join(",")})`,
      )
    : [];
  const byId = new Map(media.map((m) => [m.id, m]));

  await mkdir(ROOT, { recursive: true });
  const assets = {};
  let total = 0;

  for (const story of stories) {
    const row = byId.get(story.cover_media_id);
    if (!row) {
      console.warn("skip (no media row)", story.id);
      continue;
    }
    const source = await download(row.storage_path);
    const encoded = await encodeCard(source);
    if (!encoded) {
      console.warn("skip (encode failed)", story.id);
      continue;
    }
    const file = join(ROOT, `${story.id}.webp`);
    await writeFile(file, encoded.out);
    const bytes = encoded.out.byteLength;
    total += bytes;
    assets[story.id] = {
      file: `${story.id}.webp`,
      bytes,
      quality: encoded.quality,
      width: WIDTH,
      height: HEIGHT,
      sha256: createHash("sha256").update(encoded.out).digest("hex"),
      source_media_id: row.id,
      source_checksum: row.checksum_sha256 ?? null,
      content_version: story.content_version ?? 1,
    };
    const kb = (bytes / 1024).toFixed(1);
    const flag = bytes > MAX_BYTES ? " ⚠ over budget" : bytes < MIN_BYTES ? " (very small)" : "";
    console.log(`packed ${story.id} — ${kb}KB q${encoded.quality}${flag}`);
  }

  // Drop covers for stories that no longer exist / were unpublished.
  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
    const id = entry.name.replace(/\.webp$/, "");
    if (!assets[id]) {
      await rm(join(ROOT, entry.name));
      console.log("pruned", id);
    }
  }

  const ids = Object.keys(assets).sort();
  await writeFile(
    join(ROOT, "manifest.json"),
    `${JSON.stringify({ version: 1, width: WIDTH, height: HEIGHT, total_bytes: total, assets }, null, 2)}\n`,
  );

  const generated = `// AUTO-GENERATED by scripts/build-story-cover-pack.mjs — do not edit by hand.
// Every story whose card cover ships inside this build.
export const OFFLINE_STORY_COVER_IDS: readonly string[] = [
${ids.map((id) => `  ${JSON.stringify(id)},`).join("\n")}
];

/** Content version each bundled cover was built from (delta-sync input). */
export const OFFLINE_STORY_COVER_VERSIONS: Readonly<Record<string, number>> = {
${ids.map((id) => `  ${JSON.stringify(id)}: ${assets[id].content_version},`).join("\n")}
};
`;
  await mkdir("src/lib/stories/covers", { recursive: true });
  await writeFile(GENERATED, generated);

  console.log(
    `\n${ids.length} covers · ${(total / 1024).toFixed(1)}KB total · avg ${(total / Math.max(1, ids.length) / 1024).toFixed(1)}KB`,
  );
  // Fail loudly if the budget was blown — the whole point is instant paint.
  const over = ids.filter((id) => assets[id].bytes > MAX_BYTES);
  if (over.length) {
    console.error("covers over the 20KB budget:", over.join(", "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Keeps `readFile` imported for future integrity checks without tripping lint.
void readFile;
