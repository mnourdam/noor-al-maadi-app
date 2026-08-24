import { recordTrace } from "@/lib/diag-trace";
// ============================================================
// Campaign Recommendation Service
// ------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for "what campaign should the player do
// next?".  Consumed by:
//   • Home Hero               (global scope)
//   • Worlds Continue Journey (world-scoped)
//   • Future Story mode / any other surface
//
// The service is intentionally PURE + DETERMINISTIC:
//   • Same inputs → same output, every render.
//   • No randomness, no wall-clock reads, no network I/O.
//   • Tie-breakers are canonical: chronological_order → sort_year
//     → historicalPeriod year → slug (locale-neutral).
//
// Decision tree (in strict priority order):
//   A. RESUME earliest STARTED-but-incomplete campaign
//      → first unfinished chapter in canonical order.
//   B. START  earliest UNSTARTED campaign in canonical order.
//   C. Otherwise return `null` — every eligible campaign is
//      completed.  The caller (Hero / world page) then falls back
//      to non-campaign recommendations (investigation, entity, …).
//
// Completed campaigns are NEVER recommended.
// Replay is NOT supported here — a future replay mode must add a
// new priority tier ABOVE C, never mutate A/B.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublishedCampaigns } from "@/lib/supabaseCampaigns";
import { isReconciliationTerminal, subscribeReconciliation } from "@/lib/boot/reconciliation";
import { campaignSortKey, sortCampaignsChronological } from "@/lib/campaignChronology";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type {
  Campaign,
  CampaignChapter,
} from "@/types/campaign";

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

/**
 * Recommendation "types" — enumerated so future surfaces can add
 * non-campaign recommendations (story, artifact, challenge…) via
 * a separate service without changing Hero/Worlds call sites.
 */
export type RecommendationType =
  | "campaign"
  | "investigation"
  | "encyclopedia"
  | "artifact"
  | "challenge"
  | "story";

/**
 * `priority` describes the DECISION TIER that produced this
 * recommendation, useful for logging and future UX distinctions.
 *   • "resume"   → tier A (in-flight campaign)
 *   • "start"    → tier B (first unstarted campaign)
 *   • "fallback" → reserved for future non-campaign fills
 */
export type RecommendationPriority = "resume" | "start" | "fallback";

/**
 * `confidence` is `"high"` for the shared campaign service:
 * decisions are based on hard local + cloud progress signals.
 * Reserved as an escape hatch for future heuristic recommenders.
 */
export type RecommendationConfidence = "high" | "medium" | "low";

export type CampaignRecommendationReason =
  | "resume-in-progress"
  | "start-first-unstarted";

export type CampaignRecommendation = {
  type: "campaign";
  priority: RecommendationPriority;   // "resume" | "start"
  confidence: RecommendationConfidence;
  reason: CampaignRecommendationReason;
  campaign: Campaign;
  /** null when priority = "start" (player hasn't chosen a chapter yet). */
  chapter: CampaignChapter | null;
  progress: {
    completedChapters: number;
    totalChapters: number;
    pct: number;              // 0..100 integer
  };
  cta: {
    labelAr: string;
    /**
     * Route target.  We keep this as a discriminated union of the
     * two canonical campaign routes so consumers can `<Link to={cta.to.path} params={cta.to.params}>`
     * without stringly-typed router calls.
     */
    to:
      | { path: "/campaigns/imported/$id"; params: { id: string } }
      | { path: "/campaigns/imported/$id/chapter/$chapter"; params: { id: string; chapter: string } };
  };
};

export type CampaignRecommendationResult = CampaignRecommendation | null;

// ------------------------------------------------------------
// Pure decision core
// ------------------------------------------------------------

/**
 * Chapters sorted deterministically by (`order` ASC, then id).
 * `order` is authored by admins; when missing/duplicated the id
 * tiebreak keeps the sequence stable across renders.
 */
