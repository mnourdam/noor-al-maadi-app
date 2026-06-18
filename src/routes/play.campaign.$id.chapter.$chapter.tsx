import { useState } from "react";
import { createFileRoute, Link, useParams, useNavigate, notFound } from "@tanstack/react-router";
import {
  ArrowRight, BookOpen, Check, MapPin, Users, Star, Lock,
  Sparkles, ScrollText, Gift, ChevronLeft,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";
import {
  getEngineCampaign, chapterCompletionKey, isChapterUnlocked,
} from "@/lib/campaign-engine";
import type { ChapterUnlock } from "@/lib/campaign-engine";

export const Route = createFileRoute("/play/campaign/$id/chapter/$chapter")({
  head: () => ({ meta: [{ title: "فصل من حملة — إرث" }] }),
  component: ChapterPlayer,
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

function ChapterPlayer() {
  const { id, chapter: chapterId } = useParams({ from: "/play/campaign/$id/chapter/$chapter" });
  const campaign = getEngineCampaign(id);
  if (!campaign) throw notFound();
  const chapter = campaign.chapters.find(c => c.id === chapterId);
  if (!chapter) throw notFound();

  const {
    profile, completeMission, findArtifact, unlockCharacter, unlockEra,
  } = useProfile();
  const navigate = useNavigate();

  const unlocked = isChapterUnlocked(campaign, chapter, profile);
  const key = chapterCompletionKey(campaign.id, chapter.id);
  const completed = profile.missionsCompleted.includes(key);
  const next = campaign.chapters.find(c => c.index === chapter.index + 1);

  const [acknowledged, setAcknowledged] = useState(false);

  const finishChapter = () => {
    completeMission(key, chapter.xp);
    const u = chapter.unlocks;
    if (u) {
      u.characters?.forEach(c => unlockCharacter(c));
      u.artifacts?.forEach(a => findArtifact(a));
      u.states?.forEach(s => unlockEra(s));
    }
  };

  if (!unlocked) {
    return (
      <AppShell>
        <div className="px-5 pt-20 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            أكمل الفصل السابق لتفتح هذا الفصل.
          </p>
          <Link
            to="/play/campaign/$id"
            params={{ id: campaign.id }}
            className="mt-5 inline-block rounded-full border border-gold/40 px-4 py-2 text-xs text-gold"
          >
            عودة لخريطة الحملة
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="animate-reveal pb-16">
        {/* HERO */}
        <div className="px-3 pt-3">
          <Link
            to="/play/campaign/$id"
            params={{ id: campaign.id }}
            className="mb-3 flex items-center gap-1 px-2 text-xs text-muted-foreground"
          >
            <ArrowRight className="size-3.5" /> {campaign.title}
          </Link>
          <div className="relative overflow-hidden rounded-3xl border border-gold/30 shadow-elegant">
            <div className="parchment-dark relative p-6">
              <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative">
                <p className="text-[10px] tracking-widest text-gold/80">
                  الفصل {chapter.index.toLocaleString("ar-EG")} · +{chapter.xp} نقطة
                </p>
                <h1 className="font-display mt-2 text-2xl font-bold leading-snug shimmer-text">
                  {chapter.title}
                </h1>
                {chapter.subtitle && (
                  <p className="mt-1 text-sm text-gold/80">{chapter.subtitle}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-5">
          {/* INTRO */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-surface/60 p-5">
            <p className="text-[13px] leading-loose text-foreground/95">{chapter.intro}</p>
            {chapter.body && chapter.body.length > 0 && (
              <div className="mt-3 space-y-2">
                {chapter.body.map((p, i) => (
                  <p key={i} className="text-[12px] leading-loose text-foreground/85">{p}</p>
                ))}
              </div>
            )}
          </div>

          {/* FIGURES & LOCATIONS */}
          {(chapter.figures?.length || chapter.locations?.length) ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              {chapter.figures && chapter.figures.length > 0 && (
                <EntityList icon={<Users className="size-3.5" />} title="شخصيات" items={chapter.figures.map(f => f.label ?? f.id)} />
              )}
              {chapter.locations && chapter.locations.length > 0 && (
                <EntityList icon={<MapPin className="size-3.5" />} title="أماكن" items={chapter.locations.map(l => l.label ?? l.id)} />
              )}
            </div>
          ) : null}

          {/* EVENTS */}
          {chapter.events && chapter.events.length > 0 && (
            <div className="mt-3">
              <EntityList icon={<Star className="size-3.5" />} title="أحداث رئيسية" items={chapter.events.map(e => e.label ?? e.id)} />
            </div>
          )}

          {/* KNOWLEDGE CARDS */}
          {chapter.knowledgeCards && chapter.knowledgeCards.length > 0 && (
            <div className="mt-7">
              <div className="flex items-center gap-2">
                <ScrollText className="size-4 text-gold" />
                <h3 className="font-display text-sm font-bold">بطاقات معرفية</h3>
              </div>
              <div className="gold-divider mt-2 mb-3" />
              <div className="space-y-3">
                {chapter.knowledgeCards.map(card => (
                  <div key={card.id} className="rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-transparent p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/40 text-xl">
                        {card.icon ?? "📜"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-bold text-gold">{card.title}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{card.body}</p>
                        {card.source && (
                          <p className="mt-2 text-[10px] text-muted-foreground">المصدر: {card.source}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UNLOCKABLES PREVIEW */}
          {chapter.unlocks && hasUnlocks(chapter.unlocks) && (
            <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <div className="flex items-center gap-2">
                <Gift className="size-4 text-gold" />
                <p className="font-display text-sm font-bold text-gold">سيُفتح بإتمام الفصل</p>
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-foreground/85">
                {chapter.unlocks.characters?.map(c => <li key={`ch-${c}`}>• شخصية: {c}</li>)}
                {chapter.unlocks.artifacts?.map(a => <li key={`ar-${a}`}>• أثر: {a}</li>)}
                {chapter.unlocks.cities?.map(c => <li key={`ci-${c}`}>• مدينة: {c}</li>)}
                {chapter.unlocks.battles?.map(b => <li key={`bt-${b}`}>• معركة: {b}</li>)}
                {chapter.unlocks.events?.map(e => <li key={`ev-${e}`}>• حدث: {e}</li>)}
                {chapter.unlocks.states?.map(s => <li key={`st-${s}`}>• دولة: {s}</li>)}
              </ul>
            </div>
          )}

          {/* READING GATE / FINISH */}
          <div className="mt-8">
            {completed ? (
              <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
                <Check className="mx-auto size-5 text-gold" />
                <p className="font-display mt-2 text-sm font-bold text-gold">أنجزتَ هذا الفصل</p>
                {next ? (
                  <Link
                    to="/play/campaign/$id/chapter/$chapter"
                    params={{ id: campaign.id, chapter: next.id }}
                    className="mt-3 inline-flex items-center gap-1 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground"
                  >
                    الفصل التالي <ChevronLeft className="size-3.5" />
                  </Link>
                ) : (
                  <Link
                    to="/play/campaign/$id"
                    params={{ id: campaign.id }}
                    className="mt-3 inline-flex items-center gap-1 rounded-full border border-gold/40 px-4 py-2 text-xs text-gold"
                  >
                    العودة لختام الحملة
                  </Link>
                )}
              </div>
            ) : chapter.readingGate ? (
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <label className="flex items-start gap-3 text-[12px] text-foreground/90">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 size-4 accent-amber-500"
                  />
                  <span>
                    لقد قرأت محتوى الفصل وأنا جاهز لختمه.
                  </span>
                </label>
                <button
                  onClick={() => { if (acknowledged) { finishChapter();
                    if (next) navigate({ to: "/play/campaign/$id/chapter/$chapter", params: { id: campaign.id, chapter: next.id } });
                  } }}
                  disabled={!acknowledged}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  <Sparkles className="size-4" /> أنهيتُ القراءة وأختم الفصل
                </button>
              </div>
            ) : (
              <button
                onClick={() => { finishChapter();
                  if (next) navigate({ to: "/play/campaign/$id/chapter/$chapter", params: { id: campaign.id, chapter: next.id } });
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground"
              >
                <BookOpen className="size-4" /> أكمل الفصل
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function hasUnlocks(u: ChapterUnlock): boolean {
  return !!(
    u.characters?.length || u.artifacts?.length || u.cities?.length ||
    u.regions?.length || u.battles?.length || u.events?.length || u.states?.length
  );
}

function EntityList(props: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
      <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
        {props.icon} {props.title}
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-foreground/90">
        {props.items.map((i) => <li key={i}>• {i}</li>)}
      </ul>
    </div>
  );
}