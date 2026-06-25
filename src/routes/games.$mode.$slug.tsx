import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Coins, Star, Clock, Sparkles, ChevronLeft, BookOpen, Compass, Trophy, Library } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { getGameBySlug, type GameRow } from "@/lib/games/store";
import { recordCompletion } from "@/lib/games/progress";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, GAME_MODES, type GameMode } from "@/lib/games/types";
import { GameStageRenderer } from "@/components/games/GameStageRenderer";
import { sfx } from "@/components/games/sfx";
import { useProfile } from "@/lib/profile";
import "@/components/games/games-premium.css";

export const Route = createFileRoute("/games/$mode/$slug")({
  head: () => ({ meta: [{ title: "تحدّي تاريخي — إرث" }] }),
  component: GamePlayPage,
});

function GamePlayPage() {
  const { mode, slug } = useParams({ from: "/games/$mode/$slug" });
  const { addPoints, addDinars } = useProfile();
  const [game, setGame] = useState<GameRow | null | "loading">("loading");
  const [stageIdx, setStageIdx] = useState(0);
  const [stageDone, setStageDone] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) { setGame(null); return; }
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);
    })();
  }, [slug]);

  if (game === "loading") {
    return <AppShell><Screen title="جارٍ التحميل…">…</Screen></AppShell>;
  }
  if (!game || !GAME_MODES.includes(mode as GameMode) || game.mode !== mode || game.status !== "published") {
    return (
      <AppShell>
        <Screen title="هذه اللعبة غير متاحة">
          <p className="mb-3 text-sm text-slate-300">
            ربما لم تُنشر بعد أو تمت أرشفتها.
          </p>
          <Link to="/adventure" className="text-amber-300 underline">عودة إلى المغامرة</Link>
        </Screen>
      </AppShell>
    );
  }

  const rawStages = Array.isArray(game.stages) ? game.stages : [];
  const stages = rawStages.filter((s): s is Record<string, unknown> => !!s && typeof s === "object");
  const stage = stages[stageIdx];
  const isLast = stages.length > 0 && stageIdx >= stages.length - 1;
  const progressPct = stages.length === 0 ? 0 : Math.round(((stageIdx + (stageDone ? 1 : 0)) / stages.length) * 100);

  const handleComplete = async (score: number) => {
    setStageDone(true);
    if (isLast) {
      setFinalScore(score);
      const { firstTime } = await recordCompletion(game.id, stageIdx, score);
      if (firstTime) {
        if (game.xp_reward > 0) addPoints(game.xp_reward);
        if (game.coin_reward > 0) addDinars(game.coin_reward);
      }
      sfx("completion");
    }
  };

  const next = () => {
    if (isLast) return;
    setStageIdx(stageIdx + 1);
    setStageDone(false);
  };

  const relatedEntity = game.related_entities?.[0];

  return (
    <AppShell>
      <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between text-xs">
          <Link to="/adventure" className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300">
            <ChevronRight className="h-3.5 w-3.5" /> المغامرة
          </Link>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            {MODE_LABELS_AR[game.mode]}
          </span>
        </div>

        {/* Cinematic title card */}
        <header className="irth-title-card relative overflow-hidden p-5 sm:p-6">
          <span className="irth-ember" style={{ left: "12%", animationDelay: "0s" }} />
          <span className="irth-ember" style={{ left: "42%", animationDelay: "1.2s" }} />
          <span className="irth-ember" style={{ left: "78%", animationDelay: "2.1s" }} />

          <div className="relative space-y-3">
            <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300/80">{MODE_TAGLINES_AR[game.mode]}</p>
            <h1 className="text-2xl font-bold leading-tight text-amber-100 sm:text-3xl">{game.title}</h1>
            {game.description && <p className="max-w-prose text-sm leading-7 text-slate-300">{game.description}</p>}
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              <Chip icon={<Star className="h-3.5 w-3.5 text-amber-400" />}>مستوى {game.difficulty}/5</Chip>
              <Chip icon={<Clock className="h-3.5 w-3.5 text-amber-300" />}>~{game.estimated_time} د</Chip>
              <Chip icon={<Sparkles className="h-3.5 w-3.5 text-amber-300" />}>{game.xp_reward} خبرة</Chip>
              <Chip icon={<Coins className="h-3.5 w-3.5 text-amber-300" />}>{game.coin_reward} دينار</Chip>
            </div>
          </div>
        </header>

        {/* Progress rail */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>المرحلة {Math.min(stageIdx + 1, Math.max(stages.length, 1))} من {stages.length}</span>
            <span>{progressPct}٪</span>
          </div>
          <div className="irth-rail" aria-label="تقدم اللعبة">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Stage */}
        {stage ? (
          <div key={stageIdx} className="irth-reveal">
            <GameStageRenderer mode={game.mode} stage={stage} onComplete={handleComplete} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">لا توجد مراحل في هذه اللعبة.</p>
        )}

        {stageDone && !isLast && (
          <button onClick={next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400">
            المرحلة التالية <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Premium completion screen */}
        {stageDone && isLast && (
          <section className="irth-reveal relative overflow-hidden rounded-2xl border border-amber-500/40 p-6">
            <div className="absolute inset-0 -z-10 irth-parchment-dark" />
            <span className="irth-ember" style={{ left: "20%", animationDelay: "0s" }} />
            <span className="irth-ember" style={{ left: "55%", animationDelay: "1s" }} />
            <span className="irth-ember" style={{ left: "82%", animationDelay: "2.4s" }} />

            <div className="flex flex-col items-center gap-3 text-center">
              <div className="irth-unlock irth-gold-glow grid h-16 w-16 place-items-center rounded-full border border-amber-400/60 bg-gradient-to-br from-amber-500/30 to-amber-700/10">
                <Trophy className="h-8 w-8 text-amber-300" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300/80">اكتملت الرحلة</p>
              <h2 className="text-xl font-bold text-amber-100">أحسنت — أضفت قطعةً جديدة إلى متحفك</h2>
              {finalScore !== null && (
                <p className="text-xs text-slate-400">دقة الأداء: {finalScore}٪</p>
              )}

              <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-2">
                <RewardChip icon={<Sparkles className="h-4 w-4" />} value={`+${game.xp_reward}`} label="خبرة" />
                <RewardChip icon={<Coins className="h-4 w-4" />} value={`+${game.coin_reward}`} label="دينار" />
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {relatedEntity && (
                  <Link to="/encyclopedia/entity/$id" params={{ id: relatedEntity }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15">
                    <BookOpen className="h-3.5 w-3.5" /> اكتشف في الموسوعة
                  </Link>
                )}
                <Link to="/collection"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400">
                  <Library className="h-3.5 w-3.5" /> تصفح المتحف
                </Link>
                <Link to="/adventure"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                  <Compass className="h-3.5 w-3.5" /> تحدٍّ آخر
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1 text-amber-100/90">
      {icon} {children}
    </span>
  );
}

function RewardChip({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2">
      <span className="text-amber-300">{icon}</span>
      <span className="text-base font-bold text-amber-100">{value}</span>
      <span className="text-[11px] text-slate-300">{label}</span>
    </div>
  );
}
