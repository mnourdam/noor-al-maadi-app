// ============================================================
// Shared build-time export helpers for offline STORY content.
// ------------------------------------------------------------
// SECURITY CONTRACT
//   * `SUPABASE_SERVICE_ROLE_KEY` is a BUILD-TIME ONLY secret.
//   * It is read exclusively from `process.env` inside Node build
//     scripts, never hardcoded, never committed, never written to
//     any generated artifact (JSON, TS, manifest, log, asset).
//   * Nothing here ever prints the key or embeds it in output.
//   * It must never be exposed through a `VITE_*` variable.
//
// The `story-media` bucket is PRIVATE, so packaging story artwork
// for true offline playback requires the service role at build
// time only. The shipped app keeps using the public, RLS-enforced
// read paths.
// ============================================================

import { existsSync, readFileSync } from "node:fs";

const PAGE = 500;

export function serviceEnv({ requireServiceKey = true } = {}) {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    readDotEnv("VITE_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "[story-export] SUPABASE_URL (or VITE_SUPABASE_URL) is required for build-time story export",
    );
  }
  if (requireServiceKey && !key) {
    throw new Error(
      "[story-export] SUPABASE_SERVICE_ROLE_KEY is required to package private story media.\n" +
        "  Supply it as a BUILD-TIME environment secret only:\n" +
        "    SUPABASE_SERVICE_ROLE_KEY=… npm run build:android:web\n" +
        "  Never commit it, never expose it as VITE_*.",
    );
  }
  return { url: url.replace(/\/+$/, ""), key };
}

function readDotEnv(name) {
  try {
    if (!existsSync(".env")) return undefined;
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i < 1 || line.trim().startsWith("#")) continue;
      if (line.slice(0, i).trim() !== name) continue;
      return line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Paginated PostgREST read with the build-time service role. */
export async function restAll({ url, key }, path) {
  // Offset pagination is only correct with a deterministic total order.
  // Without it PostgREST may repeat/skip rows between pages, which silently
  // produced a different 1797-row media set on every export run.
  if (!path.includes("order=")) {
    throw new Error(`[story-export] refusing unordered pagination for ${path.split("?")[0]}`);
  }
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${url}/rest/v1/${path}${sep}limit=${PAGE}&offset=${from}`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    if (!res.ok) {
      // Never echo headers/body that could contain credentials.
      throw new Error(`[story-export] REST ${path.split("?")[0]} failed: HTTP ${res.status}`);
    }
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < PAGE) break;
    if (from > 500_000) throw new Error("[story-export] pagination safety cap hit");
  }
  return out;
}

/** Download one object from the private story-media bucket. */
export async function downloadStoryMedia({ url, key }, bucket, path, attempts = 4) {
  const endpoint = `${url}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      // 4xx other than 429 are permanent — retrying only slows the build down.
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new Error(`[story-export] media ${path}: HTTP ${res.status}`);
      if (!retryable) break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
  }
  throw lastError ?? new Error(`[story-export] media ${path}: unknown download failure`);
}

/** True when a story row is a campaign intro rather than a library story. */
export function isIntroStory(story, introIds) {
  const kind = story?.metadata?.kind;
  const tags = Array.isArray(story?.tags) ? story.tags : [];
  return kind === "campaign_intro" || tags.includes("campaign-intro") || introIds.has(story?.id);
}

/**
 * Fetch the canonical published story graph:
 *   library stories + campaign intro stories + scenes + verified media
 *   + story collections + published games.
 */
export async function fetchStoryGraph(env) {
  const [games, stories, collections, campaigns] = await Promise.all([
    restAll(env, "games?select=*&status=eq.published&order=id.asc"),
    restAll(env, "stories?select=*&status=eq.published&order=id.asc"),
    restAll(env, "story_collections?select=*&order=display_order.asc"),
    restAll(env, "admin_campaigns?select=id,data&order=id.asc"),
  ]);

  const introIds = new Set(
    campaigns
      .map((c) => c?.data?.intro_story_id)
      .filter((v) => typeof v === "string" && v.length > 0),
  );

  const intros = stories.filter((s) => isIntroStory(s, introIds));
  const library = stories.filter((s) => !isIntroStory(s, introIds));
  const ids = stories.map((s) => s.id);

  const scenes = [];
  const media = [];
  // `in.(...)` has a URL length limit — chunk the id list.
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60).join(",");
    scenes.push(
      ...(await restAll(
        env,
        `story_scenes?select=*&story_id=in.(${chunk})&order=story_id.asc,scene_index.asc`,
      )),
    );
    media.push(
      ...(await restAll(env, `story_media?select=*&story_id=in.(${chunk})&verified=eq.true&order=id.asc`)),
    );
  }

  return { games, stories, library, intros, scenes, media, collections };
}

/**
 * Every media row a packaged story actually needs offline:
 * its cover plus every media row referenced by its scenes.
 */
export function requiredMediaFor(stories, scenes, media) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const needed = new Map();
  const storyIds = new Set(stories.map((s) => s.id));

  for (const story of stories) {
    const cover = story.cover_media_id && byId.get(story.cover_media_id);
    if (cover) needed.set(cover.id, cover);
  }
  for (const scene of scenes) {
    if (!storyIds.has(scene.story_id)) continue;
    for (const id of sceneMediaIds(scene)) {
      const row = byId.get(id);
      if (row) needed.set(row.id, row);
    }
  }
  return [...needed.values()];
}

/**
 * Media ids referenced by a scene row.
 * MUST mirror `collectSceneMediaIds` in src/lib/campaigns/intro/audit.ts
 * so the build gate and the runtime agree on what "complete" means.
 */
export function sceneMediaIds(scene) {
  const ids = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) ids.push(v.trim());
  };
  push(scene?.primary_media_id);
  const payload = scene?.payload && typeof scene.payload === "object" ? scene.payload : null;
  if (payload) {
    for (const key of ["media_id", "mediaId", "image_media_id"]) push(payload[key]);
    const list = payload.media_ids ?? payload.mediaIds;
    if (Array.isArray(list)) for (const v of list) push(v);
  }
  return ids;
}

