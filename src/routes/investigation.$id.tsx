import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Check, X, Trophy, Coins, BookOpen, Heart, Star, Loader2, Lightbulb, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";

import { getInvestigation, investigationScopeKey } from "@/lib/investigations";
import {
  useSupabaseInvestigation,
  displayDifficulty,
  type InvestigationRow,
  type InvestigationReward,
  type InvestigationStep,
} from "@/lib/investigations-source";
import { useProfile } from "@/lib/profile";
import { displayName } from "@/lib/display-names";
import { resolveRelatedRefs } from "@/lib/encyclopedia-refs";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { recordInvestigationCompletion, useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { useStashCurrentAsOrigin } from "@/lib/navigation";


export const Route = createFileRoute("/investigation/$id")({
  head: () => ({ meta: [{ title: "تحقيق تاريخي" }] }),
  component: InvestigationPage,
});

function InvestigationPage() {
  const { id } = useParams({ from: "/investigation/$id" });
  // Try Supabase first by slug; fall back to legacy by id.
  const { row, error } = useSupabaseInvestigation(id);

  if (row === undefined && !error) {
    return (
      <AppShell>
        <div className="flex items-center justify-center gap-2 px-5 pt-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      </AppShell>
    );
  }

  if (row) return <SupabaseInvestigationGame key={row.id} row={row} />;

  // Fallback: legacy in-code investigation by id.
  const legacy = getInvestigation(id);
  if (legacy) return <LegacyInvestigationGame key={legacy.id} inv={legacy} />;

  return (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">القضية غير موجودة.</div>
    </AppShell>
  );
}

// ============================================================
// Supabase player — renders briefing/evidence/question/decision/conclusion
// ============================================================
function SupabaseInvestigationGame({ row }: { row: InvestigationRow }) {
  const {
    profile, markInvestigationCompletedLocal, awardBadge,
    recoverHeartFromActivity, recordStreakActivity,
  } = useProfile();
  const stashOrigin = useStashCurrentAsOrigin();


  const steps: InvestigationStep[] = useMemo(
    () => (Array.isArray(row.steps) ? row.steps : []),
    [row.steps],
  );
  const reward = (row.reward ?? {}) as InvestigationReward;
  const relatedRaw: string[] = Array.isArray(row.related_entities) ? row.related_entities : [];
  // Only resolved refs are player-facing. Unresolved refs are recorded
  // via the resolver's one-shot diagnostic log for admin review.
  const relatedRefs = useMemo(
    () => resolveRelatedRefs(relatedRaw).filter((r) => r.resolved),
    [relatedRaw],
  );

  const canonicalProgress = useCanonicalInvestigationProgress();
  const alreadyDone =
    canonicalProgress.matches(row.id) || canonicalProgress.matches(row.slug);

  // Phase G1 — legacy migration is now driven globally by
  // <InvestigationLegacyBackfill /> at the app root. Nothing to trigger
  // from the player screen; the canonical hook already reflects any
  // pending backfill via the outbox.

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  // Answer state machine per question-like step (see
  // `src/lib/investigations/answer-machine.ts` for the pure reducer
  // that these hooks mirror):
  //   "unanswered" → picking, submit enabled once `picked != null`
  //   "incorrect"  → wrong choice revealed; user must retry (no Next)
  //   "correct"    → correct choice locked in; Next enabled
  // Decision steps with no correctAnswer collapse "unanswered" → "correct".
  const [answerState, setAnswerState] = useState<"unanswered" | "incorrect" | "correct">("unanswered");
  // Set of question-like step indices that have reached `correct` at
  // least once. A retry that finally succeeds contributes exactly one
  // entry — the invariant "every correct question counts once" holds
  // regardless of how many wrong attempts preceded it.
  const [resolvedIndices, setResolvedIndices] = useState<Set<number>>(() => new Set());
  const [finished, setFinished] = useState(alreadyDone);
  const [heartGain, setHeartGain] = useState<number>(0);
  // Double-tap guard — a second synchronous click before React commits
  // the state transition must be dropped so Next never advances twice
  // and grantRewards never fires twice in the same tick.
  const [advancing, setAdvancing] = useState(false);

  const step = steps[idx];
  const isLast = idx >= steps.length - 1;
  const stepNeedsAnswer = !!step && (step.type === "question" || step.type === "decision");
  // Investigations are the recovery path when hearts are empty — they
  // never gate on hearts and never consume hearts.

  const onConfirm = () => {
    if (!step) return;
    if (step.type === "question" || step.type === "decision") {
      if (picked == null || answerState === "correct") return;
      const correctIndex = step.correctAnswer;
      const isCorrect = typeof correctIndex === "number" ? picked === correctIndex : true;
      if (isCorrect) {
        // Record this index exactly once. Set semantics guarantee that
        // repeated confirms, re-renders, or "wrong then correct" flows
        // still contribute a single entry per question.
        setResolvedIndices((prev) => {
          if (prev.has(idx)) return prev;
          const next = new Set(prev);
          next.add(idx);
          return next;
        });
        setAnswerState("correct");
      } else {
        setAnswerState("incorrect");
      }
    }
  };

  const onRetry = () => {
    setPicked(null);
    setAnswerState("unanswered");
  };

  const grantRewards = () => {
    // Phase G — server-authoritative. Enqueue a durable, idempotent
    // completion; the RPC reads the reward from the published row,
    // enforces caps, and grants XP/dinars/hearts exactly once via the
    // applied_profile_deltas ledger. Client values are advisory only.
    const totalQuestionLike = steps.filter((s) => s.type === "question" || s.type === "decision").length;
    const correctCount = resolvedIndices.size;
    void recordInvestigationCompletion({
      investigationId: row.id,
      investigationSlug: row.slug,
      score: correctCount,
      correctCount,
    });

    // Local optimistic marker — server reward reconciles via cloud_saves.
    markInvestigationCompletedLocal(row.slug);

    if (reward.badge) awardBadge(reward.badge);

    // Heart restoration — respects cooldown so the same investigation
    // can't be farmed back-to-back for hearts.
    const hearts = Math.max(0, Number(reward.hearts ?? 0));
    let gained = 0;
    for (let i = 0; i < hearts; i++) {
      const out = recoverHeartFromActivity({ kind: "investigation", id: `${row.slug}:${i}` });
      if (out.ok) gained++;
    }
    setHeartGain(gained);
    void totalQuestionLike;
  };

  const onNext = () => {
    if (advancing) return;
    setAdvancing(true);
    setPicked(null);
    setAnswerState("unanswered");
    if (!isLast) {
      setIdx((i) => i + 1);
      // Release guard on the next tick so React can commit the index
      // change before another click is accepted.
      queueMicrotask(() => setAdvancing(false));
      return;
    }
    if (!alreadyDone) grantRewards();
    setFinished(true);
  };

  if (steps.length === 0) {
    return (
      <AppShell>
        <div className="px-5 pt-20 text-center text-muted-foreground">لا توجد خطوات لهذا التحقيق.</div>
      </AppShell>
    );
  }

  const questionLikeIndex = steps.slice(0, idx + 1).filter((s) => s.type === "question" || s.type === "decision").length;
  const totalQuestionLike = steps.filter((s) => s.type === "question" || s.type === "decision").length;

  return (
    <AppShell>
      <ReadingScale className="px-5 pt-6">

        <Link to="/investigations" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> كل التحقيقات
        </Link>

        <div className="mt-4 rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold">
            <Search className="size-3.5" /> تحقيق تاريخي · {displayDifficulty(row.difficulty)}
          </div>
          <h1 className="font-display mt-2 text-lg font-bold leading-snug">{row.title}</h1>
          {row.subtitle && <p className="mt-1 text-[12px] text-gold/90">{row.subtitle}</p>}
          {row.description && <p className="mt-2 text-[12px] leading-7 text-foreground/90">{row.description}</p>}
        </div>

        {relatedRefs.length > 0 && (
          <section className="mt-5">
            <h2 className="font-display mb-2 text-sm font-bold">مراجع موسوعية</h2>
            <div className="flex flex-wrap gap-2">
              {relatedRefs.map((ref) => {
                const linkId = ref.linkId;
                const label = ref.label || displayName(ref.raw) || "مرجع تاريخي";
                return (
                  <Link
                    key={ref.raw}
                    to="/encyclopedia/entity/$id"
                    params={{ id: linkId }}
                    onClick={() => stashOrigin(`/encyclopedia/entity/${linkId}`)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] hover:bg-gold/10 ${
                      ref.resolved
                        ? "border-gold/30 bg-gold/5 text-gold"
                        : "border-white/10 bg-surface text-muted-foreground"
                    }`}
                  >
                    <BookOpen className="size-3" /> {label}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {!finished && step && (
          <section className="mt-6">
            <h2 className="font-display mb-2 text-sm font-bold">
              خطوة {(idx + 1).toLocaleString("en-US")}/{steps.length.toLocaleString("en-US")}
              {stepNeedsAnswer && (
                <span className="ms-2 text-[11px] text-muted-foreground">
                  سؤال {questionLikeIndex}/{totalQuestionLike}
                </span>
              )}
            </h2>

            <StepCard
              step={step}
              picked={picked}
              setPicked={(n) => {
                if (answerState === "correct") return;
                // Picking again after an incorrect attempt resets the reveal
                // so the user can try again without the previous choice
                // being frozen as "wrong".
                if (answerState === "incorrect") setAnswerState("unanswered");
                setPicked(n);
              }}
              revealed={answerState !== "unanswered"}
              heartsOut={false}
            />

            {stepNeedsAnswer && answerState === "incorrect" && (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-[12px] leading-6 text-red-200">
                إجابة غير صحيحة — راجع القرائن وحاول مرة أخرى. التحقيقات لا تستهلك القلوب.
              </p>
            )}

            <div className="mt-4">
              {stepNeedsAnswer && answerState === "unanswered" && (
                <button
                  onClick={onConfirm}
                  disabled={picked == null}
                  className="flex w-full items-center justify-center rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                >
                  تأكيد الإجابة
                </button>
              )}
              {stepNeedsAnswer && answerState === "incorrect" && (
                <button
                  onClick={onRetry}
                  className="flex w-full items-center justify-center rounded-2xl border border-gold/40 bg-surface py-3 text-sm font-bold text-gold"
                >
                  أعد المحاولة
                </button>
              )}
              {(!stepNeedsAnswer || answerState === "correct") && (
                <button
                  onClick={onNext}
                  className="flex w-full items-center justify-center rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground"
                >
                  {isLast ? "إنهاء التحقيق" : "التالي"}
                </button>
              )}
            </div>
          </section>
        )}


        {finished && (
          <section className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5 text-center">
            <Trophy className="mx-auto size-7 text-gold" />
            <p className="font-display mt-2 text-lg font-bold text-gold">قضية محلولة!</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {resolvedIndices.size}/{totalQuestionLike} إجابات صحيحة
              {!alreadyDone && (
                <>
                  {reward.xp ? <> · <Star className="inline size-3" /> +{reward.xp}</> : null}
                  {reward.coins ? <> · <Coins className="inline size-3" /> +{reward.coins}</> : null}
                  {heartGain > 0 ? <> · <Heart className="inline size-3 text-rose-300" /> +{heartGain}</> : null}
                </>
              )}
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <Link to="/investigations" className="text-sm text-gold">قضية أخرى</Link>
              <Link to="/campaigns" className="text-xs text-muted-foreground">العودة للحملات</Link>
            </div>
          </section>
        )}
        <FeedbackCTA context={{ investigation_id: row.slug, title: row.title ?? "التحقيق" }} />
      </ReadingScale>
    </AppShell>


  );
}

function StepCard({
  step, picked, setPicked, revealed, heartsOut,
}: {
  step: InvestigationStep;
  picked: number | null;
  setPicked: (n: number) => void;
  revealed: boolean;
  heartsOut: boolean;
}) {
  if (step.type === "briefing") {
    return (
      <div className="rounded-2xl border border-gold/25 bg-surface p-4">
        <div className="inline-flex items-center gap-2 text-[10px] text-gold">
          <Lightbulb className="size-3.5" /> بداية القضية
        </div>
        {step.title && <p className="font-display mt-1 text-[14px] font-bold">{step.title}</p>}
        <p className="mt-2 whitespace-pre-line text-[13px] leading-7 text-foreground/90">{step.text}</p>
      </div>
    );
  }
  if (step.type === "evidence") {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
        <div className="inline-flex items-center gap-2 text-[10px] text-amber-300">
          <Search className="size-3.5" /> قرينة تاريخية
        </div>
        {step.title && <p className="font-display mt-1 text-[14px] font-bold">{step.title}</p>}
        <p className="mt-2 whitespace-pre-line text-[13px] leading-7 text-foreground/90">{step.text}</p>
      </div>
    );
  }
  if (step.type === "conclusion") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4">
        <div className="inline-flex items-center gap-2 text-[10px] text-emerald-300">
          <Trophy className="size-3.5" /> الخلاصة
        </div>
        {step.title && <p className="font-display mt-1 text-[14px] font-bold">{step.title}</p>}
        <p className="mt-2 whitespace-pre-line text-[13px] leading-7 text-foreground/90">{step.text}</p>
      </div>
    );
  }
  // question / decision
  const isQuestion = step.type === "question";
  const correctIndex = step.correctAnswer;
  return (
    <div className="rounded-2xl border border-gold/25 bg-surface p-4">
      <div className="inline-flex items-center gap-2 text-[10px] text-gold">
        {isQuestion ? <Lightbulb className="size-3.5" /> : <Lock className="size-3.5" />}
        {isQuestion ? "سؤال" : "قرار"}
      </div>
      <p className="font-display mt-2 text-[14px] font-bold leading-snug">{step.prompt}</p>
      <div className="mt-3 space-y-2">
        {step.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = typeof correctIndex === "number" && i === correctIndex;
          let style = "border-white/10 bg-background/60";
          if (revealed) {
            if (isCorrect) style = "border-emerald-500/60 bg-emerald-500/10";
            else if (isPicked) style = isQuestion ? "border-red-500/60 bg-red-500/10" : "border-gold/60 bg-gold/10";
          } else if (isPicked) style = "border-gold/60 bg-gold/10";
          return (
            <button
              key={i}
              disabled={revealed || (heartsOut && isQuestion)}
              onClick={() => setPicked(i)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-right text-[12px] transition ${style}`}
            >
              <span>{opt}</span>
              {revealed && isCorrect && <Check className="size-3.5 text-emerald-400" />}
              {revealed && isPicked && !isCorrect && isQuestion && <X className="size-3.5 text-red-400" />}
            </button>
          );
        })}
      </div>
      {revealed && step.explanation && (
        <p className="mt-3 rounded-xl border border-gold/20 bg-gold/5 p-3 text-[12px] leading-6 text-foreground/90">
          {step.explanation}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Legacy player (unchanged) — backward compatibility
// ============================================================
function LegacyInvestigationGame({ inv }: { inv: NonNullable<ReturnType<typeof getInvestigation>> }) {
  const {
    profile, completeInvestigation, awardBadge, findArtifact, unlockCharacter,
    buyHint, hintsRevealed, addDinars, recordStreakActivity,
  } = useProfile();
  const stashOrigin = useStashCurrentAsOrigin();


  const scope = investigationScopeKey(inv.id);
  const revealed = hintsRevealed(scope);
  const canonicalProgress = useCanonicalInvestigationProgress();
  const alreadyDone = canonicalProgress.matches(inv.id);

  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveals, setReveals] = useState<Record<string, boolean>>({});
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(alreadyDone);

  const q = inv.questions[qIndex];
  const isLastQuestion = qIndex >= inv.questions.length - 1;
  // Investigations never gate on hearts and never consume hearts.
  const totalReward = useMemo(() => inv.reward, [inv.reward]);

  const onSubmit = () => {
    if (picked == null || reveals[q.id]) return;
    const correct = picked === q.correctIndex;
    if (correct) setCorrectCount((c) => c + 1);
    setReveals((r) => ({ ...r, [q.id]: true }));
  };

  const onNext = () => {
    setPicked(null);
    if (!isLastQuestion) { setQIndex((i) => i + 1); return; }
    if (!alreadyDone) {
      const xp = Math.min(150, Math.max(0, totalReward.xp)); // economy cap
      completeInvestigation(inv.id, xp);
      // Phase 3A — canonical qualifying-activity call (server-authoritative).
      void recordStreakActivity("investigation", inv.id);
      const auto = Math.max(1, Math.floor(xp / 4));
      const cappedDinars = Math.min(50, Math.max(0, totalReward.dinars)); // coin cap
      const delta = Math.max(0, cappedDinars - auto);
      if (delta > 0) addDinars(delta);

      if (totalReward.badge) awardBadge(totalReward.badge);
      if (totalReward.artifact) findArtifact(totalReward.artifact);
      if (totalReward.character) unlockCharacter(totalReward.character);
    }
    setFinished(true);
  };

  return (
    <AppShell>
      <ReadingScale className="px-5 pt-6">

        <Link to="/investigations" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> كل التحقيقات
        </Link>

        <div className="mt-4 rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold">
            <Search className="size-3.5" /> تحقيق تاريخي
          </div>
          <h1 className="font-display mt-2 text-lg font-bold leading-snug">{inv.title}</h1>
          <p className="mt-2 text-[12px] leading-7 text-foreground/90">{inv.intro}</p>
        </div>

        {inv.encyclopediaRefs?.length ? (
          <section className="mt-5">
            <h2 className="font-display mb-2 text-sm font-bold">مراجع موسوعية</h2>
            <div className="flex flex-wrap gap-2">
              {inv.encyclopediaRefs.map((r) => (
                <Link
                  key={r.id}
                  to="/encyclopedia/entity/$id"
                  params={{ id: r.id }}
                  onClick={() => stashOrigin(`/encyclopedia/entity/${r.id}`)}
                  className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold hover:bg-gold/10"
                >

                  <BookOpen className="size-3" /> {r.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h2 className="font-display mb-2 text-sm font-bold">القرائن</h2>
          <ol className="space-y-2">
            {inv.clues.map((c, i) => (
              <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-gold/20 bg-gold/5 p-3 text-[12px] leading-6">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-gold text-[10px] font-bold text-primary-foreground">{i + 1}</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {inv.hints.length > 0 && !finished && (
          <section className="mt-5">
            <h2 className="font-display mb-2 text-sm font-bold">التلميحات</h2>
            <div className="space-y-2">
              {inv.hints.map((h, i) => {
                const open = i < revealed;
                const canBuy = i === revealed;
                return (
                  <div key={i} className={`rounded-2xl border p-3 text-[12px] ${open ? "border-gold/40 bg-gold/5" : "border-white/10 bg-surface"}`}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-gold">
                        <Lightbulb className="size-3.5" /> تلميح {i + 1}
                      </span>
                      {!open && (
                        <button
                          onClick={() => buyHint(scope, i, h.cost)}
                          disabled={!canBuy || profile.dinars < h.cost}
                          className="inline-flex items-center gap-1 rounded-full bg-gradient-gold px-2.5 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-40"
                        >
                          {canBuy ? <><Coins className="size-3" /> {h.cost}</> : <><Lock className="size-3" /> مقفل</>}
                        </button>
                      )}
                    </div>
                    {open && <p className="mt-2 leading-6 text-foreground/90">{h.text}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!finished && (
          <section className="mt-6">
            <h2 className="font-display mb-2 text-sm font-bold">
              السؤال {(qIndex + 1).toLocaleString("en-US")}/{inv.questions.length.toLocaleString("en-US")}
            </h2>
            <div className="rounded-2xl border border-gold/25 bg-surface p-4">
              <p className="font-display text-[14px] font-bold leading-snug">{q.question}</p>
              <div className="mt-3 space-y-2">
                {q.choices.map((c, i) => {
                  const isPicked = picked === i;
                  const isCorrect = i === q.correctIndex;
                  const revealedHere = reveals[q.id];
                  let style = "border-white/10 bg-background/60";
                  if (revealedHere) {
                    if (isCorrect) style = "border-emerald-500/60 bg-emerald-500/10";
                    else if (isPicked) style = "border-red-500/60 bg-red-500/10";
                  } else if (isPicked) style = "border-gold/60 bg-gold/10";
                  return (
                    <button
                      key={i}
                      disabled={!!reveals[q.id]}
                      onClick={() => setPicked(i)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-right text-[12px] transition ${style}`}
                    >
                      <span>{c}</span>
                      {reveals[q.id] && isCorrect && <Check className="size-3.5 text-emerald-400" />}
                      {reveals[q.id] && isPicked && !isCorrect && <X className="size-3.5 text-red-400" />}
                    </button>
                  );
                })}
              </div>
              {reveals[q.id] && q.explanation && (
                <p className="mt-3 rounded-xl border border-gold/20 bg-gold/5 p-3 text-[12px] leading-6 text-foreground/90">
                  {q.explanation}
                </p>
              )}
              <div className="mt-4">
                {!reveals[q.id] ? (
                  <button
                    onClick={onSubmit}
                    disabled={picked == null}
                    className="flex w-full items-center justify-center rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                  >
                    تأكيد الإجابة
                  </button>
                ) : (
                  <button
                    onClick={onNext}
                    className="flex w-full items-center justify-center rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground"
                  >
                    {isLastQuestion ? "إنهاء التحقيق" : "السؤال التالي"}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {finished && (
          <section className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5 text-center">
            <Trophy className="mx-auto size-7 text-gold" />
            <p className="font-display mt-2 text-lg font-bold text-gold">قضية محلولة!</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {correctCount}/{inv.questions.length} إجابات صحيحة
              {!alreadyDone && <> · +{totalReward.xp} نقطة · +{totalReward.dinars} دينار</>}
            </p>
            <Link to="/investigations" className="mt-4 inline-block text-sm text-gold">قضية أخرى</Link>
          </section>
        )}
      </ReadingScale>
    </AppShell>

  );
}
