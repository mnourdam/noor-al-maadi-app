// ============================================================
// /campaigns/imported/$id/chapter/$chapter — Imported chapter player
// ------------------------------------------------------------
// Walks the user through one chapter's activities, awarding
// XP/coins/hearts via importedCampaignProgress. Hearts are
// enforced (blocks new activities at 0), advancement waits for
// an explicit "next" tap so feedback is readable, and a
// completion modal lists rewards with resolved Arabic titles.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useParams, useNavigate, useSearch, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Coins, Sparkles, BookOpen, Scroll, ArrowRight, ArrowLeft, Check, Heart, X as XIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";

import type { Campaign, CampaignActivity, CampaignChapter } from "@/types/campaign";
import { ACTIVITY_DEFAULTS } from "@/types/campaign";
import { fetchCampaignByIdOrSlug, onCampaignPublished } from "@/lib/supabaseCampaigns";
import {
  getChapterProgress, getCampaignProgress, recordActivity, isChapterUnlocked,
} from "@/lib/importedCampaignProgress";
import { ActivityRenderer } from "@/components/imported-campaign/ActivityRenderer";
import { ActivityReviewCard } from "@/components/imported-campaign/ActivityReviewCard";
import { RichReadingText } from "@/components/imported-campaign/RichReadingText";
import { OutOfHeartsModal } from "@/components/imported-campaign/OutOfHeartsModal";
import { CampaignCompleteModal } from "@/components/imported-campaign/CampaignCompleteModal";
import { UnlockList } from "@/components/imported-campaign/UnlockList";
import { useProfile } from "@/lib/profile";
import { getEffectiveHearts } from "@/lib/hearts";
import { audioManager } from "@/lib/audioManager";
import {
  claimActivityReward, claimChapterReward, claimCampaignReward,
  enqueueCollectionSync, setActivePosition,
  clearActivePositionIf, unlockIdsToCollectionItems,
} from "@/lib/campaignLedger";
import { upsertChapterProgress } from "@/lib/progressSync";
import { recordTrace } from "@/lib/diag-trace";
import { recordCampaignGrant, getChapterGrantedTotals } from "@/lib/campaignRewardsGranted";
import { computeCampaignRewardSummary } from "@/lib/campaigns/rewardSummary";
import { Stagger, AnimatedNumber } from "@/components/motion/MotionPrimitives";
import {
  ensurePlan,
  buildRuntimeActivities,
  isReviewMarker,
  markReviewCompleted,
  clearPlan,
  findItem,
  grantReviewXp,
  upsertEntry,
  getEntry,
  bumpDaily,
  nextAfterCorrect,
  nextAfterWrong,
  harvestCampaignIntoBank,
  refreshMemoryBank,
  type MemoryReviewActivityMarker,

} from "@/lib/memory";
import { ReviewActivity } from "@/components/memory/ReviewActivity";

export const Route = createFileRoute("/campaigns/imported/$id/chapter/$chapter")({
  head: () => ({ meta: [{ title: "فصل من حملة — إرث" }] }),
  validateSearch: (s: Record<string, unknown>): { preview?: "draft" } =>
    s.preview === "draft" ? { preview: "draft" } : {},
  component: ImportedChapterPlayer,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <p className="text-muted-foreground">الفصل غير موجود.</p>
        <Link to="/campaigns" className="mt-4 inline-block text-gold">عودة للحملات</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل الفصل.</div></AppShell>
  ),
});

