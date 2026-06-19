import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Lightbulb, ChevronRight, Check, X, Trophy, Coins, BookOpen, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getInvestigation, investigationScopeKey } from "@/lib/investigations";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/investigation/$id")({
  head: () => ({ meta: [{ title: "تحقيق تاريخي" }] }),
  component: InvestigationPage,
});

function InvestigationPage() {
  const { id } = useParams({ from: "/investigation/$id" });
  const inv = getInvestigation(id);

  if (!inv) {
    return (
      <AppShell>
        <div className="px-5 pt-20 text-center text-muted-foreground">القضية غير موجودة.</div>
      </AppShell>
    );
  }

  return <InvestigationGame key={inv.id} inv={inv} />;
}

function InvestigationGame({ inv }: { inv: NonNullable<ReturnType<typeof getInvestigation>> }) {
  const {
    profile, completeInvestigation, awardBadge, findArtifact, unlockCharacter,
    buyHint, hintsRevealed, loseHeart, hasHearts, addDinars,
  } = useProfile();

  const scope = investigationScopeKey(inv.id);
  const revealed = hintsRevealed(scope);
  const alreadyDone = profile.investigationsCompleted.includes(inv.id);

  const [qIndex, setQIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveals, setReveals] = useState<Record<string, boolean>>({});
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(alreadyDone);

  const q = inv.questions[qIndex];
  const isLastQuestion = qIndex >= inv.questions.length - 1;
  const heartsOut = !hasHearts();
  const totalReward = useMemo(() => inv.reward, [inv.reward]);

  const onSubmit = () => {
    if (picked == null || reveals[q.id]) return;
    if (heartsOut) return;
    const correct = picked === q.correctIndex;
    if (!correct) loseHeart();
    else setCorrectCount((c) => c + 1);
    setReveals((r) => ({ ...r, [q.id]: true }));
  };

  const onNext = () => {
    setPicked(null);
    if (!isLastQuestion) { setQIndex((i) => i + 1); return; }
    if (!alreadyDone) {
      completeInvestigation(inv.id, totalReward.xp);
      const auto = Math.max(1, Math.floor(totalReward.xp / 4));
      const delta = Math.max(0, totalReward.dinars - auto);
      if (delta > 0) addDinars(delta);
      if (totalReward.badge) awardBadge(totalReward.badge);
      if (totalReward.artifact) findArtifact(totalReward.artifact);
      if (totalReward.character) unlockCharacter(totalReward.character);
    }
    setFinished(true);
  };

  return (
    <AppShell>
      <div className="px-5 pt-6">
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
              السؤال {(qIndex + 1).toLocaleString("ar-EG")}/{inv.questions.length.toLocaleString("ar-EG")}
            </h2>
            {heartsOut && (
              <div className="mb-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-100">
                نفدت قلوبك. انتظر استرداد قلب أو استخدم نشاطًا تعليميًا لاستعادته.
              </div>
            )}
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
                      disabled={!!reveals[q.id] || heartsOut}
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
                    disabled={picked == null || heartsOut}
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
      </div>
    </AppShell>
  );
}