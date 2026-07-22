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
  markQuestCompletedAndRewardedFromServer,
  localDateKey,
  type QuestState,
} from "@/lib/daily-quest";
import {
  buildDailyQuestRewardKey,
  deriveStableDeltaId,
  grantDailyQuestReward,
  isDailyQuestRewardedOnServer,
} from "@/lib/daily-quest-reward";
import { useProfile } from "@/lib/profile";
import { useAccount } from "@/lib/account";
import { Reveal } from "@/components/motion/MotionPrimitives";

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch { return false; }
}

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

/** Subtle two-note "chime" synthesized with WebAudio so we don't ship
 *  an audio asset. Silent when the AudioContext can't start (autoplay
 *  policy on a cold restart with no interaction yet). */
function playSuccessChime(): void {
  try {
    if (typeof window === "undefined") return;
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") { void ctx.resume().catch(() => {}); }
    const now = ctx.currentTime;
    const notes = [ { f: 880, t: 0 }, { f: 1320, t: 0.12 } ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.14, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + 0.4);
    }
    window.setTimeout(() => { void ctx.close().catch(() => {}); }, 800);
  } catch { /* ignore */ }
}

interface RewardFloat {
  id: number;
  label: string;
  tone: "xp" | "dinar";
}

/** Home-screen "Goal of the Day" card driven by the Daily Quest system. */
export function DailyQuestCard() {
  const { user, loadingSession, syncing } = useAccount();
  const { profile, addPoints, addDinars, applyServerStats } = useProfile();

  const userKey = user?.id ?? "guest";

  const [state, setState] = useState<QuestState | null>(null);
  const [poolReady, setPoolReady] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [floats, setFloats] = useState<RewardFloat[]>([]);
  /** In-flight guard for the canonical RPC grant. Prevents two concurrent
   *  attempts from the same mount (event + mount reconciliation). Server
   *  idempotency (primary key on delta_id) still guarantees uniqueness
   *  across mounts, tabs, and devices. */
  const grantInflightRef = useRef<string | null>(null);
  const floatIdRef = useRef(0);
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const refresh = useCallback(() => {
    setState(getTodayQuest(userKey));
  }, [userKey]);

  // Load the offline snapshot once so selection doesn't flicker.
  useEffect(() => {
    let alive = true;
    ensureQuestPoolReady()
      .catch(() => { /* offline snapshot may be empty */ })
      .finally(() => { if (alive) setPoolReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!poolReady || loadingSession || syncing) return;
    refresh();
    // Reset the in-flight guard when the account changes so a fresh
    // sign-in can attempt its own reward RPC.
    grantInflightRef.current = null;

    /**
     * Canonical atomic reward grant.
     *
     * Server side: `apply_profile_delta` RPC — inserts the idempotency
     * row into `applied_profile_deltas (PRIMARY KEY delta_id)` AND
     * updates `profiles.xp + dinars` inside a single transaction. A
     * duplicate delta_id returns `{applied:false}` and mutates nothing,
     * so XP and dinars can never partially grant and can never be
     * granted twice.
     *
     * The delta_id is a deterministic UUIDv5-shape hash of a stable
     * reward key `daily_quest:<uid>:<localDate>:<entityId>` — every
     * attempt for the same (user, day, quest) collapses to the same
     * primary key regardless of device, mount, or online/offline.
     *
     * Client flow:
     *   • Guest (no user) → local-only path (keyed by localStorage
     *     `rewarded` flag on the persisted quest).
     *   • Signed-in → RPC. `granted` mirrors locally; `already_granted`
     *     re-syncs from `profiles` to avoid drift; `queued` leaves
     *     `rewarded=false` and will retry on the next mount / outbox
     *     flush event.
     */
    const playCelebration = (q: QuestState) => {
      const reduced = prefersReducedMotion();
      setCelebrate(true);
      vibrateSuccess();
      playSuccessChime();
      if (!reduced) {
        const idA = ++floatIdRef.current;
        const idB = ++floatIdRef.current;
        setFloats([
          { id: idA, tone: "xp", label: `+${q.xp} خبرة` },
          { id: idB, tone: "dinar", label: `+${q.dinars} دينار` },
        ]);
        window.setTimeout(() => setFloats([]), 2000);
      }
      window.setTimeout(() => setCelebrate(false), reduced ? 600 : 2600);
    };

    const grantReward = async (q: QuestState, opts: { force?: boolean } = {}) => {
      if (!q.completed) return;
      if (q.rewarded && !opts.force) return;
      if (!q.target) return;
      // Coalesce concurrent attempts for the same quest from the same
      // mount (event + mount reconciliation). Server idempotency still
      // guards cross-mount/cross-device duplicates.
      const entityId = q.target.entityId;
      if (grantInflightRef.current === entityId) return;
      grantInflightRef.current = entityId;
      const localDate = q.date || localDateKey();

      try {
        // Guest — no cloud account. Grant locally and use the localStorage
        // `rewarded` flag as the idempotency guard. If this guest later
        // signs in, the account's first daily-quest RPC call uses a fresh
        // `daily_quest:<uid>:...` delta_id the server has never seen, so
        // the historical guest grant does not double-credit the account.
        if (!user) {
          if (q.rewarded) return;
          addPoints(q.xp);
          addDinars(q.dinars);
          const rewarded = markQuestRewarded(userKey);
          if (rewarded?.rewarded) playCelebration(q);
          return;
        }

        const result = await grantDailyQuestReward({
          userId: user.id,
          localDate,
          entityId,
          xp: q.xp,
          dinars: q.dinars,
        });

        if (result.outcome === "granted") {
          // Server confirmed a first-time grant. Prefer the authoritative
          // post-RPC row so the HUD mirrors the same canonical economy state
          // stored in the backend. If that rehydrate is unavailable, mirror
          // locally as a last-resort visible update; the backend row remains
          // protected by the same delta_id.
          if (result.serverStats) {
            applyServerStats({
              xp: result.serverStats.xp,
              dinars: result.serverStats.dinars,
              hearts: result.serverStats.hearts,
              streak: result.serverStats.streak,
            });
          } else {
            addPoints(q.xp);
            addDinars(q.dinars);
          }
          const rewarded = markQuestRewarded(userKey);
          if (rewarded?.rewarded) playCelebration(q);
          return;
        }
        if (result.outcome === "already_granted") {
          // Server already had this delta. Re-sync authoritative stats
          // instead of adding locally, otherwise a device that lost its
          // localStorage `rewarded` flag would double-count client-side.
          if (!result.serverStats) return;
          applyServerStats({
            xp: result.serverStats.xp,
            dinars: result.serverStats.dinars,
            hearts: result.serverStats.hearts,
            streak: result.serverStats.streak,
          });
          markQuestRewarded(userKey);
          // No celebration on already_granted — it's a silent reconcile.
          return;
        }
        if (result.outcome === "queued") {
          // Offline / RPC failure. Keep `rewarded=false` so the next
          // mount or outbox-flush event retries. The queued item carries
          // the same stable delta_id, so eventual flush cannot duplicate.
          return;
        }
        // unauthenticated — the session lapsed between UI check and RPC.
        // Do nothing; next mount re-evaluates.
      } finally {
        grantInflightRef.current = null;
      }
    };

    // Reconcile on mount: if the article page completed the quest while
    // Home was unmounted, the persisted state has `completed=true` and
    // `rewarded=false` — attempt the canonical grant now.
    const initial = getTodayQuest(userKey);
    if (initial) void grantReward(initial);

    // Account-authoritative completion hydrator.
    // After reinstall + login, local `completed`/`rewarded` flags are gone
    // but the server still knows the reward was granted. If today's target
    // (deterministic per user+day+kind) matches a delta row already applied
    // on the server, restore the completed-checkmark UI without re-granting.
    let cancelledHydrate = false;
    if (user && initial?.target && (!initial.completed || !initial.rewarded)) {
      const target = initial.target;
      const localDate = initial.date || localDateKey();
      void (async () => {
        try {
          const applied = await isDailyQuestRewardedOnServer({
            userId: user.id,
            localDate,
            entityId: target.entityId,
          });
          if (cancelledHydrate) return;
          if (applied) {
            markQuestCompletedAndRewardedFromServer(userKey);
            refresh();
          }
        } catch { /* ignore — next mount / online event retries */ }
      })();
    }

    const onUpdate = () => {
      refresh();
      const cur = getTodayQuest(userKey);
      if (cur) void grantReward(cur);
    };
    const onCompleted = (e: Event) => {
      const next = (e as CustomEvent<QuestState>).detail;
      if (!next) return;
      void grantReward(next);
    };
    // Retry the RPC when the outbox drains — a queued attempt may have
    // just succeeded, in which case the server now returns
    // `already_granted` and we finalize local state + rewarded flag.
    const onOutboxFlushed = () => {
      const cur = getTodayQuest(userKey);
      if (cur && cur.completed && !cur.rewarded) void grantReward(cur);
    };

    window.addEventListener(QUEST_UPDATED_EVENT, onUpdate);
    window.addEventListener(QUEST_COMPLETED_EVENT, onCompleted as EventListener);
    window.addEventListener("irth:outbox:flushed", onOutboxFlushed);
    // Also retry when the browser regains connectivity.
    window.addEventListener("online", onOutboxFlushed);

    // Refresh at local midnight so a new mission appears without reload.
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const tid = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    return () => {
      window.removeEventListener(QUEST_UPDATED_EVENT, onUpdate);
      window.removeEventListener(QUEST_COMPLETED_EVENT, onCompleted as EventListener);
      window.removeEventListener("irth:outbox:flushed", onOutboxFlushed);
      window.removeEventListener("online", onOutboxFlushed);
      window.clearTimeout(tid);
    };
  }, [user, userKey, poolReady, loadingSession, syncing, refresh, addPoints, addDinars, applyServerStats]);

  const target = state?.target ?? null;
  const completed = !!state?.completed;
  const showSkeleton = !poolReady || (!state && !loadingSession);

  // Reference deltaId derivation so the stable-key module stays wired
  // (used by outbox reconciliation and any future retry surface). No
  // side effects — this is a no-op in production render paths.
  useEffect(() => {
    if (!state?.completed || !state.target) return;
    void deriveStableDeltaId(buildDailyQuestRewardKey({
      userId: user?.id ?? "guest",
      localDate: state.date || localDateKey(),
      entityId: state.target.entityId,
    })).catch(() => { /* ignore */ });
  }, [state, user]);

  // Anchor the exact recommended entity ID for navigation — never
  // recompute from anything else so hydration cannot re-roll it.
  const targetParamId = useMemo(() => {
    if (!target) return null;
    return target.entitySlug || target.entityId;
  }, [target]);

  if (loadingSession || showSkeleton) {
    return (
      <section className="mt-12 px-5">
        <div className="mb-3">
          <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
            <Target className="size-3.5" aria-hidden /> هدف اليوم
          </p>
          <h2 className="font-display mt-1 text-lg font-bold text-amber-50">مهمة اليوم</h2>
        </div>
        <div
          className="parchment-dark relative h-40 animate-pulse overflow-hidden rounded-3xl border border-gold/20"
          aria-hidden
        />
      </section>
    );
  }

  if (!state || !target || !targetParamId) return null;

  const pct = Math.round((state.progress / Math.max(1, state.goal)) * 100);
  const typeLabel = entityTypeLabel(target.entityType);

  const CardInner = (
    <div
      className={`parchment-dark relative overflow-hidden rounded-3xl border p-5 shadow-elegant transition-transform duration-200 motion-reduce:transition-none ${
        completed ? "border-emerald-400/40" : "border-gold/30 hover:border-gold/60 active:scale-[0.985]"
      } ${celebrate ? "motion-unlock-glow motion-reduce:animate-none" : ""}`}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(11,16,32,0.72) 0%, rgba(11,16,32,0.86) 100%), radial-gradient(120% 90% at 10% 0%, rgba(212,175,55,0.10), transparent 60%)",
      }}
    >
      {/* Manuscript layer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-screen"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,225,170,0.30) 0px, rgba(255,225,170,0.30) 1px, transparent 1px, transparent 3px), radial-gradient(60% 40% at 80% 30%, rgba(212,175,55,0.25), transparent 60%), radial-gradient(50% 40% at 20% 80%, rgba(212,175,55,0.18), transparent 60%)",
        }}
      />
      <div className="arabesque-layer opacity-40" aria-hidden />
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-10 -top-10 size-40 rounded-full blur-3xl ${
          completed ? "bg-emerald-400/15" : "bg-gold/20"
        }`}
      />

      {/* Golden shimmer sweep — only during the celebrate window and
          only when reduced motion is not requested. */}
      {celebrate && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl motion-reduce:hidden"
        >
          <div className="dq-shimmer absolute inset-y-0 -left-1/2 w-1/2" />
        </div>
      )}

      <div className="relative">
        <div className="flex items-start gap-3">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl border bg-black/50 text-2xl ${
              completed ? "border-emerald-400/50" : "border-gold/50"
            } ${celebrate ? "dq-pop motion-reduce:animate-none" : ""}`}
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
            className={`h-full transition-all motion-reduce:transition-none ${completed ? "bg-emerald-400" : "bg-gradient-gold"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
              completed
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-gold/30 bg-black/40 text-gold"
            }`}
          >
            <Sparkles className="size-3" aria-hidden /> +{state.xp} خبرة
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
              completed
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-gold/30 bg-black/40 text-gold"
            }`}
          >
            <Coins className="size-3" aria-hidden /> +{state.dinars} دينار
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
                <Check className="size-3" strokeWidth={2.5} aria-hidden /> تم الإنجاز
              </>
            ) : (
              <>ابدأ القراءة</>
            )}
          </span>
        </div>

        {/* Warm completed empty-state message. */}
        {completed && (
          <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/5 p-3 text-center">
            <p className="text-[13px] font-semibold text-emerald-100">أحسنت!</p>
            <p className="mt-0.5 text-[12px] text-emerald-200/85">
              أنجزت مهمة اليوم. عد غدًا لاكتشاف مهمة جديدة.
            </p>
          </div>
        )}
      </div>

      {/* Floating +XP / +Dinar reward chips. */}
      {floats.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-1 motion-reduce:hidden"
        >
          {floats.map((f, i) => (
            <span
              key={f.id}
              className={`dq-float rounded-full border px-3 py-1 text-[12px] font-bold shadow-gold ${
                f.tone === "xp"
                  ? "border-gold/60 bg-black/70 text-gold"
                  : "border-amber-300/60 bg-black/70 text-amber-200"
              }`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Tiny particle burst — six specks, GPU transform only. */}
      {celebrate && (
        <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`dq-spark absolute left-1/2 top-1/2 size-1 rounded-full bg-gold`}
              style={{ ["--dq-a" as string]: `${(i * 60)}deg`, animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Reveal>
      <section className="mt-12 px-5" aria-labelledby="daily-quest-heading">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
              <Target className="size-3.5" aria-hidden /> هدف اليوم
            </p>
            <h2 id="daily-quest-heading" className="font-display mt-1 text-lg font-bold text-amber-50">
              مهمة اليوم
            </h2>
            <p className="text-[12px] text-white/60">
              مهمة واحدة تتجدد كل يوم — أنجزها لتنال المكافأة.
            </p>
          </div>
        </div>

        {/* Screen-reader announcement of the reward event. */}
        <div className="sr-only" aria-live="polite" role="status">
          {celebrate ? `تم إنجاز مهمة اليوم. +${state.xp} خبرة و +${state.dinars} دينار.` : ""}
        </div>

        {completed ? (
          <div>
            {CardInner}
            <div className="mt-2 text-center">
              <Link
                to="/encyclopedia/entity/$id"
                params={{ id: targetParamId }}
                className="text-[12px] text-emerald-200/80 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                aria-label={`ارجع للمقال: ${target.entityTitle}`}
              >
                ارجع للمقال
              </Link>
            </div>
          </div>
        ) : (
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: targetParamId }}
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
