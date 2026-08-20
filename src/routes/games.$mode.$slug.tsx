import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight, Coins, Star, Clock, Sparkles, ChevronLeft,
  BookOpen, Compass, Trophy, Library, RotateCcw, Heart, Landmark, CheckCircle2,
  HelpCircle, Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, Screen } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";

import { getGameBySlug, type GameRow } from "@/lib/games/store";
import { recordCompletion, getMyProgress } from "@/lib/games/progress";
import { markDailyChallengeCompletedLocally } from "@/lib/games/dailyChallengeService";
import { addGuestCompletion } from "@/lib/games/guestCompletions";
import { supabase } from "@/integrations/supabase/client";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, GAME_MODES, type GameMode } from "@/lib/games/types";
import { GameStageRenderer } from "@/components/games/GameStageRenderer";
import { GameTimer, type GameTimerHandle } from "@/components/games/GameTimer";
import { GameHelpProvider } from "@/components/games/help/GameHelpContext";
import { GameHelpDialog } from "@/components/games/help/GameHelpDialog";

import { CrosswordHelpDialog } from "@/components/games/CrosswordHelpDialog";
import { HelpErrorBoundary } from "@/components/games/help/HelpErrorBoundary";
import { TimeExpiredDialog } from "@/components/games/TimeExpiredDialog";
import { ExitConfirmDialog } from "@/components/games/ExitConfirmDialog";
import { sfx } from "@/components/games/sfx";
import { resolveMaxAttempts, resolveTimerSeconds } from "@/lib/games/timer";
import { useProfile } from "@/lib/profile";
import { OutOfHeartsModal } from "@/components/imported-campaign/OutOfHeartsModal";
import { extractMuseumUnlocks, museumUnlocksToCollectionItems } from "@/lib/games/museumUnlocks";
import { enqueueCollectionSync } from "@/lib/campaignLedger";
import { audioManager } from "@/lib/audioManager";
import { androidMark } from "@/lib/androidFreezeDiagnostics";
import "@/components/games/games-premium.css";
import { AnimatedNumber } from "@/components/motion/MotionPrimitives";


export const Route = createFileRoute("/games/$mode/$slug")({
  head: () => ({ meta: [{ title: "تحدّي تاريخي — إرث" }] }),
  component: GamePlayPage,
});

