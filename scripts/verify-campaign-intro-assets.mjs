#!/usr/bin/env node
// ============================================================
// Campaign Intro Asset Build Gate (Stage 5)
// ------------------------------------------------------------
// Fails the APK build when a campaign authors `intro_story_id`
// but the intro's story / scenes / media are not present in
// public/offline-snapshot.json.
//
// Campaigns without an authored intro can never fail this gate,
// and an intro targeting a NEWER intro engine version is skipped
// (forward compatible), never a failure.
// ============================================================

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SNAPSHOT_PATH = process.argv[2] ?? "public/offline-snapshot.json";

function fatal(msg) {
  console.error(`\n[campaign-intro-gate] FAIL: ${msg}\n`);
  process.exit(1);
}

const abs = resolve(process.cwd(), SNAPSHOT_PATH);
if (!existsSync(abs)) fatal(`missing ${SNAPSHOT_PATH}`);

let snap;
try {
  snap = JSON.parse(readFileSync(abs, "utf8"));
} catch (e) {
  fatal(`${SNAPSHOT_PATH} is not valid JSON: ${e?.message ?? e}`);
}

const collections = { ...(snap?.collections ?? {}) };

// V16 — story rows (library + campaign intros) are exported at build time
// into `public/baseline-content.json` and shipped alongside the snapshot.
// The gate must judge the FULL packaged content, not the snapshot alone.
const BASELINE_PATH = process.argv[3] ?? "public/baseline-content.json";
const baselineAbs = resolve(process.cwd(), BASELINE_PATH);
if (existsSync(baselineAbs)) {
  try {
    const baseline = JSON.parse(readFileSync(baselineAbs, "utf8"));
    for (const [key, rows] of Object.entries(baseline?.collections ?? {})) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const existing = Array.isArray(collections[key]) ? collections[key] : [];
      const byId = new Map(existing.map((r) => [r?.id, r]));
      for (const row of rows) if (row?.id) byId.set(row.id, row);
      collections[key] = [...byId.values()];
    }
  } catch (e) {
    fatal(`${BASELINE_PATH} is not valid JSON: ${e?.message ?? e}`);
  }
} else {
  fatal(`missing ${BASELINE_PATH} — run \`npm run content:stories\` before the intro gate`);
}

// Physical media pack — an intro is only "playable offline" when its bytes
// are actually on the device.
const packManifestPath = resolve(process.cwd(), "public/story-media/manifest.json");
if (!existsSync(packManifestPath)) {
  fatal("missing public/story-media/manifest.json — run `npm run pack:story-media`");
}
const packedMedia = new Set(
  Object.keys(JSON.parse(readFileSync(packManifestPath, "utf8"))?.assets ?? {}),
);

const auditUrl = pathToFileURL(
  resolve(process.cwd(), "src/lib/campaigns/intro/audit.ts"),
).href;
const { auditCampaignIntroAssets, INTRO_ENGINE_VERSION } = await import(auditUrl);

const result = auditCampaignIntroAssets({
  campaigns: collections.admin_campaigns ?? [],
  stories: collections.stories ?? [],
  story_scenes: collections.story_scenes ?? [],
  story_media: collections.story_media ?? [],
});

const authored = result.entries.length;
const skipped = result.entries.filter((e) => e.skippedFutureEngine).length;
const ready = result.entries.filter((e) => e.ready).length;

if (!result.ok) {
  for (const err of result.errors) console.error(`  - ${err}`);
  fatal(
    `${result.errors.length} missing intro asset(s) across ${authored - ready - skipped} campaign(s)`,
  );
}

// Every intro declared ready must ALSO have every referenced media byte
// packaged locally, otherwise "playable offline" is a lie.
const storyById = new Map((collections.stories ?? []).map((s) => [s.id, s]));
const scenesByStory = new Map();
for (const sc of collections.story_scenes ?? []) {
  const list = scenesByStory.get(sc.story_id);
  if (list) list.push(sc);
  else scenesByStory.set(sc.story_id, [sc]);
}
const { sceneMediaIds } = await import(
  pathToFileURL(resolve(process.cwd(), "scripts/lib/story-export.mjs")).href
);
const mediaProblems = [];
for (const entry of result.entries) {
  if (entry.skippedFutureEngine) continue;
  const story = storyById.get(entry.storyId);
  const needed = new Set();
  if (story?.cover_media_id) needed.add(story.cover_media_id);
  for (const sc of scenesByStory.get(entry.storyId) ?? []) {
    for (const id of sceneMediaIds(sc)) needed.add(id);
  }
  for (const id of needed) {
    if (!packedMedia.has(id)) {
      mediaProblems.push(`campaign ${entry.campaignId}: intro media ${id} is not in the local media pack`);
    }
  }
}
if (mediaProblems.length > 0) {
  for (const p of mediaProblems.slice(0, 25)) console.error(`  - ${p}`);
  fatal(`${mediaProblems.length} campaign intro media asset(s) missing from the offline pack`);
}

if (authored - skipped > 0 && ready === 0) {
  fatal(`${authored - skipped} authored intro(s) but 0 playable offline`);
}


console.log(
  `[campaign-intro-gate] ok: engine v${INTRO_ENGINE_VERSION}, ` +
    `${authored} authored intro(s), ${ready} playable offline, ${skipped} skipped (newer engine)`,
);
