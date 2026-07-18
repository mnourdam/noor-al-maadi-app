import { Link } from "@tanstack/react-router";
import {
  Feather, Hourglass, ScrollText, Link2, Archive,
  Sparkles, Coins, Clock, Package, ChevronLeft, Trophy, Play, Check,
} from "lucide-react";
import { type GameRow } from "@/lib/games/store";
import { MODE_LABELS_AR, type GameMode } from "@/lib/games/types";
import { extractMuseumUnlocks } from "@/lib/games/museumUnlocks";
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { Reveal, Stagger } from "@/components/motion/MotionPrimitives";
import { useDailyChallengeState } from "@/lib/games/dailyChallengeService";

const MODE_ICON: Record<GameMode, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  crossword: Feather,
  chronology: Hourglass,
  who_am_i: ScrollText,
  connections: Link2,
  memory: Archive,
};

function timerMinutes(g: GameRow): number {
  const meta = (g.metadata ?? {}) as Record<string, unknown>;
  const sec = typeof meta.timer_seconds === "number" ? meta.timer_seconds : null;
  if (sec && sec > 0) return Math.max(1, Math.round(sec / 60));
  return g.estimated_time;
}

function difficultyDots(d: number) {
  const dots = Math.max(1, Math.min(5, d));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`صعوبة ${dots} من 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full ${i < dots ? "bg-gold" : "bg-white/15"}`}
        />
      ))}
    </span>
  );
}

