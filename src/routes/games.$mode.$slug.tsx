import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, Coins, Star, Clock, Sparkles, ChevronLeft,
  BookOpen, Compass, Trophy, Library, RotateCcw, Heart, Landmark,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { getGameBySlug, type GameRow } from "@/lib/games/store";
import { recordCompletion } from "@/lib/games/progress";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, GAME_MODES, type GameMode } from "@/lib/games/types";
import { GameStageRenderer } from "@/components/games/GameStageRenderer";
import { GameTimer } from "@/components/games/GameTimer";
import { ExitConfirmDialog } from "@/components/games/ExitConfirmDialog";
import { sfx } from "@/components/games/sfx";
import { resolveMaxAttempts, resolveTimerSeconds } from "@/lib/games/timer";
import { useProfile } from "@/lib/profile";
import { OutOfHeartsModal } from "@/components/imported-campaign/OutOfHeartsModal";
import { extractMuseumUnlocks, museumUnlocksToCollectionItems } from "@/lib/games/museumUnlocks";
import { enqueueCollectionSync } from "@/lib/campaignLedger";
import { audioManager } from "@/lib/audioManager";
import "@/components/games/games-premium.css";


export const Route = createFileRoute("/games/$mode/$slug")({
  head: () => ({ meta: [{ title: "تحدّي تاريخي — إرث" }] }),
  component: GamePlayPage,
});

