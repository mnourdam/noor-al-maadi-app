import { useState } from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import {
  ArrowRight, Lock, Check, Crown, Trophy, Sparkles, Scroll,
  MapPin, Star, BookOpen, X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";
import {
  getEngineCampaign, campaignProgressFor, isChapterUnlocked,
  campaignCompletionKey,
} from "@/lib/campaign-engine";

export const Route = createFileRoute("/play/campaign/$id")({
  head: () => ({ meta: [{ title: "حملة تاريخية — إرث" }] }),
  component: CampaignOverview,
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

function CampaignOverview() {
  const { id } = useParams({ from: "/play/campaign/$id" });
  const campaign = getEngineCampaign(id);
  if (!campaign) throw notFound();

  const {
    profile, addPoints, awardBadge, findArtifact, unlockCharacter,
    completeCampaign,
  } = useProfile();
  const progress = campaignProgressFor(campaign, profile);
  const allDone = progress.completedChapters === progress.totalChapters;
  const claimed = progress.completed;
  const [revealOpen, setRevealOpen] = useState(false);

  const onClaim = () => {
    const r = campaign.finalReward;
    completeCampaign(campaignCompletionKey(campaign.id), 0); // mark complete (no double-XP)
    if (r.xp) addPoints(r.xp);
    if (r.badgeId) awardBadge(r.badgeId);
    if (r.artifactId) findArtifact(r.artifactId);
    r.characterIds?.forEach(c => unlockCharacter(c));
    setRevealOpen(true);
  };

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
                <Crown className="size-3.5" /> حملة العَلَم · {DIFFICULTY_LABEL[campaign.difficulty]}
              </div>
              <h1 className="font-display mt-2 text-2xl font-bold leading-snug shimmer-text">
                {campaign.title}
              </h1>
              {campaign.subtitle && (
                <p className="mt-1 text-sm text-gold/80">{campaign.subtitle}</p>
              )}
              <p className="mt-3 text-[12px] leading-relaxed text-foreground/90">
                {campaign.intro}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-white/5 px-2 py-1">
                  ⏱ {campaign.estimatedMinutes[0]}–{campaign.estimatedMinutes[1]} دقيقة
                </span>
                <span className="rounded-full bg-white/5 px-2 py-1">
                  📜 {campaign.chapters.length.toLocaleString("ar-EG")} فصول
                </span>
                {campaign.finalReward.legendary && (
                  <span className="rounded-full bg-gold/15 px-2 py-1 text-gold">⭐ مكافأة أسطورية</span>
                )}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all duration-700" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {progress.completedChapters}/{progress.totalChapters} فصلًا · {progress.percent}٪
              </p>
            </div>
          </div>
        </div>

        <div className="px-5">
          {/* REWARDS PREVIEW */}
          <div className="mt-6 rounded-3xl border border-gold/25 bg-gradient-to-br from-amber-900/20 via-surface to-stone-900/20 p-5">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-gold" />
              <p className="font-display text-sm font-bold text-gold">جوائز ختام الحملة</p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              تُكشف هذه الجوائز فقط حين تُكمل جميع الفصول وتختم الحملة.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <RewardCard locked={!claimed} icon="🏷️" title="لقب" name={campaign.finalReward.title ?? ""} />
              <RewardCard locked={!claimed} icon="🗡️" title="أثرٌ نادر" name={campaign.finalReward.artifactId ? "سيف صلاح الدين" : ""} />
              <RewardCard locked={!claimed} icon="🏅" title="شارة" name="شارة أسطورية" />
              <RewardCard locked={!claimed} icon="✨" title="نقاط" name={`+${campaign.finalReward.xp}`} />
            </div>
          </div>

          {/* CHAPTER JOURNEY */}
          <div className="mt-8 flex items-center gap-3">
            <Scroll className="size-4 text-gold" />
            <h3 className="font-display text-base font-bold">فصول الرحلة</h3>
            <span className="ms-auto text-[11px] text-muted-foreground">
              {progress.completedChapters}/{progress.totalChapters}
            </span>
          </div>
          <div className="gold-divider mt-2 mb-5" />

          <div className="relative pr-6">
            <div className="chapter-rail absolute right-2 top-0 bottom-0" aria-hidden />
            <div className="space-y-4">
              {campaign.chapters.map(ch => {
                const done = progress.chapters.find(c => c.chapterId === ch.id)?.completed;
                const unlocked = isChapterUnlocked(campaign, ch, profile);
                return (
                  <div key={ch.id} className="animate-reveal">
                    <div className="-mr-[3px] flex items-start gap-3">
                      <div className={`chapter-seal shrink-0 ${done ? "ring-2 ring-gold" : ""} ${!unlocked ? "opacity-40 grayscale" : ""}`}>
                        {done ? <Check className="size-5" /> : <span className="text-lg">{ch.index.toLocaleString("ar-EG")}</span>}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-[10px] tracking-widest text-gold/70">
                          الفصل {ch.index.toLocaleString("ar-EG")} · +{ch.xp} نقطة
                        </p>
                        <h4 className={`font-display text-base font-bold ${!unlocked ? "text-muted-foreground" : ""}`}>
                          {ch.title}
                        </h4>
                        {ch.subtitle && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{ch.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <div className="mr-[34px] mt-2">
                      {!unlocked ? (
                        <div className="rounded-2xl border border-white/10 bg-surface/40 p-4 text-center">
                          <Lock className="mx-auto size-4 text-muted-foreground" />
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            يُفتح هذا الفصل عند إتمام ما قبله.
                          </p>
                        </div>
                      ) : (
                        <Link
                          to="/play/campaign/$id/chapter/$chapter"
                          params={{ id: campaign.id, chapter: ch.id }}
                          className="parchment-dark group relative block overflow-hidden rounded-2xl border border-gold/30 p-4 transition hover:border-gold/60"
                        >
                          <p className="line-clamp-3 text-[12px] leading-relaxed text-foreground/90">
                            {ch.intro}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1 text-gold">
                              <BookOpen className="size-3.5" />
                              {done ? "أعد القراءة" : "ابدأ الفصل"}
                            </span>
                            {ch.locations && ch.locations.length > 0 && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="size-3" />
                                {ch.locations.map(l => l.label).filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RELATED HISTORY */}
          {campaign.related.length > 0 && (
            <div className="mt-10">
              <h3 className="font-display mb-2 text-sm font-bold text-muted-foreground">
                <Star className="me-1 inline size-3.5 text-gold" /> تاريخٌ مرتبط
              </h3>
              <div className="flex flex-wrap gap-2">
                {campaign.related.map(r => (
                  <span key={`${r.kind}:${r.id}`} className="rounded-full border border-gold/30 bg-surface/60 px-3 py-1 text-[11px] text-gold/90">
                    {r.label ?? r.id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CLAIM */}
          <div className="mt-8">
            {allDone && !claimed ? (
              <button
                onClick={onClaim}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-gold py-4 text-sm font-bold text-primary-foreground shadow-gold animate-gold-pulse"
              >
                <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
                <Sparkles className="relative size-4" />
                <span className="relative">استلم المكافأة الكبرى</span>
              </button>
            ) : claimed ? (
              <button
                onClick={() => setRevealOpen(true)}
                className="w-full rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center transition hover:bg-gold/15"
              >
                <Trophy className="mx-auto size-6 text-gold" />
                <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذه الحملة</p>
                <p className="mt-1 text-[11px] text-muted-foreground">انقر لرؤية الختام</p>
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4 text-center text-[11px] text-muted-foreground">
                أكمل جميع الفصول ليُفتح ختام الحملة.
              </div>
            )}
          </div>
        </div>
      </div>

      {revealOpen && (
        <FinaleModal
          onClose={() => setRevealOpen(false)}
          title={campaign.title}
          subtitle={campaign.subtitle ?? ""}
          rewardTitle={campaign.finalReward.title ?? ""}
          xp={campaign.finalReward.xp}
          chapters={campaign.chapters.map(c => c.title)}
          unlocked={[
            campaign.finalReward.title ? `لقب · ${campaign.finalReward.title}` : null,
            campaign.finalReward.artifactId ? `أثر · سيف صلاح الدين` : null,
            "شارة أسطورية",
          ].filter(Boolean) as string[]}
        />
      )}
    </AppShell>
  );
}

function RewardCard(props: { locked: boolean; icon: string; title: string; name: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/15 to-transparent p-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-widest text-gold/80">{props.title}</span>
        {props.locked ? <Lock className="size-3 text-muted-foreground" /> : <Check className="size-3 text-gold" />}
      </div>
      <div className={`mx-auto mt-2 grid size-12 place-items-center rounded-full bg-background/60 text-2xl ${props.locked ? "opacity-40 grayscale" : ""}`}>
        {props.icon}
      </div>
      <p className={`font-display mt-2 text-center text-xs font-bold ${props.locked ? "text-muted-foreground" : "text-foreground"}`}>
        {props.locked ? "؟؟؟" : props.name}
      </p>
    </div>
  );
}

function FinaleModal(props: {
  onClose: () => void; title: string; subtitle: string; rewardTitle: string;
  xp: number; chapters: string[]; unlocked: string[];
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-b from-amber-900/40 via-surface to-stone-900/60 p-6 shadow-elegant animate-reveal">
        <button onClick={props.onClose} className="absolute left-3 top-3 rounded-full bg-black/40 p-1.5 text-muted-foreground">
          <X className="size-4" />
        </button>
        <div className="text-center">
          <Crown className="mx-auto size-8 text-gold" />
          <p className="mt-2 text-[10px] tracking-widest text-gold/80">ختام الحملة</p>
          <h2 className="font-display mt-1 text-xl font-bold shimmer-text">{props.title}</h2>
          {props.subtitle && <p className="mt-1 text-[11px] text-muted-foreground">{props.subtitle}</p>}
        </div>
        <div className="mt-5 rounded-2xl border border-gold/30 bg-background/40 p-4">
          <p className="text-[10px] tracking-widest text-gold/80">جوائز مكتسبة</p>
          <ul className="mt-2 space-y-1 text-[12px]">
            {props.unlocked.map((u) => (
              <li key={u} className="flex items-center gap-2"><Check className="size-3 text-gold" />{u}</li>
            ))}
            <li className="flex items-center gap-2"><Check className="size-3 text-gold" />+{props.xp} نقطة خبرة</li>
          </ul>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-background/40 p-4">
          <p className="text-[10px] tracking-widest text-gold/80">فصول مُنجزة</p>
          <ol className="mt-2 space-y-1 text-[12px] text-muted-foreground">
            {props.chapters.map((c, i) => (
              <li key={c}>{(i + 1).toLocaleString("ar-EG")}. {c}</li>
            ))}
          </ol>
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          ستبقى هذه الإنجازات في ملفّك التاريخي إلى الأبد.
        </p>
      </div>
    </div>
  );
}