function GamePlayPage() {
  androidMark("render:GamePlay");
  const { mode, slug } = useParams({ from: "/games/$mode/$slug" });
  const navigate = useNavigate();
  const { addPoints, addDinars, spendDinars, loseHeartOnce, hasHearts, recordStreakActivity } = useProfile();

  const [game, setGame] = useState<GameRow | null | "loading">("loading");
  const [stageIdx, setStageIdx] = useState(0);
  const [stageDone, setStageDone] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  // Permanently completed (discovered) — blocks replay. Null = unknown yet.
  const [alreadyCompleted, setAlreadyCompleted] = useState<boolean | null>(null);

  // Attempts + fail flow
  const [wrongCount, setWrongCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [failReason, setFailReason] = useState<"attempts" | "timeout">("attempts");
  const [retryNonce, setRetryNonce] = useState(0);
  const [showOutOfHearts, setShowOutOfHearts] = useState(false);
  const [unlockToast, setUnlockToast] = useState<number>(0); // count of newly unlocked museum items

  // Unified Help system — single button/dialog used by every mini-game.
  const [helpOpen, setHelpOpen] = useState(false);
  const timerRef = useRef<GameTimerHandle | null>(null);
  const playerDinars = useProfile().profile?.dinars ?? 0;
  const TIME_BONUS_COST = 10;
  const TIME_BONUS_SECONDS = 120;

  // Exit confirmation
  const [exitOpen, setExitOpen] = useState(false);
  const pendingHref = useRef<string | null>(null);

  useEffect(() => {
    if (!slug) { setGame(null); return; }
    (async () => {
      const g = await getGameBySlug(slug);
      setGame(g);
      if (g) {
        const { data } = await supabase.auth.getUser();
        if (data.user?.id) {
          const p = await getMyProgress(g.id);
          setAlreadyCompleted(!!p?.completed);
        } else {
          // Guest reward guard mirrors the ledger — if a guest has already
          // completed this game on this device, the replay must show the
          // "already completed" screen and skip the reward pipeline.
          const { readGuestCompletedIds } = await import(
            "@/lib/games/guestCompletions"
          );
          setAlreadyCompleted(readGuestCompletedIds().has(g.id));
        }
      } else {
        setAlreadyCompleted(false);
      }
    })();
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

      // Resolve identity ONCE — determines both the reward-guard source and
      // the userKey passed to the daily-challenge event.
      let uid: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        uid = data.user?.id ?? null;
      } catch {
        uid = null;
      }

      // Reward guard.
      //   • Authenticated: server `game_progress.completed` via recordCompletion.
      //   • Guest: local guest ledger — grants exactly once per game id,
      //     survives reloads, never touches Supabase.
      let firstTime = false;
      if (uid) {
        const res = await recordCompletion(game.id, stageIdx, score);
        firstTime = res.firstTime;
      } else {
        firstTime = addGuestCompletion(game.id).firstTime;
      }

      if (firstTime) {
        // Economy cap — mini-games contribute XP but must not dwarf campaign work.
        if (game.xp_reward > 0) addPoints(Math.min(game.xp_reward, 40));
        if (game.coin_reward > 0) addDinars(Math.min(game.coin_reward, 20));
        // Qualifying streak activity: completing a mini-game / daily challenge.
        // Phase 3A — server-authoritative for auth users; guest falls back locally.
        void recordStreakActivity("game", game.id);
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
      // Canonical daily-challenge event — Home + Hall subscribe to this and
      // will immediately reflect the new completion state. Idempotent, so
      // firing on replay is harmless (rewards are gated by `firstTime`).
      markDailyChallengeCompletedLocally(uid ?? "guest", game.id);
      // Plays once per game id thanks to the dedupe scope key.
      sfx("completion", `${game.id}`);
    }
  }, [game, isLast, stageIdx, failed, stageDone, addPoints, addDinars, recordStreakActivity]);

  // ── Time-Expired grace flow ──────────────────────────────────────────
  // When the countdown hits zero we DO NOT immediately fail. We open a
  // grace dialog that lets the player buy +2:00 for 10 dinars. Only when
  // the player chooses "End challenge" — or buys time without funds and
  // then ends — do we apply the original timeout penalty.
  const [timeExpiredOpen, setTimeExpiredOpen] = useState(false);
  const TIMEOUT_GRACE_SECONDS = 120;

  const applyTimeoutPenalty = useCallback(() => {
    if (!game || game === "loading" || failed || stageDone) return;
    sfx("timeout");
    setFailReason("timeout");
    setFailed(true);
    const dedupKey = `game:${game.id}:stage:${stageIdx}:cycle:${retryNonce}:timeout`;
    const heartsAfter = loseHeartOnce(dedupKey);
    if (heartsAfter <= 0) setShowOutOfHearts(true);
  }, [game, failed, stageDone, stageIdx, retryNonce, loseHeartOnce]);

  // Called by GameTimer when it reaches 00:00. Guarded against duplicates
  // by `expiredRef` inside GameTimer + the open-state check here.
  const handleTimeout = useCallback(() => {
    if (!game || game === "loading" || failed || stageDone) return;
    if (timeExpiredOpen) return;
    setTimeExpiredOpen(true);
  }, [game, failed, stageDone, timeExpiredOpen]);

  const handleBuyExtraTime = useCallback(() => {
    if (!spendDinars(TIME_BONUS_COST)) return; // safety: balance check is in dialog
    timerRef.current?.addSeconds(TIMEOUT_GRACE_SECONDS);
    sfx("gold_unlock", "timeout-grace-add");
    setTimeExpiredOpen(false);
    toast.success("تمت إضافة دقيقتين.");
  }, [spendDinars]);

  const handleEndChallenge = useCallback(() => {
    setTimeExpiredOpen(false);
    applyTimeoutPenalty();
  }, [applyTimeoutPenalty]);



  // Attempts pipeline: one wrong attempt at a time.
  const handleWrong = useCallback(() => {
    if (!game || game === "loading" || failed || stageDone) return;
    setWrongCount((w) => {
      const n = w + 1;
      if (n >= maxAttempts) {
        // Stage failed → lose exactly one heart for this attempt-cycle.
        setFailReason("attempts");
        setFailed(true);
        const dedupKey = `game:${game.id}:stage:${stageIdx}:cycle:${retryNonce}`;
        const heartsAfter = loseHeartOnce(dedupKey);
        if (heartsAfter <= 0) setShowOutOfHearts(true);
      }
      return n;
    });
  }, [game, failed, stageDone, maxAttempts, stageIdx, retryNonce, loseHeartOnce]);

  const onPaidHint = useCallback((cost: number) => spendDinars(cost), [spendDinars]);

  // Built-in help option available in every timed mini-game.
  const helpBuiltins = useMemo(() => [{
    id: "add_time",
    icon: <Hourglass className="h-4 w-4" />,
    label: "شراء دقيقتين إضافيتين",
    description: "أضف دقيقتين إلى الوقت المتبقي لمواصلة التحدّي.",
    cost: TIME_BONUS_COST,
    getAvailable: () => !stageDone && !failed,
    perform: ({ pay }: { pay: () => boolean }) => {
      if (stageDone || failed) return false;
      if (!pay()) return false;
      timerRef.current?.addSeconds(TIME_BONUS_SECONDS);
      sfx("gold_unlock", "help-add-time");
      toast.success("تمت إضافة دقيقتين مقابل 10 دنانير.");
      return true;
    },
  }], [stageDone, failed]);

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
    return (
      <AppShell>
        <div dir="rtl" className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-800/70" />
          <div className="h-36 animate-pulse rounded-2xl border border-amber-500/15 bg-slate-900/40" />
          <div className="h-10 animate-pulse rounded-xl bg-slate-900/40" />
          <div className="h-56 animate-pulse rounded-2xl border border-amber-500/15 bg-slate-900/30" />
        </div>
      </AppShell>
    );
  }
  if (!game || !GAME_MODES.includes(mode as GameMode) || game.mode !== mode || game.status !== "published") {
    return (
      <AppShell>
        <Screen title="هذه اللعبة غير متاحة">
          <p className="mb-3 text-sm text-slate-300">ربما لم تُنشر بعد أو تمت أرشفتها.</p>
          <Link to="/adventure" className="text-amber-300 underline">عودة إلى قاعة التحديات</Link>
        </Screen>
      </AppShell>
    );
  }

  // Permanently completed — once discovered, a challenge cannot be replayed.
  // Wait until the progress fetch resolves so we don't briefly mount the
  // playable UI for a completed game (which would also restart the timer).
  if (alreadyCompleted === null) {
    return (
      <AppShell>
        <div dir="rtl" className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          <div className="h-36 animate-pulse rounded-2xl border border-emerald-500/15 bg-slate-900/40" />
          <div className="h-56 animate-pulse rounded-2xl border border-amber-500/15 bg-slate-900/30" />
        </div>
      </AppShell>
    );
  }
  if (alreadyCompleted) {
    const relatedEntityDone = game.related_entities?.[0];
    const doneUnlockIds = extractMuseumUnlocks({
      metadata: (game.metadata as Record<string, unknown> | null) ?? undefined,
    });
    const doneFirstUnlockSlug = doneUnlockIds.length
      ? (museumUnlocksToCollectionItems(doneUnlockIds)[0]?.itemId ?? null)
      : null;
    return (
      <AppShell>
        <div dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-6">
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => navigate({ to: "/adventure" })}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300"
            >
              <ChevronRight className="h-3.5 w-3.5" /> قاعة التحديات
            </button>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> مكتمل ✓
            </span>
          </div>
          <section className="irth-reveal relative overflow-hidden rounded-2xl border border-emerald-400/30 p-6">
            <div className="absolute inset-0 -z-10 irth-parchment-dark" />
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 irth-gold-glow">
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">اكتشاف موثّق</p>
              <h1 className="text-xl font-bold text-amber-100">{game.title}</h1>
              <p className="max-w-md text-sm leading-7 text-slate-300">
                أتممت هذا التحدي سابقًا. تبقى اكتشافاتك التاريخية محفوظة في سجلّك ومتحفك،
                ولا يمكن إعادة لعبها مجدّدًا.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {relatedEntityDone && (
                  <Link to="/encyclopedia/entity/$id" params={{ id: relatedEntityDone }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15">
                    <BookOpen className="h-3.5 w-3.5" /> اكتشف في الموسوعة
                  </Link>
                )}
                {doneFirstUnlockSlug && (
                  <Link to="/collection" hash={doneFirstUnlockSlug}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400">
                    <Library className="h-3.5 w-3.5" /> افتح في المتحف
                  </Link>
                )}
                <Link to="/adventure"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                  <Compass className="h-3.5 w-3.5" /> تحدٍّ آخر
                </Link>
              </div>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  const relatedEntity = game.related_entities?.[0];
  const museumUnlockIds = extractMuseumUnlocks({
    metadata: (game.metadata as Record<string, unknown> | null) ?? undefined,
  });
  const firstUnlockSlug = museumUnlockIds.length
    ? (museumUnlocksToCollectionItems(museumUnlockIds)[0]?.itemId ?? null)
    : null;
  const hasMuseumReward = !!firstUnlockSlug;

  return (
    <AppShell>
     <GameHelpProvider>
      <div dir="rtl"><ReadingScale className="mx-auto max-w-3xl space-y-5 px-4 py-6">

        {mode === "crossword" ? (
          <CrosswordHelpDialog
            open={helpOpen}
            onOpenChange={setHelpOpen}
            dinars={playerDinars}
            spendDinars={spendDinars}
            hasTimer={timerSeconds > 0}
            addSeconds={(s) => timerRef.current?.addSeconds(s)}
            disabled={stageDone || failed}
          />
        ) : (
          <GameHelpDialog
            open={helpOpen}
            onOpenChange={setHelpOpen}
            dinars={playerDinars}
            spendDinars={spendDinars}
            builtinOptions={helpBuiltins}
          />
        )}


        {/* Time-Expired grace dialog — shared by every timed mini-game. */}
        <TimeExpiredDialog
          open={timeExpiredOpen}
          dinars={playerDinars}
          onBuyTime={handleBuyExtraTime}
          onEndChallenge={handleEndChallenge}
        />




        {/* Breadcrumb with exit guard */}
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => requestNavigate("/adventure")}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300"
          >
            <ChevronRight className="h-3.5 w-3.5" /> قاعة التحديات
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

        {/* Countdown timer + unified Help button + progress rail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <GameTimer
              ref={timerRef}
              key={`${game.id}-${stageIdx}-${retryNonce}`}
              seconds={timerSeconds}
              paused={stageDone || failed}
              onExpire={handleTimeout}
            />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              disabled={stageDone || failed}
              aria-label="مساعدة"
              title="مساعدة"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-gradient-to-b from-amber-500/25 to-amber-600/10 px-3 py-1.5 text-[11px] font-bold text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.15)_inset] transition hover:from-amber-500/35 hover:to-amber-600/20 disabled:opacity-40"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              مساعدة
            </button>
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
          <div key={`${stageIdx}-${retryNonce}`} className="motion-page irth-reveal">
            <GameStageRenderer
              mode={game.mode}
              stage={stage}
              gameId={game.id}
              retryNonce={retryNonce}
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
              <p className="text-[11px] uppercase tracking-[0.35em] text-rose-200/80">
                {failReason === "timeout" ? "انتهى الوقت" : "لم تكتمل المرحلة هذه المرة"}
              </p>
              <h2 className="text-lg font-bold text-rose-100">
                {failReason === "timeout" ? "لم تُكمل التحدي في الوقت المحدد." : "كنت قريبًا — جرّب مرّة أخرى"}
              </h2>
              <p className="max-w-sm text-xs leading-6 text-slate-300">
                خسرت قلبًا واحدًا من هذه المحاولة. أعد المحاولة الآن أو عُد لاحقًا بقلوب جديدة.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  onClick={retry}
                  className="motion-tap inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
                >
                  <RotateCcw className="h-4 w-4" /> إعادة المحاولة
                </button>
                <button
                  onClick={() => requestNavigate("/adventure")}
                  className="motion-tap inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-amber-400"
                >
                  <Compass className="h-4 w-4" /> العودة للتحديات
                </button>
              </div>
            </div>
          </section>
        )}

        {stageDone && !isLast && (
          <button onClick={next}
            className="motion-tap motion-reveal is-in inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400">
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
              <h2 className="text-xl font-bold text-amber-100">{hasMuseumReward ? "أحسنت — أضفت قطعةً جديدة إلى متحفك" : "أحسنت — أتممت التحدي"}</h2>
              {finalScore !== null && (
                <p className="text-xs text-slate-400">دقة الأداء: {finalScore}٪</p>
              )}

              <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-2">
                <RewardChip icon={<Sparkles className="h-4 w-4" />} value={game.xp_reward} label="خبرة" />
                <RewardChip icon={<Coins className="h-4 w-4" />} value={game.coin_reward} label="دينار" />
                {unlockToast > 0 && (
                  <div className="motion-unlock-glow col-span-2 flex items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 irth-gold-glow">
                    <Landmark className="h-4 w-4 text-amber-300" />
                    <span className="text-sm font-bold text-amber-100">مقتنى جديد!</span>
                    <span className="text-[11px] text-slate-300">أُضيف {unlockToast} {unlockToast === 1 ? "أثرٌ" : "آثار"} إلى متحفك</span>
                  </div>
                )}
              </div>


              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {relatedEntity && (
                  <Link to="/encyclopedia/entity/$id" params={{ id: relatedEntity }}
                        className="motion-tap inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15">
                    <BookOpen className="h-3.5 w-3.5" /> اكتشف في الموسوعة
                  </Link>
                )}
                {hasMuseumReward && (
                  <Link to="/collection" hash={firstUnlockSlug ?? undefined}
                        className="motion-tap inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-amber-400">
                    <Library className="h-3.5 w-3.5" /> افتح في المتحف
                  </Link>
                )}
                <Link to="/adventure"
                      className="motion-tap inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                  <Compass className="h-3.5 w-3.5" /> تحدٍّ آخر
                </Link>
              </div>
            </div>
          </section>
        )}
      </ReadingScale></div>


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
     </GameHelpProvider>
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

function RewardChip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="motion-reveal is-in flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2">
      <span className="text-amber-300">{icon}</span>
      <span className="text-base font-bold text-amber-100">+<AnimatedNumber value={value} /></span>
      <span className="text-[11px] text-slate-300">{label}</span>
    </div>
  );
}