function ImportedChapterPlayer() {
  const { id, chapter: chapterId } = useParams({ from: "/campaigns/imported/$id/chapter/$chapter" });
  const search = useSearch({ from: "/campaigns/imported/$id/chapter/$chapter" });
  const mode: "published" | "draft" = search.preview === "draft" ? "draft" : "published";
  const queryClient = useQueryClient();
  const { data: campaign, isLoading: loading } = useQuery({
    queryKey: ["campaign", id, mode],
    queryFn: () => fetchCampaignByIdOrSlug(id, { mode }),
  });

  useEffect(() => {
    const off = onCampaignPublished((changedId) => {
      if (changedId === id || changedId === campaign?.slug) {
        queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      }
    });
    return off;
  }, [id, campaign?.slug, queryClient]);


  const chapter: CampaignChapter | undefined = useMemo(
    () => campaign?.chapters.find(c => c.id === chapterId),
    [campaign, chapterId],
  );

  const [progressTick, setProgressTick] = useState(0);
  const bump = () => setProgressTick(t => t + 1);

  const { profile, addPoints, addDinars, loseHeartOnce, recordStreakActivity } = useProfile();
  // PR1: per-render lock to swallow rapid duplicate onResolve calls
  // (e.g. double-tap on the answer button before the next paint).
  const resolveLockRef = useRef(false);
  const camProgress = campaign ? getCampaignProgress(campaign.id) : null;
  const chProgress  = campaign ? getChapterProgress(campaign.id, chapterId) : null;

  // PR2: strict progression. We only track a *correct* ack (gates the "Next" button).
  // Wrong answers never enter pendingAck — the activity stays open for retry.
  const [pendingAck, setPendingAck] = useState<Record<string, "correct" | undefined>>({});
  const [wrongFlash, setWrongFlash] = useState<Record<string, number>>({}); // activityId → attempt count (drives shake/feedback)
  const [outOfHeartsOpen, setOutOfHeartsOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);

  // Effective hearts derived from profile.
  const effectiveHearts = useMemo(() => getEffectiveHearts(profile), [profile, progressTick]);
  const heartsDepleted = effectiveHearts <= 0;

  // Auto-surface the out-of-hearts modal the first time we mount with 0 hearts.
  useEffect(() => {
    if (heartsDepleted) setOutOfHeartsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heartsDepleted]);

  // PR2 anti-skip: hard URL guard. If this chapter is locked, redirect to overview.
  // Exception: if the campaign is already fully completed, all chapters are
  // freely browsable in review mode — never redirect.
  const reviewMode = !!camProgress?.completed;
  const navigate = useNavigate();
  useEffect(() => {
    if (!campaign || !chapter) return;
    if (!reviewMode && !isChapterUnlocked(campaign, chapter)) {
      navigate({ to: "/campaigns/imported/$id", params: { id: campaign.id }, replace: true });
      return;
    }
    // PR3: persist resume pointer the moment we enter this chapter.
    if (!reviewMode) {
      setActivePosition({ campaignId: campaign.id, chapterId: chapter.id });
    }
  }, [campaign, chapter, navigate, reviewMode]);

  // Memory Engine — keep the review bank in sync with what the player has
  // actually finished (published snapshot + local progress ledger), then
  // build the frozen RuntimeChapterPlan. Original campaign data is never
  // mutated: `chapter.activities` stays the source of truth for
  // completion/allDone.
  const [bankTick, setBankTick] = useState(0);
  useEffect(() => {
    let alive = true;
    harvestCampaignIntoBank(campaign ?? null);
    void refreshMemoryBank().then(() => { if (alive) setBankTick(t => t + 1); });
    return () => { alive = false; };
  }, [campaign?.id]);

  const plan = useMemo(() => {
    if (!chapter || reviewMode) return null;
    // Re-selection is only ever allowed BEFORE the chapter is started, so a
    // review can never appear behind the player's current position.
    const started = (chProgress?.completedActivityIds.length ?? 0) > 0;
    return ensurePlan(
      campaign?.id ?? "", chapter.id, chapter.activities.map(a => a.id),
      Date.now(), { allowReselect: !started },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, chapter?.id, chapter?.activities.map(a => a.id).join("|"), reviewMode, progressTick, bankTick]);


  const runtimeActivities = useMemo(() => {
    if (!chapter) return [];
    if (!plan) return [...chapter.activities];
    return buildRuntimeActivities(chapter.activities, plan);
  }, [chapter, plan]);

  // Current runtime step = first entry that is not-yet-completed OR is
  // an original activity with a correct-ack pending.
  const currentIdx = useMemo(() => {
    if (!chapter || !chProgress) return 0;
    const originalDone = new Set(chProgress.completedActivityIds);
    const reviewDone = !!plan?.reviewCompleted;
    const idx = runtimeActivities.findIndex(a => {
      if (isReviewMarker(a)) return !reviewDone;
      const done = originalDone.has(a.id);
      const ackPending = pendingAck[a.id] === "correct";
      return !done || ackPending;
    });
    return idx === -1 ? Math.max(0, runtimeActivities.length - 1) : idx;
  }, [chapter, chProgress, progressTick, pendingAck, runtimeActivities, plan?.reviewCompleted]);

  if (loading) {
    return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">جاري التحميل…</div></AppShell>;
  }
  if (!campaign || !chapter) throw notFound();

  const runtimeStep = runtimeActivities[currentIdx];
  const activityIsReview = isReviewMarker(runtimeStep);
  const reviewMarker: MemoryReviewActivityMarker | null = activityIsReview ? (runtimeStep as MemoryReviewActivityMarker) : null;
  const activity: CampaignActivity | null =
    !runtimeStep || activityIsReview ? null : (runtimeStep as CampaignActivity);

  // Chapter completion is decided purely on the AUTHORED activity list.
  const allDone  = chapter.activities.length > 0
    && chapter.activities.every(a => chProgress?.completedActivityIds.includes(a.id))
    && Object.values(pendingAck).every(v => v !== "correct");

  const currentAck = activity ? pendingAck[activity.id] : undefined;
  const wrongAttempts = activity ? (wrongFlash[activity.id] ?? 0) : 0;

  const onResolve = async (correct: boolean, meta?: { viaReveal?: boolean; skipped?: boolean }) => {
    if (!activity) return;

    // PR1: hard guard against rapid duplicate submissions.
    if (resolveLockRef.current) return;
    resolveLockRef.current = true;
    setTimeout(() => { resolveLockRef.current = false; }, 350);

    // PR2 hard hearts gate — at 0 hearts, no answer is accepted (right or wrong).
    // Skipping an optional reflective moment is not an answer and costs no
    // heart, so it is never blocked by this gate.
    if (heartsDepleted && !meta?.skipped) {
      setOutOfHeartsOpen(true);
      return;
    }


    const hearts = activity.heartsPenalty ?? ACTIVITY_DEFAULTS.heartsPenalty;

    if (!correct) {
      // PR1: idempotent decrement — same attempt key never decrements twice.
      // Each wrong tap increments wrongAttempts, producing a fresh key, so
      // the player still loses one heart per genuine wrong answer.
      const toLose = Math.max(1, Math.min(1, hearts));
      const attemptKey = `act:${campaign!.id}:${chapter!.id}:${activity.id}:${wrongAttempts}`;
      for (let i = 0; i < toLose; i++) loseHeartOnce(attemptKey);
      setWrongFlash(prev => ({ ...prev, [activity.id]: (prev[activity.id] ?? 0) + 1 }));
      // Persist resume position on the current (still-open) activity.
      setActivePosition({ campaignId: campaign!.id, chapterId: chapter!.id, activityId: activity.id });
      if (effectiveHearts - toLose <= 0) {
        setTimeout(() => setOutOfHeartsOpen(true), 250);
      }
      return; // do NOT call recordActivity / pendingAck / advance
    }


    // ---- Correct branch ----
    // Learning-after-failure reward tiering:
    //   0 wrong  → full reward
    //   1 wrong  → 50% reward (still rewards accuracy on retry)
    //   viaReveal or 2+ wrong → minimum reward (floor 1 XP, 0 coins)
    const rewardScale: "full" | "half" | "min" =
      meta?.viaReveal || wrongAttempts >= 2
        ? "min"
        : wrongAttempts === 1
          ? "half"
          : "full";

    // PR3 local-first reward ledger: only grants once, across refreshes /
    // offline / reopen. Returns {granted:false, xp:0, coins:0} on replays.
    // A SKIPPED activity (optional reflective moment) claims nothing: the
    // reward stays unclaimed in the ledger and progression continues anyway.
    const actDelta = meta?.skipped
      ? { granted: false, xp: 0, coins: 0 }
      : claimActivityReward(campaign!, chapter!, activity);
    if (actDelta.granted) {
      let xpGrant = actDelta.xp;
      let coinGrant = actDelta.coins;
      if (rewardScale === "half") {
        xpGrant   = Math.max(0, Math.floor(actDelta.xp * 0.5));
        coinGrant = Math.max(0, Math.floor(actDelta.coins * 0.5));
      } else if (rewardScale === "min") {
        xpGrant   = actDelta.xp > 0 ? Math.max(1, Math.floor(actDelta.xp * 0.1)) : 0;
        coinGrant = 0;
      }
      if (xpGrant > 0)    addPoints(xpGrant);
      if (coinGrant > 0)  addDinars(coinGrant);
      // Canonical grant ledger — must mirror exactly what was applied to profile.
      recordCampaignGrant(campaign!.id, { xp: xpGrant, coins: coinGrant, chapterId: chapter!.id });
      audioManager.playSfx("success", { dedupeKey: `act:${activity.id}` });
    }

    // A skip needs no acknowledgement tap: leaving it out of `pendingAck`
    // means the derived current step moves to the next activity as soon as
    // the completion is recorded below. Queuing an ack here is exactly what
    // made the skip button appear dead.
    if (!meta?.skipped) {
      setPendingAck(prev => ({ ...prev, [activity.id]: "correct" }));
    }

    const wasChapterComplete  = chProgress?.completed ?? false;
    const wasCampaignComplete = camProgress?.completed ?? false;
    const nextProgress = recordActivity(campaign!, chapter!, activity, true);

    const nextChapter   = nextProgress.chapters[chapter!.id];
    const newlyChapter  = !wasChapterComplete  && Boolean(nextChapter?.completed);
    const newlyCampaign = !wasCampaignComplete && nextProgress.completed;

    // Chapter completion rewards — claimed once via ledger.
    if (newlyChapter) {
      audioManager.playSfx("chapter-complete", { dedupeKey: `ch:${chapter!.id}` });
      // Qualifying streak activity: completing a campaign chapter.
      void recordStreakActivity("campaign_chapter", chapter!.id);
      // Memory Engine — chapter is over, drop the runtime plan so a
      // re-entry (or the next chapter) starts from a clean slate.
      if (plan) clearPlan(plan.planKey);
      const chDelta = claimChapterReward(campaign!, chapter!);
      if (chDelta.granted) {
        if (chDelta.xp > 0)    addPoints(chDelta.xp);
        if (chDelta.coins > 0) addDinars(chDelta.coins);
        const items = unlockIdsToCollectionItems(campaign!.id, chapter!.id, chDelta.unlocks);
        if (items.length) enqueueCollectionSync(items);
        recordCampaignGrant(campaign!.id, {
          xp: chDelta.xp, coins: chDelta.coins, unlocks: chDelta.unlocks, chapterId: chapter!.id,
        });
      }
    }

    // Campaign completion rewards — claimed once via ledger.
    if (newlyCampaign) {
      audioManager.playSfx("campaign-complete", { dedupeKey: `cam:${campaign!.id}` });
      const camDelta = claimCampaignReward(campaign!);
      if (camDelta.granted) {
        if (camDelta.xp > 0)    addPoints(camDelta.xp);
        if (camDelta.coins > 0) addDinars(camDelta.coins);
        const items = unlockIdsToCollectionItems(campaign!.id, null, camDelta.unlocks);
        if (items.length) enqueueCollectionSync(items);
        recordCampaignGrant(campaign!.id, {
          xp: camDelta.xp, coins: camDelta.coins, unlocks: camDelta.unlocks,
        });
      }
      // Surface unlock SFX (best-effort).
      (nextProgress.unlockedRegistryIds ?? []).slice(0, 1).forEach((rid) =>
        audioManager.playSfx("unlock-reward", { dedupeKey: `unlock:${rid}` }),
      );
      // Campaign is finished — drop the active-position pointer for this id
      // so the next reopen lands on the overview, not the final activity.
      clearActivePositionIf(campaign!.id);
    } else {
      // Update active position to the just-completed activity (resume here).
      setActivePosition({ campaignId: campaign!.id, chapterId: chapter!.id, activityId: activity.id });
    }

    // Server-authoritative chapter sync (offline-safe, awaited when online).
    // Final chapters MUST send completed=true to record_campaign_progress_v2;
    // the RPC owns the campaign-complete decision and sticky ledger update.
    const nextCh = nextProgress.chapters[chapter!.id];
    const chapterPayload = {
      campaignId: campaign!.id,
      chapterId: chapter!.id,
      status: nextCh?.completed ? "completed" : "unlocked",
      score: nextCh?.completedActivityIds.length ?? 0,
      xpEarned: nextCh?.xpEarned ?? 0,
      coinsEarned: nextCh?.coinsEarned ?? 0,
      completed: nextCh?.completed ?? false,
    } as const;
    recordTrace(
      "campaign-persistence",
      newlyCampaign ? "final-chapter-rpc-before" : "chapter-rpc-before",
      JSON.stringify({
        campaignId: chapterPayload.campaignId,
        chapterId: chapterPayload.chapterId,
        completed: chapterPayload.completed,
        score: chapterPayload.score,
        xpEarned: chapterPayload.xpEarned,
        coinsEarned: chapterPayload.coinsEarned,
        localOptimisticWriteResult: {
          chapterCompleted: !!nextCh?.completed,
          campaignCompleted: !!nextProgress.completed,
          completedActivityCount: nextCh?.completedActivityIds.length ?? 0,
        },
      }),
    );
    const ack = await upsertChapterProgress(chapterPayload);
    recordTrace(
      "campaign-persistence",
      newlyCampaign ? "final-chapter-rpc-after" : "chapter-rpc-after",
      JSON.stringify({
        campaignId: chapterPayload.campaignId,
        chapterId: chapterPayload.chapterId,
        operationId: ack.operationId ?? `chapter_progress:${chapterPayload.campaignId}:${chapterPayload.chapterId}`,
        completed: chapterPayload.completed,
        score: chapterPayload.score,
        xpEarned: chapterPayload.xpEarned,
        coinsEarned: chapterPayload.coinsEarned,
        localMirrorUpdateResult: "localStorage-updated-before-rpc",
        acknowledged: ack.acknowledged,
        normalizedError: ack.reason ?? "none",
        rpcResponse: ack.rpc ?? null,
        finalConfirmation: newlyCampaign ? {
          chapterCompleted: ack.rpc?.chapter_completed ?? null,
          chapterCompletedAt: ack.rpc?.chapter_completed_at ?? null,
          campaignCompleted: ack.rpc?.campaign_completed ?? null,
          campaignCompletionUpdated: ack.rpc?.campaign_completion_updated ?? null,
          campaignCompletionCompletedAt: ack.rpc?.campaign_completion_completed_at ?? null,
          campaignVersion: ack.rpc?.campaign_version ?? null,
        } : null,
      }),
    );

    if (newlyCampaign) {
      setTimeout(() => setCompletionOpen(true), 350);
    }
    bump();
  };

  // PR2: only advances after a correct answer (or on activities without validation).
  const acknowledgeAndAdvance = () => {
    if (!activity || currentAck !== "correct") return;
    setPendingAck(prev => {
      const next = { ...prev };
      delete next[activity.id];
      return next;
    });
    bump();
  };

  // ---- Memory Engine — review-done handler ----
  // Runs when the player finishes (or skips) the injected review card.
  // Never touches campaign progress, hearts, dinars, or unlocks.
  const onReviewDone = (outcome: { correct: boolean | null; skipped: boolean }) => {
    if (!reviewMarker || !plan) return;
    const now = Date.now();
    const live = findItem(reviewMarker.reviewItemId);
    // Skip: no history mutation, no XP, but still cap the daily slot so a
    // player can't cycle through chapters to force new reviews.
    if (outcome.skipped || outcome.correct == null) {
      bumpDaily(now);
      markReviewCompleted(reviewMarker.planKey, false);
      bump();
      return;
    }
    if (live) {
      const prev = getEntry(live.id) ?? {
        itemId: live.id, correctStreak: 0,
        lastAttemptCorrect: null, lastAttemptAt: null,
        nextDueAt: null, seen: 0,
      };
      const nextEntry = outcome.correct
        ? nextAfterCorrect(prev, now)
        : nextAfterWrong(prev, now);
      upsertEntry(nextEntry);
      if (outcome.correct && plan.reviewAttemptId) {
        grantReviewXp(plan.reviewAttemptId, live.originalXp, (xp) => addPoints(xp));
      }
    }
    bumpDaily(now);
    markReviewCompleted(reviewMarker.planKey, outcome.correct === true);
    audioManager.playSfx(outcome.correct ? "success" : "unlock-reward", {
      dedupeKey: `review:${reviewMarker.runtimeId}`,
    });
    bump();
  };

  return (
    <AppShell>
      <ReadingScale className="animate-reveal pb-10">

        {/* HEADER */}
        <div className="sticky top-0 z-10 border-b border-gold/20 bg-[#0a0f1e]/95 px-3 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
            <Link
              to="/campaigns/imported/$id"
              params={{ id: campaign.id }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowRight className="size-3.5" /> {campaign.title}
            </Link>
            <span className="text-[10px] text-muted-foreground">
              {camProgress?.completed ? "حملة مكتملة" : "حملة تاريخية"}
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-5 pt-4">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
            <Scroll className="size-3.5" /> {reviewMode ? "مراجعة الفصل" : "فصل من الحملة"}
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold shimmer-text">{chapter.title}</h1>
          {chapter.subtitle && <p className="mt-1 text-sm text-gold/80">{chapter.subtitle}</p>}

          {chapter.introText && (
            <div className="mt-4">
              <RichReadingText text={chapter.introText} size="base" />
            </div>
          )}

          {chapter.historicalReadingText && (
            <div className="parchment-dark mt-4 rounded-2xl border border-gold/25 p-5">
              <div className="mb-3 flex items-center gap-1 text-[10px] tracking-widest text-gold/80">
                <BookOpen className="size-3" /> قراءة تاريخية
              </div>
              <RichReadingText text={chapter.historicalReadingText} size="lg" />
            </div>
          )}

          {/* Chapter reward preview — hidden in review mode (already earned). */}
          {!reviewMode && chapter.rewards && (chapter.rewards.xp || chapter.rewards.coins || chapter.rewards.unlocks?.length) && (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap gap-2 text-[11px]">
                {chapter.rewards.xp ? <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">+{chapter.rewards.xp} XP</span> : null}
                {chapter.rewards.coins ? <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">+{chapter.rewards.coins} دينار</span> : null}
              </div>
              {(chapter.rewards.unlocks?.length ?? 0) > 0 && (
                <UnlockList ids={chapter.rewards.unlocks ?? []} locked={!chProgress?.completed} lockedHint={`أكمل فصل «${chapter.title}» لفتح هذه الجائزة.`} />
              )}
            </div>
          )}

          {/* Activities */}
          <div className="mt-6">
            {chapter.activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-6 text-center text-sm text-muted-foreground">
                لا توجد أنشطة في هذا الفصل بعد.
              </div>
            ) : reviewMode ? (
              <ReviewChapterView campaign={campaign} chapter={chapter} />
            ) : allDone ? (() => {
              // Canonical chapter totals: exact XP/dinars/unlocks the
              // player received while completing this chapter (activity
              // grants after wrong-answer scaling + chapter bonus). Falls
              // back to authored figures for pre-Phase 8 completions.
              const chTotals = getChapterGrantedTotals(campaign.id, chapter.id, {
                xpEarned: chProgress?.xpEarned ?? 0,
                coinsEarned: chProgress?.coinsEarned ?? 0,
              });
              return (
                <ChapterCompletePanel
                  campaignId={campaign.id}
                  campaignTitle={campaign.title}
                  chapterId={chapter.id}
                  chapterTitle={chapter.title}
                  xpEarned={chTotals.xp}
                  coinsEarned={chTotals.coins}
                  heartsLost={chProgress?.heartsLost ?? 0}
                  nextChapter={nextChapterAfter(campaign, chapter)}
                />
              );
            })() : (
              <div>
                <ProgressBar
                  done={chProgress?.completedActivityIds.length ?? 0}
                  total={chapter.activities.length}
                />

                {heartsDepleted && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
                    <Heart className="size-3.5" />
                    <span className="flex-1">نفدت قلوبك — لا يمكنك بدء نشاط جديد الآن.</span>
                    <button
                      onClick={() => setOutOfHeartsOpen(true)}
                      className="rounded-md border border-rose-400/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold"
                    >
                      التفاصيل
                    </button>
                  </div>
                )}

                <div
                  key={runtimeStep ? (activityIsReview ? reviewMarker!.runtimeId : (activity?.id ?? "none")) : "none"}
                  className={`motion-page mt-4 rounded-3xl border border-gold/30 bg-[#0f1a36]/60 p-5 ${heartsDepleted ? "pointer-events-none opacity-60" : ""}`}
                >
                  {activityIsReview && reviewMarker ? (() => {
                    const liveItem = findItem(reviewMarker.reviewItemId);
                    if (!liveItem) {
                      // Item vanished between plan creation and render — resolve
                      // the plan so the runtime list rebuilds without it.
                      onReviewDone({ correct: null, skipped: true });
                      return null;
                    }
                    return (
                      <ReviewActivity
                        key={reviewMarker.runtimeId}
                        item={liveItem}
                        onDone={onReviewDone}
                      />
                    );
                  })() : activity ? (
                    <ActivityRenderer
                      key={`${activity.id}:${wrongAttempts}`}
                      activity={activity}
                      onResolve={onResolve}
                      onAdvance={acknowledgeAndAdvance}
                      alreadyDone={chProgress?.completedActivityIds.includes(activity.id) && currentAck !== "correct"}
                      campaignId={campaign.id}
                    />
                  ) : null}
                </div>

                {/* PR2: wrong-answer banner — no Next button, must retry. */}
                {!activityIsReview && currentAck !== "correct" && wrongAttempts === 1 && !heartsDepleted && (
                  <div className="motion-toast mt-3 flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
                    <XIcon className="size-3.5" />
                    <span className="flex-1">إجابة غير صحيحة. خسرتَ قلبًا — حاول مرة أخرى.</span>
                  </div>
                )}

                {/* Advance only after a correct answer.
                    Reflection prompts own their single button (save → next),
                    so the parent never renders a second "التالي" for them. */}
                {!activityIsReview && currentAck === "correct" && activity?.type !== "reflection_prompt" && (
                  <button
                    onClick={acknowledgeAndAdvance}
                    className="motion-tap motion-reveal is-in mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
                  >
                    <Check className="size-4" /> التالي
                    <ArrowLeft className="size-4" />
                  </button>
                )}


                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  النشاط {((chProgress?.completedActivityIds.length ?? 0) + 1).toLocaleString("en-US")} من {chapter.activities.length.toLocaleString("en-US")}
                </p>
              </div>
            )}
          </div>
        </div>
      </ReadingScale>


      <OutOfHeartsModal open={outOfHeartsOpen} onClose={() => setOutOfHeartsOpen(false)} />

      {camProgress && (() => {
        const summary = computeCampaignRewardSummary(campaign, { isCampaignCompleted: true });
        return (
          <CampaignCompleteModal
            open={completionOpen}
            onClose={() => setCompletionOpen(false)}
            campaignId={campaign.id}
            campaignTitle={campaign.title}
            xp={summary.earnedXp}
            coins={summary.earnedDinars}
            unlockIds={summary.unlocks}
            legacyRewardsUnavailable={!summary.hasCanonicalLedger}
          />
        );
      })()}
    </AppShell>
  );
}

function nextChapterAfter(campaign: Campaign, current: CampaignChapter): CampaignChapter | null {
  const sorted = [...campaign.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = sorted.findIndex(c => c.id === current.id);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">{done}/{total}</p>
    </div>
  );
}

function ChapterCompletePanel(props: {
  campaignId: string;
  campaignTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  xpEarned: number; coinsEarned: number; heartsLost: number;
  nextChapter: CampaignChapter | null;
}) {
  return (
    <div className="motion-page motion-unlock-glow rounded-3xl border border-gold/40 bg-gradient-to-b from-amber-900/40 via-surface to-stone-900/60 p-6 text-center shadow-elegant">
      <Sparkles className="mx-auto size-7 text-gold" />
      <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذا الفصل</p>
      <Stagger className="mt-3 flex items-center justify-center gap-3 text-[12px]">
        <span className="motion-reveal is-in inline-flex items-center gap-1 text-sky-300">
          <Zap className="size-3.5" />+<AnimatedNumber value={props.xpEarned} />
        </span>
        <span className="motion-reveal is-in inline-flex items-center gap-1 text-amber-300">
          <Coins className="size-3.5" />+<AnimatedNumber value={props.coinsEarned} />
        </span>
        {props.heartsLost > 0 && (
          <span className="motion-reveal is-in inline-flex items-center gap-1 text-red-300">
            <Heart className="size-3.5" />-<AnimatedNumber value={props.heartsLost} />
          </span>
        )}
      </Stagger>
      <div className="mt-5 flex flex-col items-stretch gap-2">
        {props.nextChapter ? (
          <Link
            to="/campaigns/imported/$id/chapter/$chapter"
            params={{ id: props.campaignId, chapter: props.nextChapter.id }}
            className="motion-tap inline-flex items-center justify-center gap-1 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> الفصل التالي
            <ArrowLeft className="size-4" />
          </Link>
        ) : (
          <Link
            to="/campaigns/imported/$id"
            params={{ id: props.campaignId }}
            className="motion-tap inline-flex items-center justify-center gap-1 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> عودة لختام الحملة
          </Link>
        )}
        <Link
          to="/campaigns/imported/$id"
          params={{ id: props.campaignId }}
          className="motion-tap rounded-2xl border border-white/10 py-2 text-xs text-muted-foreground"
        >
          عودة لقائمة الفصول
        </Link>
      </div>
      <FeedbackCTA
        className="mt-6"
        context={{
          campaign_id: props.campaignId,
          title: props.chapterTitle
            ? `${props.campaignTitle ?? "الحملة"} · ${props.chapterTitle}`
            : (props.campaignTitle ?? "فصل الحملة"),
          ...(props.chapterId ? { chapter_id: props.chapterId } : {}),
        }}
      />
    </div>
  );
}

// ---------- Review Mode (completed campaign) ----------
// Stacks every activity in a read-only "answer key" form so the
// player can browse the chapter again without earning rewards or
// mutating progress.
function ReviewChapterView({
  campaign,
  chapter,
}: {
  campaign: Campaign;
  chapter: CampaignChapter;
}) {
  const next = nextChapterAfter(campaign, chapter);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-[12px] text-emerald-100">
        <Check className="me-1 inline size-3.5" />
        أنهيتَ هذه الحملة — أنت الآن في وضع المراجعة. تصفّح المحتوى دون أثر على تقدمك.
      </div>

      {chapter.activities.map((act) => (
        <ActivityReviewCard key={act.id} activity={act} />
      ))}

      <div className="flex flex-col gap-2 pt-2">
        {next && (
          <Link
            to="/campaigns/imported/$id/chapter/$chapter"
            params={{ id: campaign.id, chapter: next.id }}
            className="motion-tap inline-flex items-center justify-center gap-1 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> الفصل التالي
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <Link
          to="/campaigns/imported/$id"
          params={{ id: campaign.id }}
          className="motion-tap rounded-2xl border border-white/10 py-2 text-center text-xs text-muted-foreground"
        >
          عودة لقائمة الفصول
        </Link>
      </div>
    </div>
  );
}
