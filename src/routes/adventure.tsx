import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Compass, Sword, Search, Sparkles, Clock, Coins, Star, Play,
  Crown, Hourglass, Link2, Archive, Feather, ScrollText, Moon,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { fetchDailyFeaturedGames, type GameRow } from "@/lib/games/store";
import { MODE_LABELS_AR, type GameMode } from "@/lib/games/types";
import "@/components/games/games-premium.css";

export const Route = createFileRoute("/adventure")({
  head: () => ({
    meta: [
      { title: "قاعة التحديات — إرث" },
      { name: "description", content: "بوابتك إلى الحملات والتحقيقات والتحديات التاريخية اليومية." },
    ],
  }),
  component: AdventurePage,
});

const MODE_ICON: Record<GameMode, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  crossword: Feather,
  chronology: Hourglass,
  who_am_i: ScrollText,
  connections: Link2,
  memory: Archive,
};


function AdventurePage() {
  const [daily, setDaily] = useState<GameRow[]>([]);

  useEffect(() => {
    (async () => setDaily(await fetchDailyFeaturedGames(2)))();
  }, []);

  const spotlight = daily[0];
  const second = daily[1];

  return (
    <AppShell>
      <Screen title="قاعة التحديات" subtitle="تحدّيان مختاران بعناية كل يوم.">
        <div dir="rtl" className="space-y-10">
          {/* Spotlight challenge */}
          <section>
            <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="تحدّي اليوم" hint="يتجدّد كل صباح" />
            {!spotlight ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                لم تُنشر تحديات بعد. تابع قريبًا.
              </p>
            ) : (
              <SpotlightCard game={spotlight} />
            )}
          </section>

          {/* Secondary featured */}
          {second && (
            <section>
              <SectionHeader icon={<Compass className="h-4 w-4" />} title="تحدٍّ مرافق" hint="مختار بعناية" />
              <DailyCard game={second} />
            </section>
          )}

          {/* Teaser — no more challenges today */}
          <section>
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950 via-slate-900/60 to-slate-950 p-6 text-center">
              <Moon className="mx-auto h-7 w-7 text-amber-300/80" strokeWidth={1.3} />
              <p className="mt-3 text-sm leading-7 text-amber-100/90">
                هذه تحديات اليوم. تُفتح تحديات جديدة عند بزوغ فجر الغد إن شاء الله.
              </p>
              <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-l from-transparent via-amber-500/40 to-transparent" />
            </div>
          </section>

          {/* Museum hall — moved to bottom */}
          <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 irth-title-card p-6 sm:p-8">
            <span className="irth-ember" style={{ left: "10%", animationDelay: "0s" }} />
            <span className="irth-ember" style={{ left: "32%", animationDelay: "1.1s" }} />
            <span className="irth-ember" style={{ left: "58%", animationDelay: "2.3s" }} />
            <span className="irth-ember" style={{ left: "82%", animationDelay: "3.4s" }} />

            <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-[11px] uppercase tracking-[0.4em] text-amber-300/80">ادخل المعرض</p>
                <h2 className="mt-2 text-xl font-bold leading-tight text-amber-100 sm:text-2xl">
                  تابع حملتك أو ابدأ تحقيقًا تاريخيًا جديدًا.
                </h2>
                <p className="mt-2 max-w-prose text-sm leading-7 text-slate-300">
                  كل انتصار يضيف قطعة إلى متحفك ويفتح قاعة جديدة في الموسوعة.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/campaigns"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">
                    <Sword className="h-4 w-4" /> الحملات
                  </Link>
                  <Link to="/investigations"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/15">
                    <Search className="h-4 w-4" /> التحقيقات
                  </Link>
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="grid h-24 w-24 place-items-center rounded-full border border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-amber-700/5 irth-gold-glow">
                  <Crown className="h-12 w-12 text-amber-300" strokeWidth={1.2} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </Screen>
    </AppShell>
  );
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-amber-100">
          <span className="text-amber-400">{icon}</span> {title}
        </h2>
        <div className="mt-1 h-px w-24 bg-gradient-to-l from-transparent via-amber-500/50 to-transparent" />
      </div>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}

function SpotlightCard({ game }: { game: GameRow }) {
  const Icon = MODE_ICON[game.mode];
  return (
    <Link
      to="/games/$mode/$slug" params={{ mode: game.mode, slug: game.slug }}
      className="group block relative overflow-hidden rounded-2xl border border-amber-500/40 irth-title-card p-6 transition hover:border-amber-300"
    >
      <span className="irth-ember" style={{ left: "18%", animationDelay: "0s" }} />
      <span className="irth-ember" style={{ left: "62%", animationDelay: "1.4s" }} />
      <div className="relative flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-amber-700/5 irth-gold-glow">
          <Icon className="h-8 w-8 text-amber-300" strokeWidth={1.4} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80">{MODE_LABELS_AR[game.mode]}</p>
          <h3 className="mt-1 text-xl font-bold text-amber-100 group-hover:text-amber-200">{game.title}</h3>
          {game.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-300">{game.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Star className="h-3 w-3 text-amber-400" /> {game.difficulty}/5</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Clock className="h-3 w-3" /> ~{game.estimated_time} د</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Sparkles className="h-3 w-3 text-amber-300" /> {game.xp_reward}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Coins className="h-3 w-3 text-amber-300" /> {game.coin_reward}</span>
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 group-hover:bg-amber-400">
            <Play className="h-4 w-4" /> ابدأ الآن
          </span>
        </div>
      </div>
    </Link>
  );
}

function DailyCard({ game }: { game: GameRow }) {
  const Icon = MODE_ICON[game.mode];
  return (
    <Link to="/games/$mode/$slug" params={{ mode: game.mode, slug: game.slug }}
      className="group flex gap-4 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-4 transition hover:border-amber-400/60">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
        <Icon className="h-6 w-6" strokeWidth={1.4} />
      </div>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wide text-amber-300/80">{MODE_LABELS_AR[game.mode]}</p>
        <h3 className="mt-1 text-base font-bold text-amber-100 group-hover:text-amber-200">{game.title}</h3>
        {game.description && <p className="mt-1 line-clamp-2 text-xs leading-6 text-slate-400">{game.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-400" /> {game.difficulty}/5</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{game.estimated_time} د</span>
          <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-amber-300" /> {game.xp_reward}</span>
          <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-300" /> {game.coin_reward}</span>
        </div>
      </div>
    </Link>
  );
}

