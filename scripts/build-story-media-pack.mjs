#!/usr/bin/env node
// ============================================================
// Story Media Pack (V16) — true offline story artwork
// ------------------------------------------------------------
// Downloads EVERY media object referenced by the packaged
// published stories (library + campaign intros) from the PRIVATE
// `story-media` bucket, re-encodes it to a reading-size WebP and
// writes:
//
//   public/story-media/<media_id>.webp
//   public/story-media/manifest.json
//   src/lib/stories/media/offline-pack.generated.ts
//
// Runtime resolution prefers these local assets and only falls
// back to a signed URL when online and the asset is missing.
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY is read from process.env at
// BUILD TIME only. It is never hardcoded, never committed, never
// written into the manifest / generated TS / assets, never logged,
// and never exposed to Vite (no VITE_* usage).
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=… node scripts/build-story-media-pack.mjs
// ============================================================
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  downloadStoryMedia,
  fetchStoryGraph,
  requiredMediaFor,
  serviceEnv,
} from "./lib/story-export.mjs";

const ROOT = "public/story-media";
const GENERATED = "src/lib/stories/media/offline-pack.generated.ts";
const MAX_WIDTH = 640;
const MAX_BYTES = 40 * 1024;
const QUALITY_LADDER = [70, 62, 56, 50, 44, 38, 32];
const CONCURRENCY = 8;

function fail(msg) {
  console.error(`\n[story-media-pack] FAIL: ${msg}\n`);
  process.exit(1);
}

async function encode(buf) {
  const { default: sharp } = await import("sharp");
  let last = null;
  for (const quality of QUALITY_LADDER) {
    const out = await sharp(buf)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality, effort: 5, smartSubsample: true })
      .toBuffer();
    last = { out, quality };
    if (out.byteLength <= MAX_BYTES) return last;
  }
  return last;
}

async function main() {
  const env = serviceEnv();
  const graph = await fetchStoryGraph(env);
  const needed = requiredMediaFor(graph.stories, graph.scenes, graph.media);
  if (needed.length === 0) fail("no referenced story media resolved — refusing to ship an empty pack");

  await mkdir(ROOT, { recursive: true });
  const assets = {};
  const failures = [];
  let total = 0;
  let done = 0;

  const queue = [...needed];
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      try {
        if (!row.storage_path) throw new Error("row has no storage_path");
        // Resume support: a previous run's asset is reused as-is so a single
        // transient 5xx never forces a full 70MB re-download.
        const existingPath = join(ROOT, `${row.id}.webp`);
        const existing = await stat(existingPath).catch(() => null);
        if (existing?.isFile() && existing.size > 0 && !process.env.STORY_MEDIA_PACK_FORCE) {
          const bytes = await readFile(existingPath);
          assets[row.id] = {
            file: `${row.id}.webp`,
            bytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            reused: true,
          };
          total += bytes.byteLength;
          done++;
          if (done % 100 === 0) console.log(`[story-media-pack] ${done}/${needed.length}`);
          continue;
        }
        const src = await downloadStoryMedia(env, row.storage_bucket || "story-media", row.storage_path);
        const encoded = await encode(src);
        if (!encoded) throw new Error("encode failed");
        await writeFile(join(ROOT, `${row.id}.webp`), encoded.out);
        total += encoded.out.byteLength;
        assets[row.id] = {
          file: `${row.id}.webp`,
          bytes: encoded.out.byteLength,
          quality: encoded.quality,
          story_id: row.story_id ?? null,
          kind: row.kind ?? null,
          processing_version: row.processing_version ?? 1,
          sha256: createHash("sha256").update(encoded.out).digest("hex"),
        };
      } catch (e) {
        failures.push(`${row.id}: ${e?.message ?? e}`);
      }
      if (++done % 100 === 0) console.log(`[story-media-pack] ${done}/${needed.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Prune assets that are no longer referenced by any packaged story.
  for (const entry of await readdir(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".webp")) continue;
    const id = entry.name.replace(/\.webp$/, "");
    if (!assets[id]) await rm(join(ROOT, entry.name));
  }

  const ids = Object.keys(assets).sort();
  await writeFile(
    join(ROOT, "manifest.json"),
    `${JSON.stringify(
      {
        version: 1,
        generated_at: new Date().toISOString(),
        max_width: MAX_WIDTH,
        total_bytes: total,
        count: ids.length,
        assets,
      },
      null,
      0,
    )}\n`,
  );

  await mkdir("src/lib/stories/media", { recursive: true });
  await writeFile(
    GENERATED,
    `// AUTO-GENERATED by scripts/build-story-media-pack.mjs — do not edit by hand.
// Every story/intro media id whose bytes ship inside this build.
export const OFFLINE_STORY_MEDIA_IDS: readonly string[] = [
${ids.map((id) => `  ${JSON.stringify(id)},`).join("\n")}
];
`,
  );

  console.log(
    `[story-media-pack] ${ids.length}/${needed.length} assets · ` +
      `${(total / 1024 / 1024).toFixed(1)}MB total`,
  );
  if (failures.length > 0) {
    for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
    fail(`${failures.length} required media asset(s) could not be packaged`);
  }
}

main().catch((e) => fail(e?.message ?? String(e)));
