// ============================================================
// Campaign Intros — authored resolution (Stage 3)
// ------------------------------------------------------------
// STRICT: an intro exists only when the campaign explicitly
// authors `intro_story_id`. Nothing is inferred from titles,
// worldSlug, era, key art or story catalogues.
// ============================================================

import type { CampaignIntroRef } from "./types";

/** Minimal structural shape — keeps this module import-light. */
export interface IntroCarrier {
  id?: unknown;
  slug?: unknown;
  intro_story_id?: unknown;
  introStoryId?: unknown;
  intro_version?: unknown;
  introVersion?: unknown;
}

function readString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/**
 * Normalises the authored version.
 * Anything that is not a positive integer resolves to 1 — never to a
 * fabricated newer version (which would re-show the intro).
 */
export function normalizeIntroVersion(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return 1;
  const int = Math.trunc(n);
  return int >= 1 ? int : 1;
}

/**
 * The single sanctioned way to resolve a campaign's intro.
 *
 * Authored data on the campaign row wins. When the local campaign row
 * predates the intro (an intro published after the APK was built), the
 * synced link mirror supplies it — still an authored link, just fetched
 * in the background rather than baked into the snapshot.
 *
 * Returns `null` when no intro is authored anywhere.
 */
export function resolveCampaignIntro(
  campaign: IntroCarrier | null | undefined,
): CampaignIntroRef | null {
  if (!campaign) return null;
  const campaignId = readString(campaign.id, campaign.slug);
  if (!campaignId) return null;
  const storyId = readString(campaign.intro_story_id, campaign.introStoryId);
  if (!storyId) {
    const synced =
      getSyncedIntroLink(campaign.id) ?? getSyncedIntroLink(campaign.slug);
    if (!synced) return null;
    return {
      campaignId,
      storyId: synced.storyId,
      version: normalizeIntroVersion(synced.version),
    };
  }
  return {
    campaignId,
    storyId,
    version: normalizeIntroVersion(
      campaign.intro_version ?? campaign.introVersion,
    ),
  };
}

