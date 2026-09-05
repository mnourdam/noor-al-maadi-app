import { useMemo, useState } from "react";
import { Check, X, Sparkles, HelpCircle, ScrollText } from "lucide-react";
import type { Quiz, QuizQuestion } from "@/lib/quiz-engine";
import {
  quizQuestionKey, chapterQuizKey, isQuestionAnsweredCorrectly,
} from "@/lib/quiz-engine";
import { useProfile } from "@/lib/profile";
import { sfx } from "@/components/games/sfx";
import { shuffleOptions } from "@/lib/campaigns/optionShuffle";

interface Props {
  campaignId: string;
  chapterId: string;
  quiz: Quiz;
  onPassed: () => void;
}

/**
 * Reusable quiz block. Data-only — works for any campaign / chapter that
 * attaches a Quiz definition. Awards XP per question (idempotent), grants
 * optional badges/unlocks, and signals overall pass via onPassed().
 */
export function ChapterQuiz({ campaignId, chapterId, quiz, onPassed }: Props) {
  const {
    profile, completeMission, awardBadge,
    unlockCharacter, findArtifact, unlockEra,
    loseHeartOnce, hasHearts,
  } = useProfile();

  const firstUnanswered = useMemo(
    () => quiz.questions.findIndex(q =>
      !isQuestionAnsweredCorrectly(profile.missionsCompleted, campaignId, chapterId, quiz, q.id),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quiz.id],
  );
  const [index, setIndex] = useState(firstUnanswered === -1 ? quiz.questions.length - 1 : firstUnanswered);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const q: QuizQuestion = quiz.questions[index];

  // V17-05 — presentation-time shuffle. `q.choices` / `q.correctIndex` are
  // never mutated; one mapping per active question, stable across
  // re-render, selection and reveal.
  const shuffled = useMemo(
    () => shuffleOptions(`${campaignId}:${chapterId}:${quiz.id}:${q.id}`, q.choices, q.correctIndex),
    [campaignId, chapterId, quiz.id, q.id, q.choices, q.correctIndex],
  );
  const displayChoices = shuffled.options;
  const displayCorrectIndex = shuffled.correctIndex;
  const totalAnswered = quiz.questions.filter(qq =>
    isQuestionAnsweredCorrectly(profile.missionsCompleted, campaignId, chapterId, quiz, qq.id),
  ).length;
  const allPassed = totalAnswered === quiz.questions.length;

  const submit = () => {
    if (picked == null) return;
    // PR1: guard against double-tap / re-render races on submit.
    if (revealed) return;
    if (!hasHearts()) return;
    setRevealed(true);
    if (picked === displayCorrectIndex) {
      sfx("correct", `quiz:${campaignId}:${chapterId}:${quiz.id}:${q.id}`);
      completeMission(quizQuestionKey(campaignId, chapterId, quiz.id, q.id), q.xp);
      if (q.badgeId) awardBadge(q.badgeId);
      q.unlock?.characters?.forEach(unlockCharacter);
      q.unlock?.artifacts?.forEach(findArtifact);
      q.unlock?.states?.forEach(unlockEra);
    } else {
      sfx("wrong", `quiz:${campaignId}:${chapterId}:${quiz.id}:${q.id}`);
      // Idempotent: same key won't decrement twice if React fires submit
      // twice for the same question/attempt.
      loseHeartOnce(`quiz:${campaignId}:${chapterId}:${quiz.id}:${q.id}`);
    }
  };


  const next = () => {
    setPicked(null);
    setRevealed(false);
    if (index < quiz.questions.length - 1) {
      setIndex(index + 1);
    } else {
      // mark quiz as passed once
      completeMission(chapterQuizKey(campaignId, chapterId, quiz.id), 0);
      onPassed();
    }
  };

  if (allPassed) {
    return (
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
        <Check className="mx-auto size-5 text-gold" />
        <p className="font-display mt-2 text-sm font-bold text-gold">اجتزتَ اختبار هذا الفصل</p>
        <button
          onClick={onPassed}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          <Sparkles className="size-3.5" /> متابعة
        </button>
      </div>
    );
  }

  const correct = revealed && picked === displayCorrectIndex;
  const wrong = revealed && picked !== displayCorrectIndex;

  return (
    <div className="rounded-2xl border border-gold/30 bg-gradient-to-b from-amber-900/15 via-surface to-stone-900/20 p-5">
      {!hasHearts() && !revealed && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-100">
          نفدت قلوبك. انتظر استرداد قلب أو استخدم نشاطًا تعليميًا لاستعادته قبل المتابعة.
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold/80">
        <HelpCircle className="size-3.5" />
        {quiz.title ?? "اختبار الفصل"} · سؤال {(index + 1).toLocaleString("en-US")}/{quiz.questions.length.toLocaleString("en-US")}
      </div>
      <p className="font-display mt-3 text-[14px] font-bold leading-snug text-foreground">
        {q.question}
      </p>
      <div className="mt-4 space-y-2">
        {displayChoices.map((c, i) => {
          const isPicked = picked === i;
          const isCorrect = i === displayCorrectIndex;
          let style = "border-white/10 bg-surface/60";
          if (revealed) {
            if (isCorrect) style = "border-emerald-500/60 bg-emerald-500/10";
            else if (isPicked) style = "border-red-500/60 bg-red-500/10";
          } else if (isPicked) {
            style = "border-gold/60 bg-gold/10";
          }
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => setPicked(i)}
              className={`w-full rounded-xl border px-3 py-2.5 text-right text-[12px] transition ${style}`}
            >
              <span className="font-display ms-2 text-gold/70">
                {String.fromCharCode(0x0623 + i)}.
              </span>
              {c}
              {revealed && isCorrect && <Check className="float-left size-3.5 text-emerald-400" />}
              {revealed && isPicked && !isCorrect && <X className="float-left size-3.5 text-red-400" />}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div
          className={`mt-4 rounded-xl border p-3 text-[12px] leading-relaxed ${
            correct ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-100"
                    : "border-red-500/40 bg-red-500/5 text-red-100"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] font-bold">
            {correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            {correct ? `إجابة صحيحة · +${q.xp} نقطة` : "إجابة غير صحيحة"}
          </div>
          {q.explanation && (
            <p className="mt-1.5 flex gap-2 text-foreground/90">
              <ScrollText className="mt-0.5 size-3.5 shrink-0 text-gold/80" />
              <span>{q.explanation}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        {!revealed ? (
          <button
            onClick={submit}
            disabled={picked == null}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            تأكيد الإجابة
          </button>
        ) : wrong ? (
          <button
            onClick={() => { setPicked(null); setRevealed(false); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 py-3 text-sm font-bold text-gold"
          >
            حاول مرّةً أخرى
          </button>
        ) : (
          <button
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground"
          >
            {index < quiz.questions.length - 1 ? "السؤال التالي" : "إنهاء الاختبار"}
          </button>
        )}
      </div>
    </div>
  );
}