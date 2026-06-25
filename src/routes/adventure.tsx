import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Compass, Sword, Search, Gamepad2, Sparkles, Clock, Coins, Star, ChevronLeft, Play,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { fetchDailyFeaturedGames, type GameRow } from "@/lib/games/store";
import { MODE_LABELS_AR, GAME_MODES, MODE_TAGLINES_AR, type GameMode } from "@/lib/games/types";

export const Route = createFileRoute("/adventure")({
  head: () => ({
    meta: [
      { title: "المغامرة — إرث" },
      { name: "description", content: "بوابتك إلى الحملات والتحقيقات والتحديات التاريخية اليومية." },
    ],
  }),
  component: AdventurePage,
});

function AdventurePage() {
  const [daily, setDaily] = useState<GameRow[]>([]);

  useEffect(() => {
    (async () => setDaily(await fetchDailyFeaturedGames(2)))();
  }, []);

  return (
    <AppShell>
      <Screen title="المغامرة" subtitle="ابدأ رحلتك التاريخية من حيث توقفت">
        <div dir="rtl" className="space-y-8">
          {/* Hero / Continue Campaign */}
          <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300">
                <Sword className="h-6 w-6" />
              </span>
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-wide text-amber-300/80">الرحلة الرئيسية</p>
                <h2 className="mt-1 text-lg font-bold text-amber-100">تابع حملاتك</h2>
                <p className="mt-1 text-sm text-slate-300">الحملات هي قلب رحلتك في إرث — استأنف الفصل الأخير أو ابدأ حملة جديدة.</p>
                <Link to="/campaigns" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
                  <Play className="h-3.5 w-3.5" /> فتح الحملات
                </Link>
              </div>
            </div>
          </section>

          {/* Today's challenges */}
          <section>
            <SectionHeader icon={<Sparkles className="h-4 w-4" />} title="تحديات اليوم التاريخية" hint="تحدّيان مختاران بعناية يتجدّدان يوميًا" />
            {daily.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
                لم تُنشر تحديات بعد. تابع قريبًا — يضيفها فريق التحرير عبر الاستيراد.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {daily.map((g) => <DailyCard key={g.id} game={g} />)}
              </div>
            )}
          </section>

          {/* Quick recovery */}
          <section>
            <SectionHeader icon={<Search className="h-4 w-4" />} title="التحقيقات" hint="استراحة سريعة من القرائن والاستنتاج" />
            <Link to="/investigations" className="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200 hover:border-amber-400">
              فتح قائمة التحقيقات →
            </Link>
          </section>

          {/* Explore all games (compact) */}
          <section>
            <SectionHeader icon={<Gamepad2 className="h-4 w-4" />} title="استكشف جميع الألعاب" hint="خمسة أنماط تربطك بالموسوعة" />
            <Link to="/games" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              عرض كل التحديات <ChevronLeft className="h-3.5 w-3.5" />
            </Link>

            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {GAME_MODES.map((m) => <ModeCard key={m} mode={m} />)}
            </div>
          </section>
        </div>
      </Screen>
    </AppShell>
  );
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="inline-flex items-center gap-2 text-base font-bold text-amber-100">
        <span className="text-amber-400">{icon}</span> {title}
      </h2>
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </div>
  );
}

function DailyCard({ game }: { game: GameRow }) {
  return (
    <Link to="/games/$mode/$slug" params={{ mode: game.mode, slug: game.slug }}
      className="group rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-4 transition hover:border-amber-400/60">
      <p className="text-[10px] uppercase tracking-wide text-amber-300/80">{MODE_LABELS_AR[game.mode]}</p>
      <h3 className="mt-1 text-base font-bold text-amber-100 group-hover:text-amber-200">{game.title}</h3>
      {game.description && <p className="mt-1 line-clamp-2 text-xs leading-6 text-slate-400">{game.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-400" /> {game.difficulty}/5</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{game.estimated_time} د</span>
        <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-amber-300" /> {game.xp_reward}</span>
        <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-amber-300" /> {game.coin_reward}</span>
      </div>
    </Link>
  );
}

function ModeCard({ mode }: { mode: GameMode }) {
  return (
    <Link to="/games" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-amber-400/60">
      <h3 className="text-sm font-bold text-amber-100">{MODE_LABELS_AR[mode]}</h3>
      <p className="mt-1 text-xs leading-6 text-slate-400">{MODE_TAGLINES_AR[mode]}</p>
    </Link>
  );
}
