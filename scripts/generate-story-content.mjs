#!/usr/bin/env node
// ============================================================
// Build-time canonical STORY content export (V16).
// ------------------------------------------------------------
// Writes `public/baseline-content.json` from CURRENT production
// data so an APK never ships a stale, manually committed story
// baseline. Includes:
//
//   games, stories (library + campaign intros), story_scenes,
//   story_media (verified), story_collections
//
// Campaign intros are included on purpose: the runtime library
// list filters them out (src/lib/stories/library-filter.ts), and
// the intro engine falls back to these snapshot collections when
// no synced bundle exists yet (src/lib/campaigns/intro/offline.ts).
//
// SECURITY: reads SUPABASE_SERVICE_ROLE_KEY from process.env only.
// The key is never written to the output and never logged.
//
// Usage: node scripts/generate-story-content.mjs
// Opt-out (offline dev builds): SKIP_STORY_CONTENT_GEN=1
// ============================================================
import { existsSync, readFileSync, renameSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTENT_MODE_LIVE,
  fetchStoryGraph,
  resolveContentMode,
  serviceEnv,
} from "./lib/story-export.mjs";

const OUT = resolve(process.cwd(), "public/baseline-content.json");

if (process.env.SKIP_STORY_CONTENT_GEN === "1") {
  console.warn("[story-content] SKIP_STORY_CONTENT_GEN=1 — keeping the committed baseline");
  process.exit(0);
}

function fail(msg) {
  console.error(`\n[story-content] FAIL: ${msg}\n`);
  process.exit(1);
}

// Strict integrity gate for the committed, pre-generated artifact used by
// keyless local builds. Never weakens a release gate: it only decides whether
// the already-verified branch artifact is trustworthy enough to reuse.
function verifyPregenerated() {
  if (!existsSync(OUT)) {
    fail(
      "public/baseline-content.json is missing and SUPABASE_SERVICE_ROLE_KEY is unavailable — " +
        "cannot regenerate and no pre-generated artifact to reuse",
    );
  }
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(OUT, "utf8"));
  } catch (e) {
    fail(`public/baseline-content.json is malformed JSON: ${e?.message ?? e}`);
  }
  const c = baseline?.collections ?? {};
  const required = ["games", "stories", "story_scenes", "story_media", "story_collections"];
  for (const key of required) {
    if (!Array.isArray(c[key])) fail(`pre-generated baseline is missing collection "${key}"`);
  }
  if (typeof baseline.version !== "number") fail("pre-generated baseline has no numeric version");
  if (typeof baseline.generated_at !== "string" || Number.isNaN(Date.parse(baseline.generated_at))) {
    fail("pre-generated baseline has no valid generated_at timestamp");
  }
  const counts = baseline.counts ?? {};
  const actual = {
    games: c.games.length,
    stories: c.stories.length,
    story_scenes: c.story_scenes.length,
    story_media: c.story_media.length,
    story_collections: c.story_collections.length,
  };
  for (const [key, value] of Object.entries(actual)) {
    if (typeof counts[key] === "number" && counts[key] !== value) {
      fail(`pre-generated baseline count mismatch for ${key}: header ${counts[key]} vs actual ${value}`);
    }
  }
  const intros = c.stories.filter((s) => s?.story_type === "campaign_intro").length;
  const library = c.stories.length - intros;
  if (library === 0) fail("pre-generated baseline has no library stories");
  if (c.story_scenes.length === 0) fail("pre-generated baseline has no story scenes");
  if (c.story_collections.length === 0) fail("pre-generated baseline has no story collections");
  const ids = new Set(c.stories.map((s) => s?.id));
  const orphanScenes = c.story_scenes.filter((s) => !ids.has(s?.story_id)).length;
  if (orphanScenes > 0) fail(`pre-generated baseline has ${orphanScenes} scene(s) with no parent story`);

  console.log(
    "[story-content] using pre-generated verified artifact; regeneration skipped because build secret is unavailable",
  );
  console.log(
    `[story-content] mode=PREGENERATED_VERIFIED version=${baseline.version} ` +
      `generated_at=${baseline.generated_at} — ${library} library stories, ${intros} campaign intros, ` +
      `${actual.story_scenes} scenes, ${actual.story_media} media rows, ` +
      `${actual.story_collections} collections, ${actual.games} games`,
  );
}

async function main() {
  const mode = resolveContentMode("story-content");
  if (mode !== CONTENT_MODE_LIVE) {
    verifyPregenerated();
    return;
  }
  const env = serviceEnv();
  const graph = await fetchStoryGraph(env);

  if (graph.library.length === 0) fail("no published library stories returned");
  if (graph.scenes.length === 0) fail("no story scenes returned");
  if (graph.collections.length === 0) fail("no story collections returned");

  const baseline = {
    version: Date.now(),
    generated_at: new Date().toISOString(),
    source: "live",
    counts: {
      games: graph.games.length,
      stories: graph.stories.length,
      library_stories: graph.library.length,
      campaign_intro_stories: graph.intros.length,
      story_scenes: graph.scenes.length,
      story_media: graph.media.length,
      story_collections: graph.collections.length,
    },
    collections: {
      games: graph.games,
      stories: graph.stories,
      story_scenes: graph.scenes,
      story_media: graph.media,
      story_collections: graph.collections,
    },
  };

  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(baseline), "utf8");
  renameSync(tmp, OUT);

  const kb = (statSync(OUT).size / 1024).toFixed(0);
  console.log(
    "[story-content] mode=GENERATED_LIVE",
  );
  console.log(
    `[story-content] wrote public/baseline-content.json (${kb}KB) — ` +
      `${graph.library.length} library stories, ${graph.intros.length} campaign intros, ` +
      `${graph.scenes.length} scenes, ${graph.media.length} media rows, ` +
      `${graph.collections.length} collections, ${graph.games.length} games`,
  );
}

main().catch((e) => fail(e?.message ?? String(e)));
