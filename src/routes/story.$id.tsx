import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Bookmark, BookmarkCheck, Clock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { STORIES, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/story/$id")({
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
  const story = STORIES.find((s) => s.id === id);
  const { profile, markStoryRead, toggleSavedStory } = useProfile();

  useEffect(() => { if (story) markStoryRead(story.id); }, [story, markStoryRead]);

  if (!story) throw notFound();
  const saved = profile.savedStories.includes(story.id);
  const era = ERAS.find((e) => e.id === story.era);

  return (
    <AppShell>
      <div className="px-5 pt-8">
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
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
            {era?.name}
          </span>
          <h1 className="font-display mt-3 text-3xl font-bold leading-snug">{story.title}</h1>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> قراءة {story.readMinutes} دقائق · +١٠ نقاط
          </p>
          <div className="ornament-divider mt-5" />
        </div>

        <article className="mt-6 space-y-4 text-[15px] leading-loose text-foreground/90">
          {story.body.map((p, i) => (
            <p key={i} className={i === 0 ? "first-letter:font-display first-letter:text-4xl first-letter:font-bold first-letter:text-gold first-letter:me-1" : ""}>{p}</p>
          ))}
        </article>

        <div className="mt-10 rounded-2xl border border-gold/20 bg-gold/5 p-5 text-center">
          <p className="text-sm text-muted-foreground">أتممتَ القراءة 🌟</p>
          <p className="font-display mt-1 text-lg font-bold text-gold">+١٠ نقاط</p>
        </div>
      </div>
    </AppShell>
  );
}