// ============================================================
// /campaigns/imported/$id — Imported campaign overview
// ------------------------------------------------------------
// Mirrors the visual identity of the existing engine campaign
// overview (cinematic gold/parchment) but drives off the
// admin-imported Campaign shape (chapters[].activities[]).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams, useSearch, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Lock, Check, Crown, Trophy, Scroll, BookOpen, Sparkles,
  Clock, Tag, Coins, Zap, Gift, Package, Play, ChevronLeft,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { fetchCampaignByIdOrSlug, onCampaignPublished } from "@/lib/supabaseCampaigns";
import { CampaignArtwork, hasCampaignKeyArt } from "@/lib/campaignArtwork";

import {
  getCampaignProgress, isChapterUnlocked, campaignCompletionPercent,
} from "@/lib/importedCampaignProgress";
import { getActivePosition } from "@/lib/campaignLedger";
import { computeCampaignRewardSummary } from "@/lib/campaigns/rewardSummary";
import { UnlockList } from "@/components/imported-campaign/UnlockList";
import { displayBadgeName, displayArtifactName } from "@/lib/display-names";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";
import { Stagger, AnimatedNumber } from "@/components/motion/MotionPrimitives";

export const Route = createFileRoute("/campaigns/imported/$id/")({
  head: () => ({ meta: [{ title: "حملة تاريخية — إرث" }] }),
  validateSearch: (s: Record<string, unknown>): { preview?: "draft" } =>
    s.preview === "draft" ? { preview: "draft" } : {},
  component: ImportedCampaignOverview,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <p className="text-muted-foreground">الحملة غير موجودة.</p>
        <Link to="/campaigns" className="mt-4 inline-block text-gold">عودة للحملات</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل الحملة.</div></AppShell>
  ),
});

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "سهلة", medium: "متوسطة", hard: "صعبة", legendary: "أسطورية",
};

