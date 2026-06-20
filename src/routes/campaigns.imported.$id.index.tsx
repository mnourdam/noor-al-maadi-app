// ============================================================
// /campaigns/imported/$id — Imported campaign overview
// ------------------------------------------------------------
// Mirrors the visual identity of the existing engine campaign
// overview (cinematic gold/parchment) but drives off the
// admin-imported Campaign shape (chapters[].activities[]).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import {
  ArrowRight, Lock, Check, Crown, Trophy, Scroll, BookOpen, Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { Campaign } from "@/types/campaign";
import { getCampaign, listCampaigns } from "@/lib/campaignStorage";
import { pullCampaignsFromCloud } from "@/lib/cloudSync";
import {
  getCampaignProgress, isChapterUnlocked, campaignCompletionPercent,
} from "@/lib/importedCampaignProgress";

export const Route = createFileRoute("/campaigns/imported/$id/")({
  head: () => ({ meta: [{ title: "حملة مستوردة — إرث" }] }),
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
  const { id } = useParams({ from: "/campaigns/imported/$id" });
  const [campaign, setCampaign] = useState<Campaign | null>(() => getCampaign(id) ?? null);
  const [loading, setLoading]   = useState(!campaign);

  // First mount: if local cache missed, pull from cloud and retry.
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

  // Progress tick — re-read from localStorage when window regains focus.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setTick(t => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const progress = useMemo(
    () => campaign ? getCampaignProgress(campaign.id) : null,
    [campaign, tick],
  );
  const percent = campaign ? campaignCompletionPercent(campaign) : 0;

  if (loading) {
    return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">جاري التحميل…</div></AppShell>;
  }
  if (!campaign) throw notFound();

  const chapters = [...campaign.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedCount = progress
    ? chapters.filter(ch => progress.chapters[ch.id]?.completed).length
    : 0;
  const finalRewards = campaign.finalRewards;

  return (
    <AppShell>
      <div className="animate-reveal pb-10">
        {/* HERO */}
        <div className="px-3 pt-3">
          <Link to="/campaigns" className="mb-3 flex items-center gap-1 px-2 text-xs text-muted-foreground">
            <ArrowRight className="size-3.5" /> الحملات
          </Link>
          <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/60 p-6 shadow-elegant">
            <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold">
                <Crown className="size-3.5" />
                {campaign.historicalPeriod ?? "حملة مستوردة"}
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
                  <span className="rounded-full bg-white/5 px-2 py-1">⏱ {campaign.estimatedDuration}</span>
                )}
                <span className="rounded-full bg-white/5 px-2 py-1">
                  📜 {chapters.length.toLocaleString("ar-EG")} فصول
                </span>
                {campaign.tags?.slice(0, 3).map(t => (
                  <span key={t} className="rounded-full bg-white/5 px-2 py-1">#{t}</span>
                ))}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all duration-700" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {completedCount}/{chapters.length} فصلًا · {percent}٪
              </p>
            </div>
          </div>
        </div>

        <div className="px-5">
          {/* REWARDS PREVIEW (final) */}
          {finalRewards && (finalRewards.xp || finalRewards.coins || finalRewards.unlocks?.length || finalRewards.badgeId || finalRewards.artifactId) && (
            <div className="mt-6 rounded-3xl border border-gold/25 bg-gradient-to-br from-amber-900/20 via-surface to-stone-900/20 p-5">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-gold" />
                <p className="font-display text-sm font-bold text-gold">جوائز ختام الحملة</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {finalRewards.xp ? <Pill label={`+${finalRewards.xp} XP`} /> : null}
                {finalRewards.coins ? <Pill label={`+${finalRewards.coins} دينار`} /> : null}
                {finalRewards.badgeId ? <Pill label={`🏅 ${finalRewards.badgeId}`} /> : null}
                {finalRewards.artifactId ? <Pill label={`🗡️ ${finalRewards.artifactId}`} /> : null}
                {(finalRewards.unlocks ?? []).map(u => <Pill key={u} label={`🔓 ${u}`} />)}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                ستتاح عناصر السجل في المتحف لاحقًا حين يتم ربط نظام الفتح بالملف الشخصي.
              </p>
            </div>
          )}

          {/* CHAPTERS */}
          <div className="mt-8 flex items-center gap-3">
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
            <div className="space-y-4">
              {chapters.map((ch, i) => {
                const chProgress = progress?.chapters[ch.id];
                const done = Boolean(chProgress?.completed);
                const unlocked = isChapterUnlocked(campaign, ch);
                return (
                  <div key={ch.id} className="animate-reveal">
                    <div className="flex items-start gap-3">
                      <div className={`grid size-9 shrink-0 place-items-center rounded-full border ${
                        done ? "border-gold/60 bg-gradient-gold text-primary-foreground"
                        : unlocked ? "border-gold/40 bg-gold/10 text-gold"
                        : "border-white/10 bg-black/30 text-muted-foreground"
                      }`}>
                        {done ? <Check className="size-4" /> : <span className="text-sm">{(i + 1).toLocaleString("ar-EG")}</span>}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-[10px] tracking-widest text-gold/70">
                          الفصل {(i + 1).toLocaleString("ar-EG")}
                          {ch.rewards?.xp ? ` · +${ch.rewards.xp} نقطة` : ""}
                        </p>
                        <h4 className={`font-display text-base font-bold ${!unlocked ? "text-muted-foreground" : ""}`}>
                          {ch.title}
                        </h4>
                        {ch.subtitle && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{ch.subtitle}</p>
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
                          className="parchment-dark group relative block overflow-hidden rounded-2xl border border-gold/30 p-4 transition hover:border-gold/60"
                        >
                          {ch.introText && (
                            <p className="line-clamp-3 text-[12px] leading-relaxed text-foreground/90">
                              {ch.introText}
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-gold">
                              <BookOpen className="size-3.5" />
                              {done ? "أعد القراءة" : "ابدأ الفصل"}
                            </span>
                            <span className="text-muted-foreground">
                              {ch.activities.length.toLocaleString("ar-EG")} نشاط
                            </span>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* COMPLETION STATE */}
          {chapters.length > 0 && progress?.completed && (
            <div className="mt-8 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
              <Sparkles className="mx-auto size-6 text-gold" />
              <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذه الحملة</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                +{progress.totalXp} XP · +{progress.totalCoins} دينار
                {progress.unlockedRegistryIds.length ? ` · ${progress.unlockedRegistryIds.length} عنصر سجل جاهز للفتح في المتحف` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
      {label}
    </span>
  );
}
