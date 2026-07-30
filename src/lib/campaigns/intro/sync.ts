// ============================================================
// Campaign Intros — server mirror (Stage 4)
// ------------------------------------------------------------
// SEPARATION CONTRACT (frozen):
//   * The DISPLAY DECISION is local, synchronous and offline-only
//     (`shouldShowCampaignIntro`). Nothing here is ever consulted
//     before showing/hiding an intro, and campaign start never
//     waits on the network.
//   * The server record is a RESTORE/BACKUP source only: it is
//     replayed into the local store after sign-in or on a new
//     device, and it can only STRENGTHEN a local record.
//   * Writes go through the durable outbox, so a failed or offline
//     write is retried later and can never double-apply — the RPC
//     merge is idempotent and monotonic.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { recordCampaignIntroWatch } from "@/lib/offline/record";
import type { CampaignIntroRef, CampaignIntroStatus } from "./types";
import { mergeCampaignIntroRecord } from "./state";

/**
 * Fire-and-forget mirror of a local intro transition.
 * NEVER awaited by the gate; the local write already happened.
 */
export function queueCampaignIntroSync(
  ref: CampaignIntroRef,
  status: CampaignIntroStatus,
  lastSceneIndex = 0,
): void {
  try {
    void recordCampaignIntroWatch({
      campaignId: ref.campaignId,
      introVersion: ref.version,
      storyId: ref.storyId,
      status,
      lastSceneIndex,
    });
  } catch {
    /* the local record remains authoritative */
  }
}

export interface ServerCampaignIntroRow {
  campaign_id: string;
  intro_version: number;
  story_id: string | null;
  status: CampaignIntroStatus;
  last_scene_index: number;
  first_started_at: string | null;
  resolved_at: string | null;
}

/**
 * Pull the signed-in player's intro history and merge it into the local
 * store. Used after sign-in / on a fresh device. Returns the number of
 * local records that were strengthened. Safe to call repeatedly; a
 * failure is silent (the local store stays authoritative).
 */
export async function hydrateCampaignIntrosFromServer(): Promise<number> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user?.id) return 0;
    const { data, error } = await supabase.rpc("list_my_campaign_intros" as never);
    if (error || !Array.isArray(data)) return 0;
    let changed = 0;
    for (const raw of data as unknown as ServerCampaignIntroRow[]) {
      if (!raw?.campaign_id) continue;
      const applied = mergeCampaignIntroRecord({
        campaignId: raw.campaign_id,
        storyId: raw.story_id ?? "",
        version: Math.max(1, Math.trunc(Number(raw.intro_version) || 1)),
        status: raw.status,
        lastSceneIndex: Math.max(0, Math.trunc(Number(raw.last_scene_index) || 0)),
        firstStartedAt: raw.first_started_at ?? undefined,
        resolvedAt: raw.resolved_at ?? undefined,
      });
      if (applied) changed += 1;
    }
    return changed;
  } catch {
    return 0;
  }
}
