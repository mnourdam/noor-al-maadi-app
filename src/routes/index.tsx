import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Flame, Star, Sparkles, BookOpen, Puzzle, HelpCircle, Calendar, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { dailyStory, todayOnThisDay, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "حكايا — الرئيسية" },
      { name: "description", content: "ابدأ يومك بقصة من التاريخ العربي والإسلامي." },
      { property: "og:title", content: "حكايا" },
      { property: "og:description", content: "قصص وألغاز وشخصيات من تاريخنا المجيد." },
    ],
  }),
  component: Index,
});

function Index() {
  const { profile, touchStreak } = useProfile();
  const story = dailyStory();
  const today = todayOnThisDay();

  useEffect(() => { touchStreak(); }, [touchStreak]);

  return (
    <AppShell>
      <header className="px-5 pt-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">أهلاً بك في</p>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              حكايا <span className="text-gold">·</span>
            </h1>
          </div>
          <div className="glass flex items-center gap-3 rounded-2xl border border-white/10 px-3 py-2">
            <div className="flex items-center gap-1 text-gold">
              <Flame className="size-4" />
              <span className="text-sm font-bold">{profile.streak}</span>
            </div>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <Star className="size-4 text-gold" />
              <span className="text-sm font-bold">{profile.points}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-7 px-5">
        <div className="mb-2 flex items-center gap-2 text-xs text-gold">
          <Sparkles className="size-3.5" />
          <span>قصة اليوم</span>
        </div>
        <Link
          to="/story/$id"
          params={{ id: story.id }}
          className="shadow-elegant relative block overflow-hidden rounded-3xl border border-white/10 bg-surface"
        >
          <div className="absolute inset-0 bg-gradient-to-tl from-amber-500/15 via-transparent to-amber-300/10" />
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative p-6">
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
              {ERAS.find((e) => e.id === story.era)?.name}
            </span>
            <h2 className="font-display mt-4 text-2xl font-bold leading-snug">{story.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{story.excerpt}</p>
            <div className="mt-5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">قراءة {story.readMinutes} دقائق</span>
              <span className="flex items-center gap-1 text-gold">
                اقرأ الآن <ArrowLeft className="size-3.5" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      <section className="mt-6 px-5">
        <div className="grid grid-cols-2 gap-3">
          <QuickCard to="/puzzles" icon={<Puzzle className="size-5" />} title="ألغاز تاريخية" desc="٢٠ لغزًا" />
          <QuickCard to="/who-am-i" icon={<HelpCircle className="size-5" />} title="من أنا؟" desc="١٠ شخصيات" />
          <QuickCard to="/on-this-day" icon={<Calendar className="size-5" />} title="في مثل هذا اليوم" desc={today.title} />
          <QuickCard to="/journey" icon={<BookOpen className="size-5" />} title="خارطة الرحلة" desc="١٠ حقب" />
        </div>
      </section>

      <section className="mt-7 px-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">في مثل هذا اليوم</h3>
          <Link to="/on-this-day" className="text-xs text-gold">عرض الكل</Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-surface p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
              <Calendar className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gold">{today.year}</p>
              <h4 className="font-display mt-0.5 text-base font-bold">{today.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{today.detail}</p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function QuickCard({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to as "/"} className="rounded-2xl border border-white/10 bg-surface p-4 transition hover:border-gold/40">
      <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">{icon}</div>
      <p className="mt-3 text-sm font-bold">{title}</p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{desc}</p>
    </Link>
  );
}
