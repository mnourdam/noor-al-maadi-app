// ============================================================
// Campaign Intros — offline reader (Stage 5 + delta sync)
// ------------------------------------------------------------
// Read order (newest wins, playback never waits on the network):
//   1. locally synced bundle (background delta sync)
//   2. bundled offline snapshot (APK seed)
//   3. on-demand server fetch (only when neither has the intro
//      AND the device is online) — the result is cached locally
//      for later offline playback.
// ============================================================

import { getCollection } from "@/lib/offline-snapshot";
import { auditCampaignIntroAssets, INTRO_ENGINE_VERSION } from "./audit";
import { readSyncedIntroBundle } from "./content-store";
import { ensureCampaignIntroContent } from "./content-sync";
import type { CampaignIntroRef } from "./types";

export { INTRO_ENGINE_VERSION };

export interface CampaignIntroBundle {
  ref: CampaignIntroRef;
  story: Record<string, unknown>;
  scenes: Record<string, unknown>[];
  media: Record<string, unknown>[];
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((r) => r && typeof r === "object") as Record<string, unknown>[])
    : [];
}

function bundleFromSynced(
  ref: CampaignIntroRef,
  synced: Awaited<ReturnType<typeof readSyncedIntroBundle>>,
): CampaignIntroBundle | null {
  if (!synced?.story || !Array.isArray(synced.scenes) || synced.scenes.length === 0) return null;
  const audit = auditCampaignIntroAssets({
    campaigns: [
      { id: ref.campaignId, intro_story_id: ref.storyId, intro_version: ref.version },
    ],
    stories: [synced.story],
    story_scenes: synced.scenes,
    story_media: synced.media ?? [],
  });
  const entry = audit.entries[0];
  if (!entry || !entry.ready) return null;
  return {
    ref,
    story: synced.story,
    scenes: synced.scenes,
    media: synced.media ?? [],
  };
}

/**
 * Loads an authored intro's story + scenes + media.
 * Returns `null` when nothing playable is available — the caller then
 * renders the campaign directly.
 */
export async function loadCampaignIntroBundle(
  ref: CampaignIntroRef | null | undefined,
): Promise<CampaignIntroBundle | null> {
  if (!ref?.storyId) return null;
  try {
    // 1) Locally synced content wins over the bundled seed.
    const synced = bundleFromSynced(ref, await readSyncedIntroBundle(ref.storyId));
    if (synced) return synced;

    const [stories, scenes, media] = await Promise.all([
      getCollection("stories" as never),
      getCollection("story_scenes" as never),
      getCollection("story_media" as never),
    ]);

    const storyRows = asRows(stories);
    const story = storyRows.find((s) => String(s.id ?? "") === ref.storyId) ?? null;
    if (!story) return null;

    const audit = auditCampaignIntroAssets({
      campaigns: [
        { id: ref.campaignId, intro_story_id: ref.storyId, intro_version: ref.version },
      ],
      stories: storyRows,
      story_scenes: asRows(scenes),
      story_media: asRows(media),
    });
    const entry = audit.entries[0];
    if (!entry || !entry.ready) return null;

    const storyScenes = asRows(scenes)
      .filter((s) => String(s.story_id ?? "") === ref.storyId)
      .sort((a, b) => Number(a.scene_index ?? 0) - Number(b.scene_index ?? 0));
    const storyMedia = asRows(media).filter(
      (m) => String(m.story_id ?? "") === ref.storyId,
    );

    return { ref, story, scenes: storyScenes, media: storyMedia };
  } catch {
    return null;
  }
}

/** Cheap readiness probe used by the gate before opening the intro. */
export async function isCampaignIntroPlayableOffline(
  ref: CampaignIntroRef | null | undefined,
): Promise<boolean> {
  return (await loadCampaignIntroBundle(ref)) !== null;
}
