import { createFileRoute, Link, useParams, useSearch, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowRight, Bookmark, BookmarkCheck, Clock, Check, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { STORIES, ERAS, CAMPAIGNS, CHAPTER_LORE } from "@/lib/data";
import { useProfile } from "@/lib/profile";

const searchSchema = z.object({ mission: z.string().optional() });

export const Route = createFileRoute("/story/$id")({
  validateSearch: searchSchema,
  component: StoryPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <h2 className="font-display text-2xl font-bold">القصة غير موجودة</h2>
        <Link to="/" className="mt-4 inline-block text-gold">العودة للرئيسية</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل القصة.</div>
    </AppShell>
  ),
});

function StoryPage() {
  const { id } = useParams({ from: "/story/$id" });
  const { mission } = useSearch({ from: "/story/$id" });
  const story = STORIES.find((s) => s.id === id);
  const { profile, openStory, finishStory, toggleSavedStory } = useProfile();
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => { if (story) openStory(story.id); }, [story, openStory]);

  if (!story) throw notFound();
  const saved = profile.savedStories.includes(story.id);
  const era = ERAS.find((e) => e.id === story.era);
  const alreadyRead = profile.storiesRead.includes(story.id);
  const missionInfo = mission ? CAMPAIGNS.flatMap((c) => c.missions).find((m) => m.id === mission) : null;
  const lore = mission ? CHAPTER_LORE[mission] : undefined;

  const onFinish = () => {
    finishStory(story.id, mission);
    setJustFinished(true);
  };

  return (
    <AppShell>
      <div className="animate-reveal px-5 pt-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowRight className="size-4" /> العودة
          </Link>
          <button
            onClick={() => toggleSavedStory(story.id)}
            className="grid size-10 place-items-center rounded-full border border-white/10 bg-surface text-gold transition hover:border-gold/40"
            aria-label="حفظ"
          >
            {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          </button>
        </div>

        <div className="mt-6">
          {missionInfo?.chapter && (
            <p className="mb-1 text-[10px] tracking-wide text-gold/80">{missionInfo.chapter}</p>
          )}
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
            {era?.name}
          </span>
          <h1 className="font-display mt-3 text-3xl font-bold leading-snug">{story.title}</h1>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> قراءة {story.readMinutes} دقائق
          </p>
          <div className="ornament-divider mt-5" />
        </div>

        {lore && (
          <div className="parchment-dark relative mt-5 overflow-hidden rounded-2xl border border-gold/30 p-4 animate-curtain">
            <div className="absolute inset-0 arabesque-bg" aria-hidden />
            <div className="relative">
              <div className="flex items-center justify-between text-[10px] tracking-widest text-gold/80">
                <span>{lore.era}</span>
                <span>{lore.setting}</span>
              </div>
              <p className="font-display mt-2 text-[13px] leading-relaxed text-foreground/95">{lore.hook}</p>
              {lore.quote && (
                <blockquote className="mt-3 border-r-2 border-gold/60 bg-background/30 px-3 py-2 text-[12px] italic text-foreground/90">
                  «{lore.quote}»{lore.quoteBy && <span className="mt-1 block text-[10px] not-italic text-gold/80">— {lore.quoteBy}</span>}
                </blockquote>
              )}
            </div>
          </div>
        )}

        <article className="mt-6 space-y-4 text-[15px] leading-loose text-foreground/90">
          {story.body.map((p, i) => (
            <p
              key={i}
              className={i === 0
                ? "first-letter:font-display first-letter:text-4xl first-letter:font-bold first-letter:text-gold first-letter:me-1"
                : ""}
              style={{ animation: `reveal .55s ease-out ${i * 0.08}s both` }}
            >
              {p}
            </p>
          ))}
        </article>

        <div className="mt-10">
          {alreadyRead && !justFinished ? (
            <div className="rounded-3xl border border-gold/30 bg-gold/5 p-5 text-center">
              <Check className="mx-auto size-6 text-gold" />
              <p className="font-display mt-2 text-base font-bold text-gold">قرأتَ هذه القصة من قبل</p>
              <p className="mt-1 text-xs text-muted-foreground">تمّت إضافتها إلى أرشيفك التاريخي.</p>
            </div>
          ) : justFinished ? (
            <div className="animate-reveal rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/20 via-gold/10 to-transparent p-6 text-center shadow-gold">
              <div className="reward-burst mx-auto grid size-14 place-items-center rounded-full bg-gradient-gold text-2xl">📜</div>
              <p className="font-display mt-3 text-xl font-bold text-gold">أحسنت! أنهيتَ القصة</p>
              <p className="mt-1 text-xs text-muted-foreground">+٢٥ نقطة · أُضيفت إلى أرشيفك التاريخي</p>
              {mission && <p className="mt-2 text-xs text-gold">✓ تمّت مهمة الحملة</p>}
              <Link to="/" className="mt-4 inline-block rounded-2xl border border-gold/40 px-4 py-2 text-xs text-gold">
                تابع المغامرة
              </Link>
            </div>
          ) : (
            <button
              onClick={onFinish}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-gold py-4 text-sm font-bold text-primary-foreground shadow-gold transition active:scale-[0.98]"
            >
              <span className="absolute inset-0 -translate-x-full bg-white/20 transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative flex items-center justify-center gap-2">
                <Sparkles className="size-4" />
                أنهيتُ القراءة — استلم المكافأة
              </span>
            </button>
          )}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            المكافآت تُمنح فقط بعد إنهاء القراءة كاملةً.
          </p>
        </div>
      </div>
    </AppShell>
  );
}