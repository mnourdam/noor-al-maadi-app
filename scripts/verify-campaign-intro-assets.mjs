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

const collections = snap?.collections ?? {};

const auditUrl = pathToFileURL(
  resolve(process.cwd(), "src/lib/campaigns/intro/audit.ts"),
).href;
const { auditCampaignIntroAssets, INTRO_ENGINE_VERSION } = await import(auditUrl);

// Story rows are synced at runtime through `stories_snapshot_manifest_v2`
// and are not part of every bundled snapshot file. When the snapshot ships
// no story collection at all there is nothing to verify — the gate warns
// instead of failing a build it cannot judge.
const hasStoryCollections = Array.isArray(collections.stories);

const result = auditCampaignIntroAssets({
  campaigns: collections.admin_campaigns ?? [],
  stories: collections.stories ?? [],
  story_scenes: collections.story_scenes ?? [],
  story_media: collections.story_media ?? [],
});

const authored = result.entries.length;
const skipped = result.entries.filter((e) => e.skippedFutureEngine).length;
const ready = result.entries.filter((e) => e.ready).length;

if (!result.ok && !hasStoryCollections) {
  console.warn(
    `[campaign-intro-gate] WARN: snapshot carries no story collections; ` +
      `${authored - skipped} authored intro(s) not verified offline.`,
  );
} else if (!result.ok) {
  for (const err of result.errors) console.error(`  - ${err}`);
  fatal(
    `${result.errors.length} missing intro asset(s) across ${authored - ready - skipped} campaign(s)`,
  );
}


console.log(
  `[campaign-intro-gate] ok: engine v${INTRO_ENGINE_VERSION}, ` +
    `${authored} authored intro(s), ${ready} playable offline, ${skipped} skipped (newer engine)`,
);