function sortedChapters(c: Campaign): CampaignChapter[] {
  return [...(c.chapters ?? [])].sort((a, b) => {
    const oa = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
    const ob = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Deterministic campaign comparator per the spec:
 *   chronological_order → sort_year → historicalPeriod (via
 *   campaignSortKey) → slug fallback.  `title` is intentionally
 *   NOT a tiebreaker here (worlds-progress used slug too).
 */
function compareCampaignsCanonical(a: Campaign, b: Campaign): number {
  const ka = campaignSortKey(a);
  const kb = campaignSortKey(b);
  if (ka !== kb) return ka - kb;
  const sa = String(a.slug ?? a.id ?? "");
  const sb = String(b.slug ?? b.id ?? "");
  return sa.localeCompare(sb);
}

type ProgressLookup = (campaignId: string) => {
  /** Chapter ids the player has finished (any source: local or cloud). */
  completedChapterIds: Set<string>;
  /** True if any recorded activity or completion exists at all. */
  hasAnyActivity: boolean;
  /** True if the progress record is explicitly marked complete. */
  completedFlag: boolean;
};

export type PickCampaignRecommendationOptions = {
  /** Fully-eligible campaign pool.  Callers filter by world here. */
  campaigns: Campaign[];
  /** Progress accessor.  Injected so the fn stays pure/testable. */
  getProgress: ProgressLookup;
};

/**
 * Pure decision function — the canonical implementation.
 * Callers that already own the campaign list + progress lookup
 * (e.g. `pickContinueJourney` in worlds-progress) call this
 * directly.  Everyone else uses `useCampaignRecommendation()`.
 */
export function pickCampaignRecommendation(
  opts: PickCampaignRecommendationOptions,
): CampaignRecommendationResult {
  const pool = (opts.campaigns ?? []).filter(
    (c) => c && (c.status ?? "published") === "published" && (c.chapters?.length ?? 0) > 0,
  );
  if (pool.length === 0) return null;

  // Canonical, stable ordering.
  const ordered = [...pool].sort(compareCampaignsCanonical);

  // Enrich with progress once — avoids re-reading localStorage per iteration.
  const enriched = ordered.map((c) => {
    const chapters = sortedChapters(c);
    const validIds = new Set(chapters.map((ch) => ch.id));
    const raw = opts.getProgress(c.id);
    // Restrict progress to chapters that STILL EXIST on the campaign;
    // stale ids from a previous import must never count as "started".
    const completedChapterIds = new Set<string>();
    for (const id of raw.completedChapterIds) {
      if (validIds.has(id)) completedChapterIds.add(id);
    }
    const totalChapters = chapters.length;
    const completedChapters = completedChapterIds.size;
    const isComplete =
      raw.completedFlag ||
      (totalChapters > 0 && completedChapters >= totalChapters);
    const hasStarted = completedChapters > 0 || raw.hasAnyActivity;
    return { campaign: c, chapters, completedChapterIds, completedChapters, totalChapters, isComplete, hasStarted };
  });

  // Tier A — RESUME first started-but-incomplete campaign.
  for (const e of enriched) {
    if (e.isComplete) continue;
    if (!e.hasStarted) continue;
    const nextChapter =
      e.chapters.find((ch) => !e.completedChapterIds.has(ch.id)) ?? null;
    if (!nextChapter) continue;
    const pct = e.totalChapters > 0
      ? Math.round((e.completedChapters / e.totalChapters) * 100)
      : 0;
    return {
      type: "campaign",
      priority: "resume",
      confidence: "high",
      reason: "resume-in-progress",
      campaign: e.campaign,
      chapter: nextChapter,
      progress: { completedChapters: e.completedChapters, totalChapters: e.totalChapters, pct },
      cta: {
        labelAr: "أكمل رحلتك",
        to: {
          path: "/campaigns/imported/$id/chapter/$chapter",
          params: { id: e.campaign.id, chapter: nextChapter.id },
        },
      },
    };
  }

  // Tier B — START first fully-unstarted campaign.
  for (const e of enriched) {
    if (e.isComplete) continue;
    if (e.hasStarted) continue;
    return {
      type: "campaign",
      priority: "start",
      confidence: "high",
      reason: "start-first-unstarted",
      campaign: e.campaign,
      chapter: null,
      progress: { completedChapters: 0, totalChapters: e.totalChapters, pct: 0 },
      cta: {
        labelAr: "ابدأ رحلتك",
        to: {
          path: "/campaigns/imported/$id",
          params: { id: e.campaign.id },
        },
      },
    };
  }

  // Tier C — every eligible campaign is complete.  Return null so
  // the caller can fall back to investigations / discoveries / …
  return null;
}

// ------------------------------------------------------------
// Progress lookup builder
// ------------------------------------------------------------

/**
 * Build a `ProgressLookup` from the two canonical sources:
 *   • local `getCampaignProgress()` (irth_campaign_progress)
 *   • cloud `user_campaign_progress` chapter completion map
 *
 * Local wins for "any activity" (partial activities never appear
 * in the cloud table); cloud wins for the completed-chapter set.
 */
export function buildProgressLookup(
  cloudCampaign: Map<string, Set<string>>,
): ProgressLookup {
  return (campaignId: string) => {
    const local = getCampaignProgress(campaignId);
    const cloudDone = cloudCampaign.get(campaignId) ?? new Set<string>();
    const completedChapterIds = new Set<string>(cloudDone);
    let hasAnyActivity = false;
    for (const [chid, ch] of Object.entries(local.chapters ?? {})) {
      if (ch?.completed) completedChapterIds.add(chid);
      if (ch?.completed || (ch?.completedActivityIds?.length ?? 0) > 0) {
        hasAnyActivity = true;
      }
    }
    return {
      completedChapterIds,
      hasAnyActivity,
      completedFlag: !!local.completed,
    };
  };
}

// ------------------------------------------------------------
// React hook — the canonical call site for UI.
// ------------------------------------------------------------

type UseCampaignRecommendationOptions = {
  /**
   * Optional world filter.  When provided, only campaigns whose
   * id appears in `worldCampaignIds` are considered.  This is how
   * Worlds Continue Journey uses the same engine as Home Hero.
   */
  worldCampaignIds?: ReadonlyArray<string> | null;
};

/**
 * Cloud campaign progress hook — kept LOCAL to this file to avoid
 * a circular dep with `worlds-progress`.  Identical shape /
 * subscription events to the one in `worlds-progress`.
 */
function useCloudCampaignProgressLocal(): Map<string, Set<string>> {
  const [uid, setUid] = useState<string | null>(null);
  const [map, setMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null);
      if (!session) setMap(new Map());
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("irth:outbox:flushed", bump);
    window.addEventListener("irth:campaign-progress:changed", bump);
    window.addEventListener("irth:campaign-progress:updated", bump);
    return () => {
      window.removeEventListener("irth:outbox:flushed", bump);
      window.removeEventListener("irth:campaign-progress:changed", bump);
      window.removeEventListener("irth:campaign-progress:updated", bump);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_campaign_progress")
          .select("campaign_id,chapter_id,completed_at")
          .eq("user_id", uid);
        if (cancelled) return;
        const next = new Map<string, Set<string>>();
        for (const r of (data ?? []) as Array<{ campaign_id: string; chapter_id: string; completed_at: string | null }>) {
          if (!r.campaign_id || !r.chapter_id || !r.completed_at) continue;
          let s = next.get(r.campaign_id);
          if (!s) { s = new Set(); next.set(r.campaign_id, s); }
          s.add(r.chapter_id);
        }
        setMap(next);
      } catch { /* offline — keep last known */ }
    })();
    return () => { cancelled = true; };
  }, [uid, tick]);

  return map;
}