function GamePlayPage() {
  const { mode, slug } = useParams({ from: "/games/$mode/$slug" });
  const navigate = useNavigate();
  const { addPoints, addDinars, spendDinars, loseHeartOnce, hasHearts } = useProfile();

  const [game, setGame] = useState<GameRow | null | "loading">("loading");
  const [stageIdx, setStageIdx] = useState(0);
  const [stageDone, setStageDone] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  // Attempts + fail flow
  const [wrongCount, setWrongCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<"attempts" | "timeout">("attempts");
  const [retryNonce, setRetryNonce] = useState(0);
  const [showOutOfHearts, setShowOutOfHearts] = useState(false);
  const [unlockToast, setUnlockToast] = useState<number>(0); // count of newly unlocked museum items


  // Exit confirmation
  const [exitOpen, setExitOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);

  useEffect(() => {
    if (!slug) { setGame(null); return; }
    (async () => setGame(await getGameBySlug(slug)))();
  }, [slug]);

  const stages = useMemo(() => {
    if (!game || game === "loading") return [];
    const raw = Array.isArray(game.stages) ? game.stages : [];
    return raw.filter((s): s is Record<string, unknown> => !!s && typeof s === "object");
  }, [game]);

  const stage = stages[stageIdx];
  const isLast = stages.length > 0 && stageIdx >= stages.length - 1;
  const progressPct = stages.length === 0 ? 0 : Math.round(((stageIdx + (stageDone ? 1 : 0)) / stages.length) * 100);

  const timerSeconds = useMemo(
    () => (game && game !== "loading" ? resolveTimerSeconds(game, stage) : 60),
    [game, stage],
  );
  const maxAttempts = useMemo(
    () => (game && game !== "loading" ? resolveMaxAttempts(game, stage) : 3),
    [game, stage],
  );
  const attemptsLeft = Math.max(0, maxAttempts - wrongCount);
  const inProgress = !!game && game !== "loading" && stages.length > 0 && !stageDone && !failed && finalScore === null;

  // Reset transient stage state on stage change / retry
  useEffect(() => {
    setStageDone(false);
    setWrongCount(0);
    setFailed(false);
    setFailReason("attempts");
  }, [stageIdx, retryNonce]);

  // Beforeunload protection while a stage is in progress
  useEffect(() => {
    if (!inProgress) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [inProgress]);

  const handleComplete = useCallback(async (score: number) => {
    if (!game || game === "loading") return;
    // Timeout / attempts failure must block any reward pipeline.
    if (failed || stageDone) return;
    setStageDone(true);
    if (isLast) {
      setFinalScore(score);
      const { firstTime } = await recordCompletion(game.id, stageIdx, score);
      if (firstTime) {
        if (game.xp_reward > 0) addPoints(game.xp_reward);
        if (game.coin_reward > 0) addDinars(game.coin_reward);
        // Museum unlocks — reuse the Campaign pipeline (user_collection).
        const unlockIds = extractMuseumUnlocks({
          metadata: (game.metadata as Record<string, unknown> | null) ?? undefined,
        });
        if (unlockIds.length) {
          const items = museumUnlocksToCollectionItems(unlockIds);
          if (items.length) {
            enqueueCollectionSync(items);
            audioManager.playSfx("unlock-reward", { dedupeKey: `game-unlock:${game.id}` });
            setUnlockToast(items.length);
          }
        }
      }
      // Plays once per game id thanks to the dedupe scope key.
      sfx("completion", `${game.id}`);
    }
  }, [game, isLast, stageIdx, addPoints, addDinars]);


  // Attempts pipeline: one wrong attempt at a time.
  const handleWrong = useCallback(() => {
    if (!game || game === "loading" || failed || stageDone) return;
    setWrongCount((w) => {
      const n = w + 1;
      if (n >= maxAttempts) {
        // Stage failed → lose exactly one heart for this attempt-cycle.
        setFailed(true);
        const dedupKey = `game:${game.id}:stage:${stageIdx}:cycle:${retryNonce}`;
        const heartsAfter = loseHeartOnce(dedupKey);
        if (heartsAfter <= 0) setShowOutOfHearts(true);
      }
      return n;
    });
  }, [game, failed, stageDone, maxAttempts, stageIdx, retryNonce, loseHeartOnce]);

  const onPaidHint = useCallback((cost: number) => spendDinars(cost), [spendDinars]);

  const next = () => {
    if (isLast) return;
    setStageIdx((i) => i + 1);
  };

  const retry = () => {
    if (!hasHearts()) { setShowOutOfHearts(true); return; }
    setRetryNonce((n) => n + 1);
  };

  // Navigation interceptor for the breadcrumb / "back" link.
  const requestNavigate = (href: string) => {
    if (inProgress) {
      pendingHref.current = href;
      setExitOpen(true);
    } else {
      navigate({ to: href });
    }
  };

  if (game === "loading") {
    return <AppShell><Screen title="جارٍ التحميل…">…</Screen></AppShell>;
  }
  if (!game || !GAME_MODES.includes(mode as GameMode) || game.mode !== mode || game.status !== "published") {
    return (
      <AppShell>
        <Screen title="هذه اللعبة غير متاحة">
          <p className="mb-3 text-sm text-slate-300">ربما لم تُنشر بعد أو تمت أرشفتها.</p>
          <Link to="/adventure" className="text-amber-300 underline">عودة إلى المغامرة</Link>
        </Screen>
      </AppShell>
    );
  }

  const relatedEntity = game.related_entities?.[0];

  return (
    <AppShell>
      <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {/* Breadcrumb with exit guard */}
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => requestNavigate("/adventure")}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300"
          >
            <ChevronRight className="h-3.5 w-3.5" /> المغامرة
          </button>
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

        {/* Countdown timer (always visible) + progress rail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <GameTimer
              key={`${game.id}-${stageIdx}-${retryNonce}`}
              seconds={timerSeconds}
              paused={stageDone || failed}
              onExpire={() => { sfx("timeout"); handleWrong(); }}
            />
            <div className="hidden text-end text-[11px] text-slate-400 sm:block">
              <p>الوقت المتاح</p>
              <p className="text-amber-300/80">يستمر العدّ حتى انتهاء المرحلة</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>المرحلة {Math.min(stageIdx + 1, Math.max(stages.length, 1))} من {stages.length}</span>
              <span>{progressPct}٪</span>
            </div>
            <div className="irth-rail" aria-label="تقدم اللعبة">
              <span style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        {/* Stage */}
        {stage && !failed ? (
          <div key={`${stageIdx}-${retryNonce}`} className="irth-reveal">
            <GameStageRenderer
              mode={game.mode}
              stage={stage}
              onComplete={handleComplete}
              onWrong={handleWrong}
              attemptsLeft={attemptsLeft}
              maxAttempts={maxAttempts}
              onPaidHint={onPaidHint}
            />
          </div>
        ) : !stage ? (
          <p className="text-sm text-slate-400">لا توجد مراحل في هذه اللعبة.</p>
        ) : null}

        {/* Failure card — encourages another attempt */}
        {failed && (
          <section className="irth-reveal relative overflow-hidden rounded-2xl border border-rose-400/40 p-6">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-rose-950/40 via-slate-950 to-slate-950" />
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-rose-400/40 bg-rose-500/15">
                <Heart className="h-7 w-7 text-rose-300" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-rose-200/80">لم تكتمل المرحلة هذه المرة</p>
              <h2 className="text-lg font-bold text-rose-100">كنت قريبًا — جرّب مرّة أخرى</h2>
              <p className="max-w-sm text-xs leading-6 text-slate-300">
                خسرت قلبًا واحدًا من هذه المحاولة. أعد المحاولة الآن أو عُد لاحقًا بقلوب جديدة.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={retry}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
                >
                  <RotateCcw className="h-4 w-4" /> أعد المحاولة
                </button>
                <button
                  onClick={() => requestNavigate("/adventure")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-amber-400"
                >
                  <Compass className="h-4 w-4" /> الخروج إلى المغامرة
                </button>
              </div>
            </div>
          </section>
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
                {unlockToast > 0 && (
                  <div className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 irth-gold-glow">
                    <Landmark className="h-4 w-4 text-amber-300" />
                    <span className="text-sm font-bold text-amber-100">مقتنى جديد!</span>
                    <span className="text-[11px] text-slate-300">أُضيف {unlockToast} {unlockToast === 1 ? "أثرٌ" : "آثار"} إلى متحفك</span>
                  </div>
                )}
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

      <ExitConfirmDialog
        open={exitOpen}
        onCancel={() => { setExitOpen(false); pendingHref.current = null; }}
        onConfirm={() => {
          const href = pendingHref.current ?? "/adventure";
          setExitOpen(false);
          pendingHref.current = null;
          navigate({ to: href });
        }}
      />

      <OutOfHeartsModal open={showOutOfHearts} onClose={() => setShowOutOfHearts(false)} />
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
