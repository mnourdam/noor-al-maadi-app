// ============================================================
// Campaign Intros — types (Stage 3)
// ------------------------------------------------------------
// The intro is a `campaign_intro` story played once, per user,
// per campaign, per `intro_version`. Nothing here touches audio:
// the intro is a passive consumer of `CampaignAudioScope`.
// ============================================================

/** Resolution status of an intro for the active identity. */
export type CampaignIntroStatus = "started" | "completed" | "skipped";

/** Authored link from a campaign to its intro story. */
export interface CampaignIntroRef {
  campaignId: string;
  storyId: string;
  /** Always a positive integer. Defaults to 1 when unauthored. */
  version: number;
}

/** Locally persisted, identity-partitioned intro record. */
export interface CampaignIntroState {
  campaignId: string;
  storyId: string;
  version: number;
  status: CampaignIntroStatus;
  lastSceneIndex: number;
  firstStartedAt: string;
  resolvedAt?: string | null;
}

/**
 * Strength ordering used by every merge (local ⇄ server, stage 4).
 * A weaker status can never overwrite a stronger one.
 */
export const INTRO_STATUS_STRENGTH: Record<CampaignIntroStatus, number> = {
  started: 1,
  skipped: 2,
  completed: 3,
};

export function strongerIntroStatus(
  a: CampaignIntroStatus,
  b: CampaignIntroStatus,
): CampaignIntroStatus {
  return INTRO_STATUS_STRENGTH[b] > INTRO_STATUS_STRENGTH[a] ? b : a;
}

/** A resolved intro record key: one row per (campaign, version). */
export function introStateKey(campaignId: string, version: number): string {
  return `${campaignId}#v${version}`;
}
