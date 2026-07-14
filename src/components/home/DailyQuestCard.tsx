import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Coins, Check, Target } from "lucide-react";
import {
  QUEST_UPDATED_EVENT,
  QUEST_COMPLETED_EVENT,
  type QuestKind,
  type QuestState,
  advanceQuest,
  getTodayQuest,
  markQuestRewarded,
  questLabel,
} from "@/lib/daily-quest";
import { useProfile } from "@/lib/profile";
import { useAccount } from "@/lib/account";
import { Reveal } from "@/components/motion/MotionPrimitives";

/** Home-screen "Goal of the Day" card driven by the Daily Quest system. */
export function DailyQuestCard() {
  const { user } = useAccount();
  const { addPoints, addDinars } = useProfile();

  // A stable key so guest and each account get their own persistent quest.
  const userKey = user?.id ?? "guest";

  const [state, setState] = useState<QuestState | null>(null);

  const refresh = useCallback(() => {
    setState(getTodayQuest(userKey));
  }, [userKey]);

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: QuestKind; delta?: number }>).detail;
      if (!detail?.kind) return;
      const { state: next, justCompleted } = advanceQuest(userKey, detail.kind, detail.delta ?? 1);
      setState(next);
      if (justCompleted) {
        // Grant rewards ONCE. `markQuestRewarded` is a persistent flag so
        // refreshes/APK reopens do not re-credit.
        const rewarded = markQuestRewarded(userKey);
        if (!state?.rewarded && rewarded.rewarded) {
          addPoints(next.xp);
          addDinars(next.dinars);
        }
        try {
          window.dispatchEvent(new CustomEvent(QUEST_COMPLETED_EVENT, { detail: next }));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener(QUEST_UPDATED_EVENT, onUpdate);
    window.addEventListener("irth:daily-quest:progress", onProgress as EventListener);
    // Refresh at local midnight so a new mission appears without a reload.
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const tid = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    return () => {
      window.removeEventListener(QUEST_UPDATED_EVENT, onUpdate);
      window.removeEventListener("irth:daily-quest:progress", onProgress as EventListener);
      window.clearTimeout(tid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  const label = useMemo(() => (state ? questLabel(state.kind) : null), [state]);

  if (!state || !label) return null;

  const pct = Math.round((state.progress / Math.max(1, state.target)) * 100);
  const completed = state.completed;

  return (
    <Reveal>
      <section className="mt-12 px-5">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
              <Target className="size-3.5" /> هدف اليوم
            </p>
            <h2 className="font-display mt-1 text-lg font-bold text-amber-50">
              مهمة اليوم
            </h2>
            <p className="text-[12px] text-white/60">
              مهمة واحدة تتجدد كل يوم — أنجزها لتنال المكافأة.
            </p>
          </div>
        </div>

        <div
          className={`parchment-dark relative overflow-hidden rounded-3xl border p-5 shadow-elegant ${
            completed ? "border-emerald-400/40 motion-unlock-glow" : "border-gold/30"
          }`}
        >
          <div className="arabesque-layer opacity-60" />
          <div
            className={`pointer-events-none absolute -left-10 -top-10 size-40 rounded-full blur-3xl ${
              completed ? "bg-emerald-400/15" : "bg-gold/15"
            }`}
          />
          <div className="relative">
            <div className="flex items-start gap-3">
              <div
                className={`grid size-12 place-items-center rounded-2xl border bg-black/40 text-2xl ${
                  completed ? "border-emerald-400/50" : "border-gold/40"
                }`}
                aria-hidden
              >
                {completed ? (
                  <Check className="size-6 text-emerald-300" strokeWidth={2.5} />
                ) : (
                  <span>{label.emoji}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] tracking-[0.25em] ${completed ? "text-emerald-300/90" : "text-gold/80"}`}>
                  {completed ? "تم إنجاز هدف اليوم" : "مهمة اليوم"}
                </p>
                <h3
                  className={`font-display mt-0.5 text-base font-bold ${
                    completed ? "text-emerald-50" : "text-amber-50"
                  }`}
                >
                  {label.title}
                </h3>
                <p className={`mt-1 text-[12px] ${completed ? "text-emerald-200/80" : "text-white/65"}`}>
                  {state.progress} / {state.target}
                </p>
              </div>
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all ${completed ? "bg-emerald-400" : "bg-gradient-gold"}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                  completed
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-gold/30 bg-black/30 text-gold"
                }`}
              >
                <Sparkles className="size-3" /> +{state.xp} خبرة
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                  completed
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-gold/30 bg-black/30 text-gold"
                }`}
              >
                <Coins className="size-3" /> +{state.dinars} دينار
              </span>
              {completed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                  <Check className="size-3" strokeWidth={2.5} /> اكتملت المكافأة
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
