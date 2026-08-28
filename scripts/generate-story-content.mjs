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
import { renameSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fetchStoryGraph, serviceEnv } from "./lib/story-export.mjs";

const OUT = resolve(process.cwd(), "public/baseline-content.json");

if (process.env.SKIP_STORY_CONTENT_GEN === "1") {
  console.warn("[story-content] SKIP_STORY_CONTENT_GEN=1 — keeping the committed baseline");
  process.exit(0);
}

function fail(msg) {
  console.error(`\n[story-content] FAIL: ${msg}\n`);
  process.exit(1);
}

async function main() {
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
    `[story-content] wrote public/baseline-content.json (${kb}KB) — ` +
      `${graph.library.length} library stories, ${graph.intros.length} campaign intros, ` +
      `${graph.scenes.length} scenes, ${graph.media.length} media rows, ` +
      `${graph.collections.length} collections, ${graph.games.length} games`,
  );
}

main().catch((e) => fail(e?.message ?? String(e)));