function ChallengeCard({
  game,
  variant,
  completed,
}: {
  game: GameRow;
  variant: "primary" | "secondary";
  completed: boolean;
}) {
  const Icon = MODE_ICON[game.mode];
  const unlocks = extractMuseumUnlocks({
    metadata: game.metadata,
  }).length;
  const isPrimary = variant === "primary";

  const baseClass = `motion-tap group relative block overflow-hidden rounded-3xl border shadow-elegant transition active:scale-[0.99] ${
    isPrimary ? "p-5" : "p-4"
  } ${
    completed
      ? "border-emerald-400/40 bg-gradient-to-br from-[#0a1a14] via-[#0c2018] to-[#08120e] motion-unlock-glow"
      : "border-gold/30 bg-gradient-to-br from-[#0b1428] via-[#0d1a33] to-[#0a1024]"
  }`;

  const inner = (
    <>
      <div
        className={`pointer-events-none absolute -right-10 -top-12 size-40 rounded-full blur-3xl ${
          completed ? "bg-emerald-400/15" : "bg-gold/15"
        }`}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_20%_30%,#f5c97a_0,transparent_45%),radial-gradient(circle_at_80%_70%,#f5c97a_0,transparent_40%)]" />

      {completed && (
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
          <Check className="size-3" strokeWidth={2.5} /> تم الإنجاز
        </div>
      )}

      <div className="relative flex items-start gap-3">
        <div
          className={`grid place-items-center rounded-2xl border bg-black/40 ${
            isPrimary ? "size-12" : "size-10"
          } ${completed ? "border-emerald-400/50" : "border-gold/40"}`}
        >
          {completed ? (
            <Check
              className={`${isPrimary ? "size-6" : "size-5"} text-emerald-300`}
              strokeWidth={2.5}
            />
          ) : (
            <Icon
              className={`${isPrimary ? "size-6" : "size-5"} text-gold`}
              strokeWidth={1.5}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[10px] tracking-[0.25em] ${
              completed ? "text-emerald-300/90" : "text-gold/80"
            }`}
          >
            {MODE_LABELS_AR[game.mode]}
          </p>
          <h3
            className={`font-display mt-0.5 truncate font-bold ${
              completed ? "text-emerald-50" : "text-amber-50"
            } ${isPrimary ? "text-base" : "text-sm"}`}
          >
            {game.title}
          </h3>
          {isPrimary && game.description && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-white/65">
              {game.description}
            </p>
          )}
        </div>
        {!completed && difficultyDots(game.difficulty)}
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-[10px] text-gold/90">
          <Clock className="size-3" /> {timerMinutes(game)} د
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-[10px] text-gold/90">
          <Sparkles className="size-3" /> {game.xp_reward} خبرة
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-[10px] text-gold/90">
          <Coins className="size-3" /> {game.coin_reward} دينار
        </span>
        {unlocks > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
            <Package className="size-3" /> {unlocks} مقتنى
          </span>
        )}
      </div>

      {completed ? (
        <div
          className={`relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 ${
            !isPrimary && "py-2 text-[12px]"
          }`}
        >
          <Check className="size-4" strokeWidth={2.5} /> أُنجز اليوم
        </div>
      ) : isPrimary ? (
        <div className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition group-hover:bg-gold/25">
          <Play className="size-4" /> ابدأ التحدي
        </div>
      ) : (
        <div className="relative mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-gold">
          ابدأ التحدي <ChevronLeft className="size-3.5" />
        </div>
      )}
    </>
  );

  if (completed) {
    return (
      <div className={baseClass} aria-disabled="true">
        {inner}
      </div>
    );
  }

  return (
    <Link
      to="/games/$mode/$slug"
      params={{ mode: game.mode, slug: game.slug }}
      className={baseClass}
    >
      {inner}
    </Link>
  );
}

/**
 * Read/write today's frozen challenge pick IDs.
 *
 * We persist the chosen game IDs per (userKey, localDate) so that once
 * the player completes today's picks, refreshing does not roll two new
 * challenges. The player must return the next local day to see fresh
 * picks. At the next day rollover the entry is stale and a new pick set
 * is generated using selectDailyChallenges (which still excludes every
 * all-time completed challenge).
 */
function frozenPicksKey(userKey: string, date: string): string {
  return `irth.daily-challenges.${userKey}.${date}`;
}

function readFrozenPickIds(userKey: string, date: string): string[] | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(frozenPicksKey(userKey, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch { return null; }
}

function writeFrozenPickIds(userKey: string, date: string, ids: string[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(frozenPicksKey(userKey, date), JSON.stringify(ids));
  } catch { /* ignore */ }
}

export function DailyChallengesSection() {
  const androidStable = isAndroidUltraStableMode();
  const [picks, setPicks] = useState<GameRow[] | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [allCompleted, setAllCompleted] = useState(false);
  const [todaysPicksDone, setTodaysPicksDone] = useState(false);

  useEffect(() => {
    if (androidStable) return;
    let cancelled = false;
    (async () => {
      const [{ data: u }, allTimeCompleted, todayCompleted, published] = await Promise.all([
        supabase.auth.getUser(),
        fetchMyCompletedGameIds(),
        fetchMyDailyCompletedGameIds(),
        listPublishedGames(),
      ]);
      const userKey = u.user?.id ?? "guest";
      const date = localDateKey();

      // Try to hydrate today's frozen picks first.
      const frozenIds = readFrozenPickIds(userKey, date);
      let finalPicks: GameRow[] = [];
      let allDone = false;

      if (frozenIds && frozenIds.length > 0) {
        const byId = new Map(published.map((g) => [g.id, g]));
        finalPicks = frozenIds.map((id) => byId.get(id)).filter((g): g is GameRow => !!g);
      }

      if (finalPicks.length === 0) {
        // First visit today (or stale/missing frozen picks) — select fresh.
        const sel = await selectDailyChallenges(2, { completedIds: allTimeCompleted });
        finalPicks = sel.picks;
        allDone = sel.allCompleted;
        if (finalPicks.length > 0) {
          writeFrozenPickIds(userKey, date, finalPicks.map((g) => g.id));
        }
      }

      // Today's picks are "done" when every frozen pick is in the all-time
      // completed set (they've been completed at any point — the frozen
      // list is regenerated tomorrow).
      const picksDone =
        finalPicks.length > 0 &&
        finalPicks.every((g) => allTimeCompleted.has(g.id));

      if (cancelled) return;
      setCompletedIds(todayCompleted);
      setPicks(finalPicks);
      setAllCompleted(allDone);
      setTodaysPicksDone(picksDone);
    })().catch(() => {
      if (!cancelled) setPicks([]);
    });
    return () => {
      cancelled = true;
    };
  }, [androidStable]);

  if (picks === null) return null;
  if (!picks.length && !allCompleted) return null;

  return (
    <section className="mt-6 px-5 sm:px-6 md:px-8">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
            <Trophy className="size-3.5" /> تحدي اليوم
          </p>
          <h2 className="font-display mt-1 text-lg font-bold text-amber-50">
            تحدي اليوم
          </h2>
          <p className="text-[12px] text-white/60">
            تحديان مختلفان يتجددان يوميًا.
          </p>
        </div>
        <Link
          to="/adventure"
          className="inline-flex items-center gap-1 text-[12px] text-gold/90 hover:text-gold"
        >
          القاعة <ChevronLeft className="size-3.5" />
        </Link>
      </div>

      {allCompleted ? (
        <Reveal>
          <div className="parchment-dark relative overflow-hidden rounded-3xl border border-emerald-400/30 p-5 text-center shadow-elegant motion-unlock-glow">
            <div className="arabesque-layer opacity-50" />
            <div className="relative">
              <div className="mx-auto grid size-12 place-items-center rounded-full border border-emerald-400/50 bg-emerald-500/15">
                <Trophy className="size-6 text-emerald-300" strokeWidth={1.5} />
              </div>
              <h3 className="font-display mt-3 text-base font-bold text-emerald-50">أحسنت!</h3>
              <p className="mt-1 text-[12px] leading-6 text-white/70">
                لقد أنهيت جميع التحديات المتاحة.
                <br />
                ترقّب تحديات جديدة قريبًا.
              </p>
            </div>
          </div>
        </Reveal>
      ) : todaysPicksDone ? (
        <Reveal>
          <div className="parchment-dark relative overflow-hidden rounded-3xl border border-emerald-400/30 p-5 text-center shadow-elegant motion-unlock-glow">
            <div className="arabesque-layer opacity-50" />
            <div className="relative">
              <div className="mx-auto grid size-12 place-items-center rounded-full border border-emerald-400/50 bg-emerald-500/15">
                <Check className="size-6 text-emerald-300" strokeWidth={2} />
              </div>
              <h3 className="font-display mt-3 text-base font-bold text-emerald-50">
                لقد أتممت تحديات اليوم.
              </h3>
              <p className="mt-1 text-[12px] leading-6 text-white/70">
                عد غدًا لاكتشاف تحديات جديدة.
              </p>
            </div>
          </div>
        </Reveal>
      ) : picks.length === 1 ? (
        <ChallengeCard
          game={picks[0]}
          variant="primary"
          completed={completedIds.has(picks[0].id)}
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:gap-4 md:gap-5" max={2}>
          <div className="sm:col-span-3">
            <ChallengeCard
              game={picks[0]}
              variant="primary"
              completed={completedIds.has(picks[0].id)}
            />
          </div>
          <div className="sm:col-span-2">
            <ChallengeCard
              game={picks[1]}
              variant="secondary"
              completed={completedIds.has(picks[1].id)}
            />
          </div>
        </Stagger>
      )}
    </section>
  );
}
