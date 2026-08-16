import { useEffect, useRef, useState, useMemo } from "react";
import { Lightbulb, Check, Sparkles, ScrollText, UserCircle2, ShieldQuestion, HelpCircle, Coins } from "lucide-react";
import type { WhoAmIStage } from "@/lib/games/types";
import { AndroidSafeInput } from "@/components/AndroidSafeTextInput";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { sfx } from "./sfx";
import { useRegisterHelpOption } from "./help/GameHelpContext";
import { getRevealedState, purchaseWhoAmIHelp } from "@/lib/games/who-am-i-help";
import { letterClass } from "@/lib/games/answer-normalize";


import { AttemptsChip } from "./AttemptsChip";

interface Props {
  gameId?: string;
  retryNonce?: number;
  stage: WhoAmIStage;
  onComplete: (score: number) => void;
  onWrong?: () => void;
  attemptsLeft?: number;
  maxAttempts?: number;
}



function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[ًٌٍَُِّْـ]/g, "").replace(/[إأآ]/g, "ا").replace(/[ى]/g, "ي").replace(/[ة]/g, "ه");
}

const POTENTIAL_BY_REVEAL = [100, 70, 50] as const;

export function WhoAmIRenderer({ gameId, retryNonce = 0, stage, onComplete, onWrong, attemptsLeft, maxAttempts }: Props) {
  const [revealed, setRevealed] = useState(1);
  const [guess, setGuess] = useState("");
  const guessRef = useRef<HTMLInputElement | null>(null);
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [helpVersion, setHelpVersion] = useState(0);

  useEffect(() => { setRevealed(1); setGuess(""); setDone(false); setWrong(false); }, [stage]);


  const accepted = [stage.answer, ...(stage.acceptable ?? [])].map(normalize);
  const potential = POTENTIAL_BY_REVEAL[Math.min(revealed, 3) - 1];

  const submit = (raw?: string) => {
    const current = raw ?? guessRef.current?.value ?? guess;
    setGuess(current);
    const g = normalize(current);
    if (!g) return;
    if (accepted.some((a) => a === g || a.includes(g) || g.includes(a))) {
      setDone(true);
      sfx("correct");
      sfx("gold_unlock");
      const score = POTENTIAL_BY_REVEAL[Math.min(revealed, 3) - 1];
      onComplete(score);
    } else {
      setWrong(true);
      sfx("wrong");
      onWrong?.();
      setTimeout(() => setWrong(false), 800);
    }
  };


  const revealMore = () => {
    if (revealed < stage.hints.length) {
      setRevealed(revealed + 1);
      sfx("ink_write");
    }
  };

  // ── Help system integration ──────────────────────────────────────────
  const helpState = useMemo(() => {
    if (!gameId) return { revealedWords: [], revealedLetters: {} };
    return getRevealedState(gameId, retryNonce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, retryNonce, helpVersion]);

  const words = useMemo(() => stage.answer.trim().split(/\s+/), [stage.answer]);

  useRegisterHelpOption("whoami_reveal", gameId && !done ? {
    icon: words.length > 1 ? <ScrollText className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />,
    label: words.length > 1 ? "كشف كلمة" : "كشف حروف",
    description: words.length > 1 ? "اكشف إحدى كلمات الاسم مقابل 20 دينار." : "اكشف بعض حروف الاسم مقابل 20 دينار.",
    cost: 20,
    getAvailable: () => {
      if (words.length > 1) {
        return helpState.revealedWords.length < words.length - 1;
      }
      return (helpState.revealedLetters[0]?.length ?? 0) === 0;
    },
    perform: ({ pay }) => {
      const ok = purchaseWhoAmIHelp(gameId!, retryNonce, stage.answer, { pay });
      if (ok) {
        setHelpVersion(v => v + 1);
        sfx("gold_unlock");
      }
      return ok;
    }
  } : null);

  const renderVisualHelp = () => {
    if (words.length > 1) {
      return (
        <div className="flex flex-wrap gap-2 justify-center mb-4 dir-rtl" dir="rtl">
          {words.map((word, i) => {
            const isRevealed = helpState.revealedWords.includes(i);
            return (
              <span key={i} className={`px-2 py-1 rounded border ${isRevealed ? "border-amber-500/50 text-amber-100 bg-amber-500/10" : "border-slate-800 text-slate-600 bg-slate-900/40"}`}>
                {isRevealed ? word : "••••••"}
              </span>
            );
          })}
        </div>
      );
    } else {
      const word = words[0];
      const revealedPositions = helpState.revealedLetters[0] ?? [];
      if (revealedPositions.length === 0) return null;

      return (
        <div className="flex gap-1.5 justify-center mb-4 dir-rtl text-lg font-bold tracking-widest" dir="rtl">
          {Array.from(word).map((ch, i) => {
            const isRevealed = revealedPositions.includes(i);
            const isSpace = letterClass(ch) === "";
            if (isSpace) return <span key={i} className="w-2" />;
            return (
              <span key={i} className={`${isRevealed ? "text-amber-200" : "text-slate-700"}`}>
                {isRevealed ? ch : "•"}
              </span>
            );
          })}
        </div>
      );
    }
  };


  return (
    <div className="relative overflow-hidden irth-title-card p-5 sm:p-6">
      {/* Dossier header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-300/80">
          <ScrollText className="h-3.5 w-3.5" />
          ملف تاريخي
        </div>
        <div className="flex items-center gap-2">
          {typeof attemptsLeft === "number" && typeof maxAttempts === "number" && (
            <AttemptsChip attemptsLeft={attemptsLeft} total={maxAttempts} />
          )}
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            الإجابة الآن تمنحك {potential} خبرة
          </span>
        </div>
      </div>


      {/* Silhouette medallion */}
      <div className="mb-6 flex justify-center">
        <div className={`relative grid h-24 w-24 place-items-center rounded-full border border-amber-500/40 bg-gradient-to-br from-slate-900 to-slate-950 ${done ? "irth-unlock irth-gold-glow" : ""}`}>
          {done ? (
            <UserCircle2 className="h-14 w-14 text-amber-300" strokeWidth={1.2} />
          ) : (
            <ShieldQuestion className="h-12 w-12 text-amber-300/60" strokeWidth={1.2} />
          )}
        </div>
      </div>

      {/* Visual Help (Revealed words/letters) */}
      {!done && renderVisualHelp()}


      {/* Hints — revealed one by one */}
      <ul className="space-y-3">
        {stage.hints.slice(0, revealed).map((h, i) => (
          <li key={i} className="irth-reveal flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4"
              style={{ animationDelay: `${i * 60}ms` }}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-200">{i + 1}</span>
            <span className="text-[15px] leading-8 text-slate-100">{h}</span>
          </li>
        ))}
      </ul>

      {/* Reveal another */}
      {!done && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {revealed < stage.hints.length && (
            <button onClick={revealMore}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/10">
              <Lightbulb className="h-3.5 w-3.5" /> اكشف تلميحًا آخر
              <span className="text-amber-400/70">({revealed + 1}/{stage.hints.length})</span>
            </button>
          )}
          <span className="ms-auto text-[11px] text-slate-500">تلميح {revealed} من {stage.hints.length}</span>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {isAndroidNativeApp() ? (
          <input
            key={stage.answer}
            ref={guessRef}
            dir="rtl"
            type="text"
            defaultValue=""
            disabled={done}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="اكتب اسم الشخصية…"
            className={`flex-1 rounded-xl border bg-slate-950/80 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none ${
              wrong ? "border-red-500/60 irth-shake" : "border-slate-700 focus:border-amber-400"
            } ${done ? "border-emerald-500/40" : ""}`}
            style={{ transform: "none", filter: "none", backdropFilter: "none", transition: "none", animation: "none" }}
          />
        ) : (
          <AndroidSafeInput
            key={stage.answer}
            ref={guessRef}
            dir="rtl"
            value={guess}
            onValueChange={setGuess}
            commitMode="blur"
            onEnter={(next) => submit(next)}
            disabled={done}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="اكتب اسم الشخصية…"
            modalTitle="من أنا؟"
            modalLabel="اكتب اسم الشخصية التاريخية ثم اضغط حفظ"
            androidEntryKey={`game.whoAmI.${stage.answer}`}
            className={`flex-1 rounded-xl border bg-slate-950/80 px-4 py-3.5 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none ${
              wrong ? "border-red-500/60 irth-shake" : "border-slate-700 focus:border-amber-400"
            } ${done ? "border-emerald-500/40" : ""}`}
          />
        )}

        <button
          onClick={() => submit()}
          disabled={done}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50 sm:min-w-[140px]"
        >
          {done ? <><Sparkles className="h-4 w-4" /> صحيح</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
      </div>
      {!done && guess.trim().length === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">اكتب تخمينك ثم اضغط تحقق.</p>
      )}


      {done && (
        <div className="irth-reveal mt-5 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">الكشف الذهبي</p>
          <p className="mt-1 text-xl font-bold text-amber-100">{stage.answer}</p>
        </div>
      )}
    </div>
  );
}
