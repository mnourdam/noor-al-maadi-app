import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sword, Search, Sparkles, Clock, Coins, Star, Play,
  Crown, Hourglass, Link2, Archive, Feather, ScrollText, Moon, Trophy, Check,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { type GameRow } from "@/lib/games/store";
import { useDailyChallengeState } from "@/lib/games/dailyChallengeService";
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
  const { state, loading } = useDailyChallengeState();
  const picks = state?.picks ?? null;
  const completedIds = state?.completedIds ?? new Set<string>();
  const todaysPicksDone = state?.todaysPicksDone ?? false;
  const allEligibleExhausted = state?.allEligibleExhausted ?? false;


  return (
    <AppShell>
      <Screen title="قاعة التحديات" subtitle="تحدّيان من نوعين مختلفين كل يوم.">
        <div dir="rtl" className="space-y-10">
          <section>
            <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="تحدي اليوم" hint="يتجدّد كل صباح" />
            {loading || picks === null ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                جارٍ التحميل…
              </p>
            ) : allEligibleExhausted ? (
              <ExhaustedBanner />
            ) : todaysPicksDone ? (
              <CompletedBanner />
            ) : !picks.length ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                لم تُنشر تحديات بعد. تابع قريبًا.
              </p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 md:gap-5 xl:grid-cols-2">
                {picks.map((g) => (
                  <DailyCard key={g.id} game={g} completed={completedIds.has(g.id)} />
                ))}
              </div>
            )}
          </section>

          {/* Rotation reminder — hidden once every eligible challenge is done,
              since a "come back tomorrow" line is misleading when nothing new
              will unlock without new content. */}
          {!allEligibleExhausted && (
            <section>
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-950 via-slate-900/60 to-slate-950 p-6 text-center">
                <Moon className="mx-auto h-7 w-7 text-amber-300/80" strokeWidth={1.3} />
                <p className="mt-3 text-sm leading-7 text-amber-100/90">
                  تتجدد التحديات عند بداية يوم جديد.
                </p>
                <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-l from-transparent via-amber-500/40 to-transparent" />
              </div>
            </section>
          )}


          {/* Museum hall */}
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

function CompletedBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 irth-title-card p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-400/50 bg-emerald-500/15">
        <Check className="h-7 w-7 text-emerald-300" strokeWidth={2} />
      </div>
      <h3 className="mt-4 text-lg font-bold text-emerald-100">أتممت تحديات اليوم ✓</h3>
      <p className="mt-2 text-sm leading-7 text-slate-300">
        أحسنت! أنجزت تحديي اليوم. عد غدًا لتفتح تحديات جديدة.
      </p>
      <p className="mt-3 text-[11px] leading-6 text-slate-500">
        تتجدد التحديات عند بداية يوم جديد.
      </p>
    </div>
  );
}

function ExhaustedBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 irth-title-card p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-400/50 bg-emerald-500/15">
        <Trophy className="h-7 w-7 text-emerald-300" strokeWidth={1.4} />
      </div>
      <h3 className="mt-4 text-lg font-bold text-emerald-100">أتممت جميع التحديات المتاحة</h3>
      <p className="mt-2 text-sm leading-7 text-slate-300">
        إنجاز رائع! لقد أنهيت كل تحديات القاعة المتاحة حاليًا.
        <br />
        سنضيف لك تحديات جديدة قريبًا.
      </p>
    </div>
  );
}

function DailyCard({ game, completed }: { game: GameRow; completed: boolean }) {
  const Icon = MODE_ICON[game.mode];

  const shellBase =
    "group relative block overflow-hidden rounded-2xl border p-5 transition";
  const shellClass = completed
    ? `${shellBase} border-emerald-400/40 bg-gradient-to-br from-[#0a1a14] via-[#0c2018] to-[#08120e]`
    : `${shellBase} border-amber-500/40 irth-title-card hover:border-amber-300`;

  const content = (
    <>
      {completed && (
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
          <Check className="h-3 w-3" strokeWidth={2.5} /> تم الإنجاز
        </div>
      )}
      {!completed && (
        <>
          <span className="irth-ember" style={{ left: "18%", animationDelay: "0s" }} />
          <span className="irth-ember" style={{ left: "62%", animationDelay: "1.4s" }} />
        </>
      )}
      <div className="relative flex items-start gap-4">
        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border ${
            completed
              ? "border-emerald-400/50 bg-emerald-500/10"
              : "border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-amber-700/5 irth-gold-glow"
          }`}
        >
          {completed ? (
            <Check className="h-7 w-7 text-emerald-300" strokeWidth={2.5} />
          ) : (
            <Icon className="h-7 w-7 text-amber-300" strokeWidth={1.4} />
          )}
        </div>
        <div className="flex-1">
          <p
            className={`text-[10px] uppercase tracking-[0.3em] ${
              completed ? "text-emerald-300/90" : "text-amber-300/80"
            }`}
          >
            {MODE_LABELS_AR[game.mode]}
          </p>
          <h3
            className={`mt-1 text-lg font-bold ${
              completed ? "text-emerald-50" : "text-amber-100 group-hover:text-amber-200"
            }`}
          >
            {game.title}
          </h3>
          {game.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-7 text-slate-300">{game.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Star className="h-3 w-3 text-amber-400" /> {game.difficulty}/5</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Clock className="h-3 w-3" /> ~{game.estimated_time} د</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Sparkles className="h-3 w-3 text-amber-300" /> {game.xp_reward}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1"><Coins className="h-3 w-3 text-amber-300" /> {game.coin_reward}</span>
          </div>
          {completed ? (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100">
              <Check className="h-4 w-4" strokeWidth={2.5} /> أُنجز اليوم
            </span>
          ) : (
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 group-hover:bg-amber-400">
              <Play className="h-4 w-4" /> ابدأ الآن
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (completed) {
    return <div className={shellClass} aria-disabled="true">{content}</div>;
  }

  return (
    <Link
      to="/games/$mode/$slug"
      params={{ mode: game.mode, slug: game.slug }}
      className={shellClass}
    >
      {content}
    </Link>
  );
}
