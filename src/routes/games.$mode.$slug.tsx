import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Coins, Star, Clock, Sparkles, ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { getGameBySlug, type GameRow } from "@/lib/games/store";
import { recordCompletion } from "@/lib/games/progress";
import { MODE_LABELS_AR, GAME_MODES, type GameMode } from "@/lib/games/types";
import { GameStageRenderer } from "@/components/games/GameStageRenderer";
import { useProfile } from "@/lib/profile";

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

  const handleComplete = async (score: number) => {
    setStageDone(true);
    if (isLast) {
      const { firstTime } = await recordCompletion(game.id, stageIdx, score);
      if (firstTime) {
        if (game.xp_reward > 0) addPoints(game.xp_reward);
        if (game.coin_reward > 0) addDinars(game.coin_reward);
      }
    }
  };

  const next = () => {
    if (isLast) return;
    setStageIdx(stageIdx + 1);
    setStageDone(false);
  };


  return (
    <AppShell>
      <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="flex items-center justify-between">
          <Link to="/adventure" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-300">
            <ChevronRight className="h-3.5 w-3.5" /> المغامرة
          </Link>
          <span className="text-xs text-slate-500">{MODE_LABELS_AR[game.mode]}</span>
        </div>

        <header className="space-y-2 border-b border-amber-500/20 pb-4">
          <h1 className="text-2xl font-bold text-amber-100">{game.title}</h1>
          {game.description && <p className="text-sm leading-7 text-slate-300">{game.description}</p>}
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-400" /> مستوى {game.difficulty}/5</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{game.estimated_time} د</span>
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-amber-300" /> {game.xp_reward} خبرة</span>
            <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-amber-300" /> {game.coin_reward} دينار</span>
          </div>
        </header>

        <div className="text-xs text-slate-500">المرحلة {stageIdx + 1} من {stages.length}</div>

        {stage ? (
          <GameStageRenderer mode={game.mode} stage={stage} onComplete={handleComplete} />
        ) : (
          <p className="text-sm text-slate-400">لا توجد مراحل في هذه اللعبة.</p>
        )}

        {stageDone && !isLast && (
          <button onClick={next}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">
            المرحلة التالية <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {stageDone && isLast && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <p className="font-bold">أحسنت! اكتملت اللعبة.</p>
            <p className="mt-1 text-xs">حصلت على {game.xp_reward} خبرة و{game.coin_reward} دينار.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
