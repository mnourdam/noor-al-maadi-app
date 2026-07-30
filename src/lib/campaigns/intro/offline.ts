// ============================================================
// Campaign Intros — offline reader (Stage 5)
// ------------------------------------------------------------
// The intro plays from the OFFLINE SNAPSHOT only. There is no
// network call in the playback path: if the assets are not in the
// snapshot the intro is skipped and the campaign starts normally.
// The APK build gate (`scripts/verify-campaign-intro-assets.mjs`)
// guarantees that a shipped build can never reach that state for
// an authored intro.
// ============================================================

import { getCollection } from "@/lib/offline-snapshot";
import { auditCampaignIntroAssets, INTRO_ENGINE_VERSION } from "./audit";
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

/**
 * Loads an authored intro's story + scenes + media from the local
 * snapshot. Returns `null` when anything required is missing — the
 * caller then renders the campaign directly.
 */
export async function loadCampaignIntroBundle(
  ref: CampaignIntroRef | null | undefined,
): Promise<CampaignIntroBundle | null> {
  if (!ref?.storyId) return null;
  try {
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
