// ============================================================
// Campaign Intros — runtime decision diagnostics
// ------------------------------------------------------------
// One place that explains, in production-grade terms, WHY an intro
// did or did not play. The synchronous part mirrors exactly what the
// gate does (no second source of truth); the async part enriches the
// report with the story record so a silent failure is impossible.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import {
  areCampaignIntrosEnabled,
  isCampaignIntroRolledOut,
  readCampaignIntroRollout,
} from "./flags";
import { resolveCampaignIntro, type IntroCarrier } from "./resolve";
import { readCampaignIntroState, resetCampaignIntro } from "./state";
import type { CampaignIntroRef } from "./types";

export type IntroRejectionReason =
  | "missing_intro_story_id"
  | "no_renderer"
  | "server_kill_switch_disabled"
  | "pilot_restricted"
  | "already_completed"
  | "already_skipped"
  | "story_not_found"
  | "story_not_published"
  | "wrong_story_kind"
  | "unsupported_schema"
  | "media_unavailable"
  | null;

export interface IntroDecisionReport {
  campaignId: string | null;
  envMode: string;
  serverEnabled: boolean;
  rollout: string[];
  introStoryId: string | null;
  introVersion: number | null;
  previousState: string | null;
  decision: "show" | "skip";
  rejectionReason: IntroRejectionReason;
  storyFound?: boolean;
  storyStatus?: string | null;
  storyKind?: string | null;
  sceneCount?: number;
  mediaAvailable?: boolean;
}

function envMode(): string {
  try {
    const v = import.meta.env?.VITE_CAMPAIGN_INTROS;
    return typeof v === "string" && v.trim() ? v.trim() : "1";
  } catch {
    return "1";
  }
}

/** Synchronous, allocation-light — exactly the gate's decision. */
export function diagnoseCampaignIntro(
  campaign: IntroCarrier | null | undefined,
  opts: { forceReplay?: boolean; hasRenderer?: boolean } = {},
): IntroDecisionReport {
  const ref = resolveCampaignIntro(campaign);
  const serverEnabled = areCampaignIntrosEnabled();
  const base: IntroDecisionReport = {
    campaignId: ref?.campaignId ?? (typeof campaign?.id === "string" ? campaign.id : null),
    envMode: envMode(),
    serverEnabled,
    rollout: readCampaignIntroRollout(),
    introStoryId: ref?.storyId ?? null,
    introVersion: ref?.version ?? null,
    previousState: null,
    decision: "skip",
    rejectionReason: null,
  };

  if (!ref) return { ...base, rejectionReason: "missing_intro_story_id" };
  if (opts.hasRenderer === false) return { ...base, rejectionReason: "no_renderer" };
  if (!serverEnabled) return { ...base, rejectionReason: "server_kill_switch_disabled" };
  if (!isCampaignIntroRolledOut(ref.campaignId))
    return { ...base, rejectionReason: "pilot_restricted" };

  const prev = readCampaignIntroState(ref);
  base.previousState = prev?.status ?? null;
  if (!opts.forceReplay && prev && prev.status !== "started") {
    return {
      ...base,
      rejectionReason:
        prev.status === "completed" ? "already_completed" : "already_skipped",
    };
  }
  return { ...base, decision: "show", rejectionReason: null };
}

/** Enriches a sync report with the real story record (network). */
export async function auditCampaignIntroRuntime(
  campaign: IntroCarrier | null | undefined,
  opts: { forceReplay?: boolean; hasRenderer?: boolean } = {},
): Promise<IntroDecisionReport> {
  const report = diagnoseCampaignIntro(campaign, opts);
  if (!report.introStoryId) return report;
  try {
    const { data } = await supabase
      .from("stories")
      .select("id,status,metadata,tags")
      .eq("id", report.introStoryId)
      .maybeSingle();
    if (!data) {
      return { ...report, storyFound: false, decision: "skip", rejectionReason: "story_not_found" };
    }
    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const kind =
      typeof meta.kind === "string"
        ? meta.kind
        : Array.isArray(data.tags) && data.tags.includes("campaign-intro")
          ? "campaign_intro"
          : null;
    const { count } = await supabase
      .from("story_scenes")
      .select("id", { count: "exact", head: true })
      .eq("story_id", report.introStoryId);
    const enriched: IntroDecisionReport = {
      ...report,
      storyFound: true,
      storyStatus: data.status,
      storyKind: kind,
      sceneCount: count ?? 0,
    };
    if (data.status !== "published")
      return { ...enriched, decision: "skip", rejectionReason: "story_not_published" };
    if (kind !== "campaign_intro")
      return { ...enriched, decision: "skip", rejectionReason: "wrong_story_kind" };
    if ((count ?? 0) < 1)
      return { ...enriched, decision: "skip", rejectionReason: "unsupported_schema" };
    return enriched;
  } catch {
    return report;
  }
}

/** Dev/debug hatch: clears the local record for a campaign+version. */
export function resetCampaignIntroForDebug(ref: CampaignIntroRef): void {
  resetCampaignIntro(ref);
}

/** Registers `window.__irthIntro` helpers (dev + debug builds only). */
export function publishIntroDiagnostics(report: IntroDecisionReport, ref: CampaignIntroRef | null) {
  try {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    w.__irthIntro = {
      last: report,
      audit: (campaign: IntroCarrier) => auditCampaignIntroRuntime(campaign),
      reset: () => {
        if (!ref) return false;
        resetCampaignIntroForDebug(ref);
        return true;
      },
    };
  } catch {
    /* ignore */
  }
}
