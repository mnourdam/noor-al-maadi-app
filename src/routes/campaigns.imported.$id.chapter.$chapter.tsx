// ============================================================
// /campaigns/imported/$id/chapter/$chapter — Imported chapter player
// ------------------------------------------------------------
// Walks the user through one chapter's activities, awarding
// XP/coins/hearts via importedCampaignProgress. Hearts are
// enforced (blocks new activities at 0), advancement waits for
// an explicit "next" tap so feedback is readable, and a
// completion modal lists rewards with resolved Arabic titles.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { Zap, Coins, Sparkles, BookOpen, Scroll, ArrowRight, ArrowLeft, Check, Heart } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Campaign, CampaignChapter } from "@/types/campaign";
import { ACTIVITY_DEFAULTS } from "@/types/campaign";
import { getCampaign, listCampaigns } from "@/lib/campaignStorage";
import { pullCampaignsFromCloud } from "@/lib/cloudSync";
import {
  getChapterProgress, getCampaignProgress, recordActivity, markActivityComplete,
} from "@/lib/importedCampaignProgress";
import { ActivityRenderer } from "@/components/imported-campaign/ActivityRenderer";
import { OutOfHeartsModal } from "@/components/imported-campaign/OutOfHeartsModal";
import { CampaignCompleteModal } from "@/components/imported-campaign/CampaignCompleteModal";
import { UnlockList } from "@/components/imported-campaign/UnlockList";
import { useProfile } from "@/lib/profile";
import { getEffectiveHearts } from "@/lib/hearts";
import { audioManager } from "@/lib/audioManager";
import { upsertChapterProgress, addCollectionItems } from "@/lib/progressSync";
import { parseUnlockId } from "@/lib/campaignUnlocks";

