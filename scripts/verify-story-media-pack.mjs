#!/usr/bin/env node
// ============================================================
// Story Media Pack completeness gate (V16).
// ------------------------------------------------------------
// HARD-FAILS the release build when a packaged published story or
// campaign intro references media that is not physically present
// in the local pack. "Playable offline" must be provable, not
// assumed.
//
// Checks (against public/baseline-content.json + the pack):
//   * every library story has a packaged cover
//   * every scene media reference has a packaged asset
//   * every campaign intro's cover + scene media are packaged
//   * manifest entries all exist on disk
//
// Usage: node scripts/verify-story-media-pack.mjs [baselinePath]
// ============================================================
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { sceneMediaIds, isIntroStory } from "./lib/story-export.mjs";

const BASELINE = resolve(process.cwd(), process.argv[2] ?? "public/baseline-content.json");
const PACK_DIR = resolve(process.cwd(), "public/story-media");
const MANIFEST = resolve(PACK_DIR, "manifest.json");

function fail(msg, details = []) {
  console.error(`\n[story-media-gate] FAIL: ${msg}`);
  for (const d of details.slice(0, 25)) console.error(`  - ${d}`);
  if (details.length > 25) console.error(`  … +${details.length - 25} more`);
  console.error("");
  process.exit(1);
}

if (!existsSync(BASELINE)) fail(`missing ${BASELINE}`);
if (!existsSync(MANIFEST)) fail("missing public/story-media/manifest.json — run `npm run pack:story-media`");

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const c = baseline.collections ?? {};
const stories = c.stories ?? [];
const scenes = c.story_scenes ?? [];
const media = c.story_media ?? [];
const assets = manifest.assets ?? {};

const missingFiles = [];
for (const [id, a] of Object.entries(assets)) {
  const file = resolve(PACK_DIR, a.file ?? `${id}.webp`);
  if (!existsSync(file)) missingFiles.push(`${id}: manifest entry has no file`);
}
if (missingFiles.length) fail("manifest references missing files", missingFiles);

const mediaById = new Map(media.map((m) => [m.id, m]));
const scenesByStory = new Map();
for (const s of scenes) {
  const list = scenesByStory.get(s.story_id);
  if (list) list.push(s);
  else scenesByStory.set(s.story_id, [s]);
}

const problems = [];
let coversChecked = 0;
let sceneRefs = 0;

for (const story of stories) {
  const required = new Set();
  // Campaign intros are launched from campaign Key Art (a bundled app asset),
  // so they legitimately carry no story cover. Library stories must have one.
  const intro = isIntroStory(story, new Set());
  if (story.cover_media_id) {
    required.add(story.cover_media_id);
    coversChecked++;
  } else if (!intro) {
    problems.push(`library story ${story.id} has no cover_media_id`);
  }
  for (const scene of scenesByStory.get(story.id) ?? []) {
    for (const id of sceneMediaIds(scene)) {
      required.add(id);
      sceneRefs++;
    }
  }
  for (const id of required) {
    if (!mediaById.has(id)) problems.push(`story ${story.id}: media ${id} missing from baseline metadata`);
    else if (!assets[id]) problems.push(`story ${story.id}: media ${id} has no packaged local asset`);
  }
}

const bytes = Object.values(assets).reduce((a, x) => a + (x.bytes ?? 0), 0);
if (problems.length) fail(`${problems.length} incomplete story media reference(s)`, problems);

console.log(
  `[story-media-gate] ok: ${stories.length} stories · ${coversChecked} covers · ` +
    `${sceneRefs} scene media references · ${Object.keys(assets).length} packaged assets · ` +
    `${(bytes / 1024 / 1024).toFixed(1)}MB · 0 missing`,
);
void statSync;
