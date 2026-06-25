import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Feather, Hourglass, ScrollText, Link2, Archive,
  Sparkles, Coins, Clock, Package, ChevronLeft, Trophy, Play,
} from "lucide-react";
import {
  selectDailyChallenges,
  fetchMyCompletedGameIds,
  type GameRow,
} from "@/lib/games/store";
import { MODE_LABELS_AR, type GameMode } from "@/lib/games/types";
import { extractMuseumUnlocks } from "@/lib/games/museumUnlocks";

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
}: {
  game: GameRow;
  variant: "primary" | "secondary";
}) {
  const Icon = MODE_ICON[game.mode];
  const unlocks = extractMuseumUnlocks({
    metadata: game.metadata,
  }).length;
  const isPrimary = variant === "primary";
  return (
    <Link
      to="/games/$mode/$slug"
      params={{ mode: game.mode, slug: game.slug }}
      className={`group relative block overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-[#0b1428] via-[#0d1a33] to-[#0a1024] shadow-elegant transition active:scale-[0.99] ${
        isPrimary ? "p-5" : "p-4"
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_20%_30%,#f5c97a_0,transparent_45%),radial-gradient(circle_at_80%_70%,#f5c97a_0,transparent_40%)]" />
      <div className="relative flex items-start gap-3">
        <div className={`grid place-items-center rounded-2xl border border-gold/40 bg-black/40 ${isPrimary ? "size-12" : "size-10"}`}>
          <Icon className={`${isPrimary ? "size-6" : "size-5"} text-gold`} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-[0.25em] text-gold/80">
            {MODE_LABELS_AR[game.mode]}
          </p>
          <h3 className={`font-display mt-0.5 truncate font-bold text-amber-50 ${isPrimary ? "text-base" : "text-sm"}`}>
            {game.title}
          </h3>
          {isPrimary && game.description && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-white/65">
              {game.description}
            </p>
          )}
        </div>
        {difficultyDots(game.difficulty)}
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

      {isPrimary && (
        <div className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition group-hover:bg-gold/25">
          <Play className="size-4" /> ابدأ التحدي
        </div>
      )}
      {!isPrimary && (
        <div className="relative mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-gold">
          ابدأ التحدي <ChevronLeft className="size-3.5" />
        </div>
      )}
    </Link>
  );
}

export function DailyChallengesSection() {
  const [picks, setPicks] = useState<GameRow[] | null>(null);
  const [allCompleted, setAllCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const completed = await fetchMyCompletedGameIds();
      const sel = await selectDailyChallenges(2, { excludeIds: completed });
      if (cancelled) return;
      setPicks(sel.picks);
      setAllCompleted(sel.allCompleted);
    })().catch(() => {
      if (!cancelled) setPicks([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide entirely while loading or when there is no published content.
  if (picks === null) return null;
  if (!picks.length && !allCompleted) return null;

  return (
    <section className="mt-6 px-5">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.3em] text-gold/80">
            <Trophy className="size-3.5" /> تحديا اليوم
          </p>
          <h2 className="font-display mt-1 text-lg font-bold text-amber-50">
            تحديا اليوم
          </h2>
          <p className="text-[12px] text-white/60">
            لعبتان تاريخيتان تتجددان يوميًا من قاعة التحديات.
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
        <div className="parchment-dark relative overflow-hidden rounded-3xl border border-gold/30 p-5 text-center shadow-elegant">
          <div className="arabesque-layer opacity-50" />
          <div className="relative">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-gold/40 bg-black/40">
              <Trophy className="size-6 text-gold" strokeWidth={1.5} />
            </div>
            <h3 className="font-display mt-3 text-base font-bold text-amber-50">أحسنت!</h3>
            <p className="mt-1 text-[12px] leading-6 text-white/70">
              لقد أنهيت جميع التحديات التاريخية الحالية.
              <br />
              ستظهر تحديات جديدة فور إضافتها.
            </p>
            <Link
              to="/adventure"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-[12px] font-semibold text-amber-100 hover:bg-gold/20"
            >
              استكشف الحملات <ChevronLeft className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : picks.length === 1 ? (
        <ChallengeCard game={picks[0]} variant="primary" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div className="sm:col-span-3">
            <ChallengeCard game={picks[0]} variant="primary" />
          </div>
          <div className="sm:col-span-2">
            <ChallengeCard game={picks[1]} variant="secondary" />
          </div>
        </div>
      )}
    </section>
  );
}
