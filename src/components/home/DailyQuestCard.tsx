import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Coins, Check, Target, BookOpen, ChevronLeft } from "lucide-react";
import {
  QUEST_UPDATED_EVENT,
  QUEST_COMPLETED_EVENT,
  ensureQuestPoolReady,
  entityTypeLabel,
  getTodayQuest,
  markQuestRewarded,
  type QuestState,
} from "@/lib/daily-quest";
import { useProfile } from "@/lib/profile";
import { useAccount } from "@/lib/account";
import { Reveal } from "@/components/motion/MotionPrimitives";

function vibrateOnce(): void {
  try {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator).vibrate === "function") {
      (navigator as Navigator).vibrate?.(12);
    }
  } catch { /* ignore */ }
}

function vibrateSuccess(): void {
  try {
    if (typeof navigator !== "undefined" && typeof (navigator as Navigator).vibrate === "function") {
      (navigator as Navigator).vibrate?.([20, 40, 30]);
    }
  } catch { /* ignore */ }
}

/** Home-screen "Goal of the Day" card driven by the Daily Quest system. */
export function DailyQuestCard() {
  const { user, loadingSession } = useAccount();
  const { addPoints, addDinars } = useProfile();

  const userKey = user?.id ?? "guest";

  const [state, setState] = useState<QuestState | null>(null);
  const [poolReady, setPoolReady] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const grantedRef = useRef(false);

  const refresh = useCallback(() => {
    setState(getTodayQuest(userKey));
  }, [userKey]);

  // Wait for the offline snapshot before finalizing selection so we don't
  // briefly show one entity and then replace it.
  useEffect(() => {
    let alive = true;
    ensureQuestPoolReady()
      .catch(() => { /* offline snapshot may be empty — nothing we can do */ })
      .finally(() => { if (alive) setPoolReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!poolReady || loadingSession) return;
    refresh();
    const onUpdate = () => refresh();
    const onCompleted = (e: Event) => {
      const next = (e as CustomEvent<QuestState>).detail;
      if (!next || next.rewarded) return;
      // Grant rewards ONCE per (userKey, day). Persisted flag prevents
      // any re-credit after refresh or cold restart.
      if (grantedRef.current) return;
      const rewarded = markQuestRewarded(userKey);
      if (rewarded && rewarded.rewarded) {
        grantedRef.current = true;
        addPoints(next.xp);
        addDinars(next.dinars);
        setCelebrate(true);
        vibrateSuccess();
        window.setTimeout(() => setCelebrate(false), 2600);
      }
    };
    window.addEventListener(QUEST_UPDATED_EVENT, onUpdate);
    window.addEventListener(QUEST_COMPLETED_EVENT, onCompleted as EventListener);

    // Refresh at local midnight so a new mission appears without a reload.
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const tid = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    return () => {
      window.removeEventListener(QUEST_UPDATED_EVENT, onUpdate);
      window.removeEventListener(QUEST_COMPLETED_EVENT, onCompleted as EventListener);
      window.clearTimeout(tid);
    };
  }, [userKey, poolReady, loadingSession, refresh, addPoints, addDinars]);

  const target = state?.target ?? null;
  const completed = !!state?.completed;
  const showSkeleton = !poolReady || (!state && !loadingSession);

  const entityHref = useMemo(() => {
    if (!target) return null;
    // Prefer slug where the route accepts either UUID or slug.
    return `/encyclopedia/entity/${encodeURIComponent(target.entitySlug || target.entityId)}`;
  }, [target]);

  if (loadingSession || showSkeleton) {
    return (
      <section className="mt-12 px-5">
        <div className="mb-3">
          <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
            <Target className="size-3.5" /> هدف اليوم
          </p>
          <h2 className="font-display mt-1 text-lg font-bold text-amber-50">مهمة اليوم</h2>
        </div>
        <div className="parchment-dark relative h-40 animate-pulse overflow-hidden rounded-3xl border border-gold/20" />
      </section>
    );
  }

  if (!state || !target || !entityHref) return null;

  const pct = Math.round((state.progress / Math.max(1, state.goal)) * 100);
  const typeLabel = entityTypeLabel(target.entityType);

  const CardInner = (
    <div
      className={`parchment-dark relative overflow-hidden rounded-3xl border p-5 shadow-elegant transition-transform duration-200 active:scale-[0.985] ${
        completed ? "border-emerald-400/40" : "border-gold/30 hover:border-gold/60"
      } ${celebrate ? "motion-unlock-glow" : ""}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(11,16,32,0.72) 0%, rgba(11,16,32,0.86) 100%), radial-gradient(120% 90% at 10% 0%, rgba(212,175,55,0.10), transparent 60%)",
      }}
    >
      {/* Decorative manuscript layer — very low opacity, dark navy overlay above. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-screen"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,225,170,0.30) 0px, rgba(255,225,170,0.30) 1px, transparent 1px, transparent 3px), radial-gradient(60% 40% at 80% 30%, rgba(212,175,55,0.25), transparent 60%), radial-gradient(50% 40% at 20% 80%, rgba(212,175,55,0.18), transparent 60%)",
        }}
      />
      <div className="arabesque-layer opacity-40" />
      <div
        className={`pointer-events-none absolute -left-10 -top-10 size-40 rounded-full blur-3xl ${
          completed ? "bg-emerald-400/15" : "bg-gold/20"
        }`}
      />

      <div className="relative">
        <div className="flex items-start gap-3">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl border bg-black/50 text-2xl ${
              completed ? "border-emerald-400/50" : "border-gold/50"
            }`}
            aria-hidden
          >
            {completed ? (
              <Check className="size-6 text-emerald-300" strokeWidth={2.5} />
            ) : (
              <BookOpen className="size-6 text-gold" strokeWidth={2} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[10px] tracking-[0.25em] ${completed ? "text-emerald-300/90" : "text-gold/85"}`}>
              {completed ? "تم إنجاز مهمة اليوم" : "📖 اقرأ اليوم"}
            </p>
            <h3
              className={`font-display mt-0.5 truncate text-lg font-bold ${
                completed ? "text-emerald-50" : "text-amber-50"
              }`}
            >
              {target.entityTitle}
            </h3>
            <p className={`mt-0.5 text-[11px] ${completed ? "text-emerald-200/75" : "text-white/60"}`}>
              {typeLabel} · {state.progress} / {state.goal}
            </p>
          </div>
          {!completed && (
            <ChevronLeft className="mt-1 size-5 shrink-0 text-gold/70" aria-hidden />
          )}
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
                : "border-gold/30 bg-black/40 text-gold"
            } ${celebrate ? "animate-scale-in" : ""}`}
          >
            <Sparkles className="size-3" /> +{state.xp} خبرة
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
              completed
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-gold/30 bg-black/40 text-gold"
            } ${celebrate ? "animate-scale-in" : ""}`}
          >
            <Coins className="size-3" /> +{state.dinars} دينار
          </span>
          <span
            className={`ms-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              completed
                ? "border border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                : "border border-gold/50 bg-gradient-gold text-primary-foreground shadow-gold"
            }`}
          >
            {completed ? (
              <>
                <Check className="size-3" strokeWidth={2.5} /> تم الإنجاز
              </>
            ) : (
              <>ابدأ القراءة</>
            )}
          </span>
        </div>
      </div>
    </div>
  );

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

        {completed ? (
          <div>{CardInner}</div>
        ) : (
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: target.entitySlug || target.entityId }}
            onClick={vibrateOnce}
            aria-label={`ابدأ القراءة: ${target.entityTitle}`}
            className="block cursor-pointer rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
          >
            {CardInner}
          </Link>
        )}
      </section>
    </Reveal>
  );
}