/**
 * Canonical React hook.  Hero and Worlds MUST consume this and
 * nothing else — the moment anyone reads campaigns + progress
 * elsewhere for a recommendation, the two surfaces will drift.
 */
export function useCampaignRecommendation(
  opts?: UseCampaignRecommendationOptions,
): { recommendation: CampaignRecommendationResult; ready: boolean } {
  const worldCampaignIds = opts?.worldCampaignIds ?? null;

  // reconciliation trust state
  const [reconReady, setReconReady] = useState(isReconciliationTerminal());
  useEffect(() => {
    return subscribeReconciliation(() => {
      setReconReady(isReconciliationTerminal());
    });
  }, []);

  const { data: campaigns = [], isSuccess } = useQuery({
    queryKey: ["campaign-recommendation-source"],
    queryFn: fetchPublishedCampaigns,
    staleTime: 60_000,
  });

  // Local progress bump — mirror the pattern the Hero already used
  // so a chapter completion refreshes the recommendation right away.
  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setProgressTick((t) => t + 1);
        timer = null;
      }, 100);
    };
    window.addEventListener("focus", bump);
    window.addEventListener("irth:campaign-progress:updated", bump);
    window.addEventListener("irth:campaign-progress:changed", bump);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", bump);
      window.removeEventListener("irth:campaign-progress:updated", bump);
      window.removeEventListener("irth:campaign-progress:changed", bump);
    };
  }, []);

  const cloudCampaign = useCloudCampaignProgressLocal();

  const recommendation = useMemo<CampaignRecommendationResult>(() => {
    const started = performance.now();
    recordTrace("sync-forensics", "CAMPAIGN_RECOMMENDATION_START");
    if (!campaigns.length) return null;
    const pool = worldCampaignIds
      ? campaigns.filter((c) => worldCampaignIds.includes(c.id))
      : campaigns;
    // sortCampaignsChronological is applied inside pickCampaignRecommendation
    // via compareCampaignsCanonical, but calling it here first keeps the
    // pre-filter stable when future callers inspect the pool directly.
    const ordered = sortCampaignsChronological(pool);
    const res = pickCampaignRecommendation({
      campaigns: ordered,
      getProgress: buildProgressLookup(cloudCampaign),
    });
    const duration = Math.round(performance.now() - started);
    recordTrace("sync-forensics", "CAMPAIGN_RECOMMENDATION_READY", `${duration}ms`);
    return res;
  }, [campaigns, worldCampaignIds, cloudCampaign, progressTick]);

  return { recommendation, ready: isSuccess && reconReady };
}
