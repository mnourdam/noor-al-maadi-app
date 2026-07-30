// ============================================================
// Campaign Intros — offline asset audit (Stage 5)
// ------------------------------------------------------------
// One PURE function shared by two consumers:
//   * the runtime offline reader (`./offline.ts`)
//   * the APK build gate (`scripts/verify-campaign-intro-assets.mjs`)
//
// Contract:
//   * An intro exists only when a campaign authors `intro_story_id`.
//   * A campaign WITHOUT an intro can never fail the audit.
//   * A campaign WITH an intro must have, inside the offline snapshot:
//       - the intro story row, published and NOT locked/redacted
//       - at least one scene
//       - every referenced media row, verified, with a storage path
//   * Forward compatibility: an intro authored for a NEWER engine
//     version is ignored (treated as "no intro"), never a build failure.
// ============================================================

/** Highest intro schema this build knows how to play. */
export const INTRO_ENGINE_VERSION = 1;

export interface IntroAuditInput {
  campaigns?: unknown[];
  stories?: unknown[];
  story_scenes?: unknown[];
  story_media?: unknown[];
}

export interface IntroAuditEntry {
  campaignId: string;
  storyId: string;
  version: number;
  /** true when every required asset is present offline. */
  ready: boolean;
  /** Ignored because it targets a newer intro engine. */
  skippedFutureEngine: boolean;
  sceneCount: number;
  mediaCount: number;
  problems: string[];
}

export interface IntroAuditResult {
  ok: boolean;
  entries: IntroAuditEntry[];
  errors: string[];
}

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function posInt(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i >= 1 ? i : fallback;
}

/** Reads the authored intro off a snapshot campaign row (`data` or flat). */
export function readCampaignIntroFromRow(
  row: unknown,
): { campaignId: string; storyId: string; version: number; engineVersion: number } | null {
  const r = rec(row);
  if (!r) return null;
  const data = rec(r.data) ?? {};
  const campaignId = str(r.id) ?? str(r.slug) ?? str(data.id) ?? str(data.slug);
  if (!campaignId) return null;
  const storyId =
    str(r.intro_story_id) ??
    str((r as Record<string, unknown>).introStoryId) ??
    str(data.intro_story_id) ??
    str((data as Record<string, unknown>).introStoryId);
  if (!storyId) return null;
  const version = posInt(r.intro_version ?? data.intro_version, 1);
  const engineVersion = posInt(r.intro_engine_version ?? data.intro_engine_version, 1);
  return { campaignId, storyId, version, engineVersion };
}

function collectSceneMediaIds(scene: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const primary = str(scene.primary_media_id);
  if (primary) ids.push(primary);
  const payload = rec(scene.payload);
  if (payload) {
    for (const key of ["media_id", "mediaId", "image_media_id"]) {
      const v = str(payload[key]);
      if (v) ids.push(v);
    }
    const list = payload.media_ids ?? payload.mediaIds;
    if (Array.isArray(list)) {
      for (const v of list) {
        const s = str(v);
        if (s) ids.push(s);
      }
    }
  }
  return ids;
}

/**
 * Audits every authored campaign intro against a snapshot's collections.
 * Pure and dependency-free so the build gate can run it on raw JSON.
 */
export function auditCampaignIntroAssets(input: IntroAuditInput): IntroAuditResult {
  const campaigns = Array.isArray(input.campaigns) ? input.campaigns : [];
  const stories = Array.isArray(input.stories) ? input.stories : [];
  const scenes = Array.isArray(input.story_scenes) ? input.story_scenes : [];
  const media = Array.isArray(input.story_media) ? input.story_media : [];

  const storyById = new Map<string, Record<string, unknown>>();
  for (const s of stories) {
    const r = rec(s);
    const id = r ? str(r.id) : null;
    if (r && id) storyById.set(id, r);
  }

  const scenesByStory = new Map<string, Record<string, unknown>[]>();
  for (const s of scenes) {
    const r = rec(s);
    const sid = r ? str(r.story_id) : null;
    if (!r || !sid) continue;
    const list = scenesByStory.get(sid);
    if (list) list.push(r);
    else scenesByStory.set(sid, [r]);
  }

  const mediaById = new Map<string, Record<string, unknown>>();
  for (const m of media) {
    const r = rec(m);
    const id = r ? str(r.id) : null;
    if (r && id) mediaById.set(id, r);
  }

  const entries: IntroAuditEntry[] = [];
  const errors: string[] = [];

  for (const row of campaigns) {
    const authored = readCampaignIntroFromRow(row);
    if (!authored) continue;

    const entry: IntroAuditEntry = {
      campaignId: authored.campaignId,
      storyId: authored.storyId,
      version: authored.version,
      ready: false,
      skippedFutureEngine: authored.engineVersion > INTRO_ENGINE_VERSION,
      sceneCount: 0,
      mediaCount: 0,
      problems: [],
    };

    if (entry.skippedFutureEngine) {
      // Forward compatible: an older build simply plays no intro.
      entries.push(entry);
      continue;
    }

    const story = storyById.get(authored.storyId) ?? null;
    if (!story) {
      entry.problems.push("intro story is missing from the offline snapshot");
    } else {
      if (story.is_redacted === true) entry.problems.push("intro story is redacted offline");
      if (story.is_locked === true) entry.problems.push("intro story is locked offline");
      if (str(story.status) !== "published") entry.problems.push("intro story is not published");
    }

    const storyScenes = scenesByStory.get(authored.storyId) ?? [];
    entry.sceneCount = storyScenes.length;
    if (story && storyScenes.length === 0) {
      entry.problems.push("intro story has no scenes in the offline snapshot");
    }

    const needed = new Set<string>();
    const cover = story ? str(story.cover_media_id) : null;
    if (cover) needed.add(cover);
    for (const sc of storyScenes) for (const id of collectSceneMediaIds(sc)) needed.add(id);
    entry.mediaCount = needed.size;

    for (const id of needed) {
      const m = mediaById.get(id);
      if (!m) {
        entry.problems.push(`media ${id} is missing from the offline snapshot`);
        continue;
      }
      if (!str(m.storage_path)) entry.problems.push(`media ${id} has no storage path`);
      if (m.verified === false) entry.problems.push(`media ${id} is not verified`);
    }

    entry.ready = entry.problems.length === 0;
    if (!entry.ready) {
      for (const p of entry.problems) {
        errors.push(`campaign ${entry.campaignId} (intro v${entry.version}): ${p}`);
      }
    }
    entries.push(entry);
  }

  return { ok: errors.length === 0, entries, errors };
}