export const Route = createFileRoute("/campaigns/imported/$id/chapter/$chapter")({
  head: () => ({ meta: [{ title: "فصل من حملة — إرث" }] }),
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
  const [campaign, setCampaign] = useState<Campaign | null>(() => getCampaign(id) ?? null);
  const [loading, setLoading]   = useState(!campaign);

  useEffect(() => {
    if (campaign) return;
    let cancelled = false;
    pullCampaignsFromCloud().then(() => {
      if (cancelled) return;
      const next = listCampaigns().find(c => c.id === id) ?? null;
      setCampaign(next);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [id, campaign]);

  const chapter: CampaignChapter | undefined = useMemo(
    () => campaign?.chapters.find(c => c.id === chapterId),
    [campaign, chapterId],
  );

  const [progressTick, setProgressTick] = useState(0);
  const bump = () => setProgressTick(t => t + 1);

  const { profile, addPoints, addDinars, loseHeart } = useProfile();
  const camProgress = campaign ? getCampaignProgress(campaign.id) : null;
  const chProgress  = campaign ? getChapterProgress(campaign.id, chapterId) : null;

  // Track activities pending acknowledgement before we advance to the next one.
  // Map activityId -> "correct" | "wrong" (latest outcome to display).
  const [pendingAck, setPendingAck] = useState<Record<string, "correct" | "wrong" | undefined>>({});
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

  // Current activity = first activity that is either un-completed
  // OR completed-and-not-yet-acknowledged.
  const currentIdx = useMemo(() => {
    if (!chapter || !chProgress) return 0;
    const idx = chapter.activities.findIndex(a => {
      const done = chProgress.completedActivityIds.includes(a.id);
      const ackPending = pendingAck[a.id] === "correct";
      return !done || ackPending;
    });
    return idx === -1 ? chapter.activities.length - 1 : idx;
  }, [chapter, chProgress, progressTick, pendingAck]);

  if (loading) {
    return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">جاري التحميل…</div></AppShell>;
  }
  if (!campaign || !chapter) throw notFound();

  const activity = chapter.activities[currentIdx];
  const allDone  = chapter.activities.length > 0
    && chapter.activities.every(a => chProgress?.completedActivityIds.includes(a.id))
    && Object.values(pendingAck).every(v => v !== "correct");

  const currentAck = activity ? pendingAck[activity.id] : undefined;

  const onResolve = (correct: boolean) => {
    if (!activity) return;

    // Hard hearts gate — if the user already has 0 hearts, block any answer.
    if (!correct && heartsDepleted) {
      setOutOfHeartsOpen(true);
      return;
    }

    const alreadyCompleted = chProgress?.completedActivityIds.includes(activity.id) ?? false;
    const xp     = activity.xpReward      ?? ACTIVITY_DEFAULTS.xpReward;
    const coins  = activity.coinsReward   ?? ACTIVITY_DEFAULTS.coinsReward;
    const hearts = activity.heartsPenalty ?? ACTIVITY_DEFAULTS.heartsPenalty;

    if (correct && !alreadyCompleted) {
      if (xp > 0) addPoints(xp);
      if (coins > 0) addDinars(coins);
      audioManager.playSfx("success", { dedupeKey: `act:${activity.id}` });
    } else if (!correct) {
      // Single heart per wrong attempt — clamp penalty to 1 to avoid burning all hearts on one mistake.
      const toLose = Math.max(1, Math.min(1, hearts));
      for (let i = 0; i < toLose; i++) loseHeart();
      // If that drained the last heart, surface the modal next tick.
      if (effectiveHearts - toLose <= 0) {
        setTimeout(() => setOutOfHeartsOpen(true), 250);
      }
    }

    setPendingAck(prev => ({ ...prev, [activity.id]: correct ? "correct" : "wrong" }));

    const wasChapterComplete  = chProgress?.completed ?? false;
    const wasCampaignComplete = camProgress?.completed ?? false;
    const nextProgress = recordActivity(campaign!, chapter!, activity, correct);
    const nextChapter   = nextProgress.chapters[chapter!.id];
    const newlyChapter  = !wasChapterComplete  && Boolean(nextChapter?.completed);
    const newlyCampaign = !wasCampaignComplete && nextProgress.completed;

    if (newlyChapter) {
      audioManager.playSfx("chapter-complete", { dedupeKey: `ch:${chapter!.id}` });
    }
    if (newlyCampaign) {
      audioManager.playSfx("campaign-complete", { dedupeKey: `cam:${campaign!.id}` });
      (nextProgress.unlockedRegistryIds ?? []).slice(0, 1).forEach((rid) =>
        audioManager.playSfx("unlock-reward", { dedupeKey: `unlock:${rid}` }),
      );
    }

    // Mirror writes to granular Supabase tables (no-op when signed out).
    const nextCh = nextProgress.chapters[chapter!.id];
    void upsertChapterProgress({
      campaignId: campaign!.id,
      chapterId: chapter!.id,
      status: nextCh?.completed ? "completed" : "unlocked",
      score: nextCh?.completedActivityIds.length ?? 0,
      xpEarned: nextCh?.xpEarned ?? 0,
      coinsEarned: nextCh?.coinsEarned ?? 0,
      completed: nextCh?.completed ?? false,
    });
    if (newlyCampaign && (nextProgress.unlockedRegistryIds?.length ?? 0) > 0) {
      // Normalize unlocks: store bare slug + canonical entity_type only.
      // Skip rows we cannot parse cleanly so we never persist raw colon IDs.
      const seen = new Set<string>();
      const items = nextProgress.unlockedRegistryIds.flatMap((rid) => {
        const parsed = parseUnlockId(rid);
        if (!parsed.slug) return [];
        const itemType = parsed.type ?? "registry";
        if (seen.has(parsed.slug)) return [];
        seen.add(parsed.slug);
        return [{
          itemId: parsed.slug,
          itemType,
          sourceCampaignId: campaign!.id,
          sourceChapterId: chapter!.id,
        }];
      });
      if (items.length) void addCollectionItems(items);
    }

    if (newlyCampaign) {
      setTimeout(() => setCompletionOpen(true), 350);
    }
    bump();
  };

  const acknowledgeAndAdvance = () => {
    if (!activity) return;
    setPendingAck(prev => {
      const next = { ...prev };
      delete next[activity.id];
      return next;
    });
    bump();
  };

  return (
    <AppShell>
      <div className="animate-reveal pb-10">
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
              {camProgress?.completed ? "حملة مكتملة" : "حملة مستوردة"}
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-5 pt-4">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
            <Scroll className="size-3.5" /> فصل من حملة مستوردة
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold shimmer-text">{chapter.title}</h1>
          {chapter.subtitle && <p className="mt-1 text-sm text-gold/80">{chapter.subtitle}</p>}

          {chapter.introText && (
            <p className="mt-4 text-[12px] leading-relaxed text-foreground/90">{chapter.introText}</p>
          )}

          {chapter.historicalReadingText && (
            <div className="parchment-dark mt-4 rounded-2xl border border-gold/25 p-4">
              <div className="mb-2 flex items-center gap-1 text-[10px] tracking-widest text-gold/80">
                <BookOpen className="size-3" /> قراءة تاريخية
              </div>
              <p className="text-[12px] leading-7 text-foreground/90 whitespace-pre-wrap">
                {chapter.historicalReadingText}
              </p>
            </div>
          )}

          {/* Chapter reward preview — unlocks rendered with resolved names. */}
          {chapter.rewards && (chapter.rewards.xp || chapter.rewards.coins || chapter.rewards.unlocks?.length) && (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap gap-2 text-[11px]">
                {chapter.rewards.xp ? <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-sky-200">+{chapter.rewards.xp} XP</span> : null}
                {chapter.rewards.coins ? <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">+{chapter.rewards.coins} دينار</span> : null}
              </div>
              {(chapter.rewards.unlocks?.length ?? 0) > 0 && (
                <UnlockList ids={chapter.rewards.unlocks ?? []} />
              )}
            </div>
          )}

          {/* Activities */}
          <div className="mt-6">
            {chapter.activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-6 text-center text-sm text-muted-foreground">
                لا توجد أنشطة في هذا الفصل بعد.
              </div>
            ) : allDone ? (
              <ChapterCompletePanel
                campaignId={campaign.id}
                xpEarned={chProgress?.xpEarned ?? 0}
                coinsEarned={chProgress?.coinsEarned ?? 0}
                heartsLost={chProgress?.heartsLost ?? 0}
                nextChapter={nextChapterAfter(campaign, chapter)}
              />
            ) : (
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

                <div className={`mt-4 rounded-3xl border border-gold/30 bg-[#0f1a36]/60 p-5 ${heartsDepleted && !currentAck ? "pointer-events-none opacity-60" : ""}`}>
                  {activity ? (
                    <ActivityRenderer
                      key={activity.id + ":" + (currentAck ? "ack" : "live")}
                      activity={activity}
                      onResolve={onResolve}
                      alreadyDone={chProgress?.completedActivityIds.includes(activity.id) && currentAck !== "correct"}
                    />
                  ) : null}
                </div>

                {/* Explicit acknowledgement step — keeps feedback visible until tap. */}
                {currentAck === "correct" && (
                  <button
                    onClick={acknowledgeAndAdvance}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
                  >
                    <Check className="size-4" /> التالي
                    <ArrowLeft className="size-4" />
                  </button>
                )}

                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  النشاط {(currentIdx + 1).toLocaleString("en-US")} من {chapter.activities.length.toLocaleString("en-US")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <OutOfHeartsModal open={outOfHeartsOpen} onClose={() => setOutOfHeartsOpen(false)} />

      {camProgress && (
        <CampaignCompleteModal
          open={completionOpen}
          onClose={() => setCompletionOpen(false)}
          campaignId={campaign.id}
          campaignTitle={campaign.title}
          xp={getCampaignProgress(campaign.id).totalXp}
          coins={getCampaignProgress(campaign.id).totalCoins}
          unlockIds={getCampaignProgress(campaign.id).unlockedRegistryIds}
        />
      )}
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
  xpEarned: number; coinsEarned: number; heartsLost: number;
  nextChapter: CampaignChapter | null;
}) {
  return (
    <div className="rounded-3xl border border-gold/40 bg-gradient-to-b from-amber-900/40 via-surface to-stone-900/60 p-6 text-center shadow-elegant">
      <Sparkles className="mx-auto size-7 text-gold" />
      <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذا الفصل</p>
      <div className="mt-3 flex items-center justify-center gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1 text-sky-300"><Zap className="size-3.5" />+{props.xpEarned}</span>
        <span className="inline-flex items-center gap-1 text-amber-300"><Coins className="size-3.5" />+{props.coinsEarned}</span>
        {props.heartsLost > 0 && (
          <span className="inline-flex items-center gap-1 text-red-300"><Heart className="size-3.5" />-{props.heartsLost}</span>
        )}
      </div>
      <div className="mt-5 flex flex-col items-stretch gap-2">
        {props.nextChapter ? (
          <Link
            to="/campaigns/imported/$id/chapter/$chapter"
            params={{ id: props.campaignId, chapter: props.nextChapter.id }}
            className="inline-flex items-center justify-center gap-1 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> الفصل التالي
            <ArrowLeft className="size-4" />
          </Link>
        ) : (
          <Link
            to="/campaigns/imported/$id"
            params={{ id: props.campaignId }}
            className="inline-flex items-center justify-center gap-1 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> عودة لختام الحملة
          </Link>
        )}
        <Link
          to="/campaigns/imported/$id"
          params={{ id: props.campaignId }}
          className="rounded-2xl border border-white/10 py-2 text-xs text-muted-foreground"
        >
          عودة لقائمة الفصول
        </Link>
      </div>
    </div>
  );
}