function ImportedCampaignOverview() {
  const { id } = useParams({ from: "/campaigns/imported/$id/" });
  const search = useSearch({ from: "/campaigns/imported/$id/" });
  const mode: "published" | "draft" = search.preview === "draft" ? "draft" : "published";
  const queryClient = useQueryClient();
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id, mode],
    queryFn: () => fetchCampaignByIdOrSlug(id, { mode }),
  });

  // Auto-refresh on admin publish (same tab or via BroadcastChannel).
  useEffect(() => {
    const off = onCampaignPublished((changedId) => {
      if (changedId === id || changedId === campaign?.slug) {
        queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      }
    });
    return off;
  }, [id, campaign?.slug, queryClient]);



  // Progress tick — re-read from localStorage when window regains focus.
  const [tick, setTick] = useState(0);
  const disableGlobalFocusBlur = isAndroidFocusABDisabled("disableGlobalFocusBlur");
  useEffect(() => {
    const onFocus = () => setTick(t => t + 1);
    if (!disableGlobalFocusBlur) window.addEventListener("focus", onFocus);
    return () => { if (!disableGlobalFocusBlur) window.removeEventListener("focus", onFocus); };
  }, [disableGlobalFocusBlur]);

  const progress = useMemo(
    () => campaign ? getCampaignProgress(campaign.id) : null,
    [campaign, tick],
  );
  const percent = campaign ? campaignCompletionPercent(campaign) : 0;

  if (isLoading) {
    return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">جاري التحميل…</div></AppShell>;
  }
  if (!campaign) throw notFound();

  const chapters = [...campaign.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedCount = progress
    ? chapters.filter(ch => progress.chapters[ch.id]?.completed).length
    : 0;
  const currentChapterId = chapters.find(
    ch => !progress?.chapters[ch.id]?.completed && isChapterUnlocked(campaign, ch),
  )?.id;
  const finalRewards = campaign.finalRewards;
  const hasStarted = completedCount > 0 || Boolean(progress && Object.keys(progress.chapters).length);

  return (
    <AppShell>
      <div className="animate-reveal pb-10">
        {/* HERO */}
        <div className="px-3 pt-3">
          <Link to="/campaigns" className="mb-3 flex items-center gap-1 px-2 text-xs text-muted-foreground">
            <ArrowRight className="size-3.5" /> الحملات
          </Link>
          <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/60 p-6 shadow-elegant">
            {/* Key Art cinematic header — canonical resolver only. Campaigns
                without Key Art keep the exact gradient treatment below. */}
            <CampaignArtwork
              campaign={campaign}
              surface="campaign-detail"
              alt={campaign.title}
              fallback={null}
              className="absolute inset-0"
              imgClassName="h-full w-full object-cover"
              loading="eager"
            />
            {hasCampaignKeyArt(campaign) && (
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--surface))] via-[hsl(var(--surface)/0.72)] to-[hsl(var(--surface)/0.28)]" />

            )}
            <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative">

              <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold">
                <Crown className="size-3.5" />
                {campaign.historicalPeriod ?? "حملة تاريخية"}
                {campaign.difficulty && <>· {DIFFICULTY_LABEL[campaign.difficulty]}</>}
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold leading-snug shimmer-text">
                {campaign.title}
              </h1>
              {campaign.subtitle && (
                <p className="mt-1 text-sm text-gold/80">{campaign.subtitle}</p>
              )}
              {campaign.description && (
                <p className="mt-3 text-[12px] leading-relaxed text-foreground/90">
                  {campaign.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                {campaign.estimatedDuration && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Clock className="size-3" /> {campaign.estimatedDuration}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                  <Scroll className="size-3" /> {chapters.length.toLocaleString("en-US")} فصول
                </span>
                {campaign.tags?.slice(0, 3).map(t => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Tag className="size-3" /> {t}
                  </span>
                ))}
              </div>
              {/* Progress block — explicit hierarchy */}
              <div className="mt-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] text-gold/80">تقدّمك</p>
                    <p className="font-display mt-0.5 text-sm font-bold text-white">
                      <span className="text-gold">{completedCount.toLocaleString("en-US")}</span>
                      <span className="text-white/50"> / {chapters.length.toLocaleString("en-US")} فصل</span>
                    </p>
                  </div>
                  <p className="font-display text-2xl font-extrabold text-gold leading-none"><AnimatedNumber value={percent} /><span className="text-sm">٪</span></p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-gold transition-all duration-700" style={{ width: `${percent}%` }} />
                </div>
              </div>
              {/* Resume / Start CTA */}
              {(() => {
                const active = getActivePosition();
                const resumeChId = active?.campaignId === campaign.id
                  ? active.chapterId
                  : currentChapterId;
                if (!resumeChId || progress?.completed) return null;
                return (
                  <Link
                    to="/campaigns/imported/$id/chapter/$chapter"
                    params={{ id: campaign.id, chapter: resumeChId }}
                    className="motion-tap mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-gold px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
                  >
                    <Play className="size-4 fill-current" />
                    {hasStarted ? "متابعة" : "ابدأ الرحلة"}
                  </Link>
                );
              })()}
            </div>
          </div>
        </div>


        <div className="px-5">
          {/* REWARDS PREVIEW (final) — unlock IDs resolved to Arabic titles. */}
          {finalRewards && (finalRewards.xp || finalRewards.coins || finalRewards.unlocks?.length || finalRewards.badgeId || finalRewards.artifactId) && (
            <div className="mt-6 rounded-3xl border border-gold/25 bg-gradient-to-br from-amber-900/20 via-surface to-stone-900/20 p-5">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-gold" />
                <p className="font-display text-sm font-bold text-gold">جوائز ختام الحملة</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {finalRewards.xp ? <RewardPill icon={<Zap className="size-3" />} label={`+${finalRewards.xp} خبرة`} /> : null}
                {finalRewards.coins ? <RewardPill icon={<Coins className="size-3" />} label={`+${finalRewards.coins} دينار`} /> : null}
                {finalRewards.badgeId ? <RewardPill icon={<Trophy className="size-3" />} label={displayBadgeName(finalRewards.badgeId)} /> : null}
                {finalRewards.artifactId ? <RewardPill icon={<Gift className="size-3" />} label={displayArtifactName(finalRewards.artifactId)} /> : null}
              </div>
              {(finalRewards.unlocks?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <UnlockList ids={finalRewards.unlocks ?? []} variant="card" locked={!progress?.completed} lockedHint={`أكمل حملة «${campaign.title}» لفتح هذه الجائزة.`} />
                </div>
              )}
            </div>
          )}

          {/* CHAPTERS */}
          <div className="mt-10 flex items-center gap-3">
            <Scroll className="size-4 text-gold" />
            <h3 className="font-display text-base font-bold">فصول الرحلة</h3>
            <span className="ms-auto text-[11px] text-muted-foreground">
              {completedCount}/{chapters.length}
            </span>
          </div>
          <div className="gold-divider mt-2 mb-5" />

          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-6 text-center text-sm text-muted-foreground">
              لا توجد فصول في هذه الحملة بعد.
            </div>
          ) : (
            <Stagger className="space-y-4" max={12}>
              {chapters.map((ch, i) => {
                const chProgress = progress?.chapters[ch.id];
                const done = Boolean(chProgress?.completed);
                const unlocked = isChapterUnlocked(campaign, ch);
                const isCurrent = ch.id === currentChapterId;
                const xp = ch.rewards?.xp ?? 0;
                const coins = ch.rewards?.coins ?? 0;
                const unlocksCount = ch.rewards?.unlocks?.length ?? 0;
                return (
                  <div key={ch.id} className="animate-reveal">
                    <div className="flex items-start gap-3">
                      <div className={`grid size-9 shrink-0 place-items-center rounded-full border transition ${
                        done ? "border-gold/60 bg-gradient-gold text-primary-foreground"
                        : isCurrent ? "border-gold bg-gold/20 text-gold shadow-[0_0_18px_-2px_oklch(0.78_0.13_85/0.55)] ring-2 ring-gold/40"
                        : unlocked ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-white/10 bg-black/30 text-muted-foreground"
                      }`}>
                        {done ? <Check className="size-4" /> : <span className="text-sm font-bold">{(i + 1).toLocaleString("en-US")}</span>}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] tracking-widest text-gold/70">
                            الفصل {(i + 1).toLocaleString("en-US")}
                          </p>
                          {isCurrent && (
                            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[9px] font-bold text-gold ring-1 ring-gold/40">
                              الحالي
                            </span>
                          )}
                          {done && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                              مكتمل
                            </span>
                          )}
                        </div>
                        <h4 className={`font-display text-base font-bold ${!unlocked ? "text-muted-foreground" : ""} ${done ? "opacity-80" : ""}`}>
                          {ch.title}
                        </h4>
                        {ch.subtitle && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{ch.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="mr-[44px] mt-2">
                      {!unlocked ? (
                        <div className="rounded-2xl border border-white/10 bg-surface/40 p-4 text-center">
                          <Lock className="mx-auto size-4 text-muted-foreground" />
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            يُفتح هذا الفصل عند إتمام ما قبله.
                          </p>
                        </div>
                      ) : (
                        <Link
                          to="/campaigns/imported/$id/chapter/$chapter"
                          params={{ id: campaign.id, chapter: ch.id }}
                          className={`parchment-dark group relative block overflow-hidden rounded-2xl border p-4 transition ${
                            isCurrent
                              ? "border-gold/70 shadow-[0_0_24px_-6px_oklch(0.78_0.13_85/0.5)] hover:border-gold"
                              : "border-gold/25 hover:border-gold/55"
                          } ${done ? "opacity-90" : ""}`}
                        >
                          {ch.introText && (
                            <p className="line-clamp-2 text-[12px] leading-relaxed text-foreground/85">
                              {ch.introText}
                            </p>
                          )}
                          {/* Reward chips */}
                          {(xp > 0 || coins > 0 || unlocksCount > 0) && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                              {xp > 0 && <RewardChip icon={<Zap className="size-3" />} label={`+${xp}`} />}
                              {coins > 0 && <RewardChip icon={<Coins className="size-3" />} label={`+${coins}`} />}
                              {unlocksCount > 0 && <RewardChip icon={<Package className="size-3" />} label={`${unlocksCount} مكافأة`} />}
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[11px]">
                            <span className="inline-flex items-center gap-1.5 font-bold text-gold">
                              {done ? <BookOpen className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
                              {done ? "أعد القراءة" : isCurrent ? "تابع الفصل" : "ابدأ الفصل"}
                            </span>
                            <span className="text-muted-foreground">
                              {ch.activities.length.toLocaleString("en-US")} نشاط
                            </span>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </Stagger>
          )}

          {/* COMPLETION STATE — premium */}
          {chapters.length > 0 && progress?.completed && (() => {
            const summary = computeCampaignRewardSummary(campaign, { isCampaignCompleted: true });
            return (
            <div className="mt-10 relative overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-br from-amber-900/30 via-surface to-stone-900/40 p-6 shadow-elegant">
              <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/25 blur-3xl" />
              <div className="relative text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-gold">
                  <Trophy className="size-6" />
                </div>
                <p className="mt-3 text-[10px] tracking-[0.3em] text-gold/80">إنجاز مكتمل</p>
                <p className="font-display mt-1 text-xl font-bold text-gold shimmer-text">أتممتَ هذه الحملة</p>
                {summary.hasCanonicalLedger ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                    <RewardPill icon={<Zap className="size-3" />} label={`+${summary.earnedXp.toLocaleString("en-US")} خبرة`} />
                    <RewardPill icon={<Coins className="size-3" />} label={`+${summary.earnedDinars.toLocaleString("en-US")} دينار`} />
                    {summary.unlocks.length > 0 && (
                      <RewardPill icon={<Package className="size-3" />} label={`${summary.unlocks.length} عنصر مكتشف`} />
                    )}
                  </div>
                ) : (
                  <div className="mt-4 mx-auto max-w-sm rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                    <p className="text-sm font-bold text-gold">بيانات المكافآت غير متوفرة</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                      هذه الحملة أُنجزت قبل اعتماد نظام سجل المكافآت الحالي، لذلك لا يمكن عرض تفاصيل المكافآت المكتسبة بدقة.
                    </p>
                  </div>
                )}
                {/* Cross-module navigation */}
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <Link to="/collection" className="group flex flex-col items-center gap-1 rounded-2xl border border-gold/30 bg-black/30 p-3 transition hover:border-gold/60">
                    <Package className="size-4 text-gold" />
                    <span className="text-[10px] text-white/80">المتحف</span>
                  </Link>
                  <Link to="/encyclopedia" className="group flex flex-col items-center gap-1 rounded-2xl border border-gold/30 bg-black/30 p-3 transition hover:border-gold/60">
                    <BookOpen className="size-4 text-gold" />
                    <span className="text-[10px] text-white/80">الموسوعة</span>
                  </Link>
                  <Link to="/campaigns" className="group flex flex-col items-center gap-1 rounded-2xl border border-gold/30 bg-black/30 p-3 transition hover:border-gold/60">
                    <Crown className="size-4 text-gold" />
                    <span className="text-[10px] text-white/80">حملة تالية</span>
                  </Link>
                </div>
                <Link
                  to="/campaigns"
                  className="mt-4 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-gold hover:text-gold/80"
                >
                  استكشف رحلات تاريخية جديدة <ChevronLeft className="size-3" />
                </Link>
              </div>
            </div>
            );
          })()}
        </div>
        <FeedbackCTA context={{ campaign_id: id, title: "الحملة" }} />

      </div>
    </AppShell>
  );
}


function RewardPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-gold">
      {icon} {label}
    </span>
  );
}

function RewardChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gold/25 bg-black/30 px-1.5 py-0.5 text-gold/90">
      {icon} {label}
    </span>
  );
}
