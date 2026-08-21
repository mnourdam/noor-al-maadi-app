// ============================================================
// StoriesRail — horizontal Home-page rail (P4.1)
// ------------------------------------------------------------
// Priority: resume → newly unlocked → completed → locked.
// Hidden entirely when zero published stories exist (avoids
// polluting Home with an empty rail).
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ArrowLeft } from "lucide-react";
import { listStoriesSummary, pickHomeStories } from "@/lib/stories/summary";
import { StoryCard } from "@/components/stories/StoryCard";
import { useEffect } from "react";

export function StoriesRail({ worldSlug }: { worldSlug?: string | null }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["stories-summary", worldSlug ?? null],
    queryFn: () => listStoriesSummary(worldSlug ?? null),
    staleTime: 60_000,
  });

  // Minimal safe fix: react to story progress/completion events to force-refresh
  // the current rail snapshot, bypassing the 60s staleTime.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => { void refetch(); };
    window.addEventListener("irth:story-progress:changed", refresh);
    window.addEventListener("irth:story-completions:changed", refresh);
    return () => {
      window.removeEventListener("irth:story-progress:changed", refresh);
      window.removeEventListener("irth:story-completions:changed", refresh);
    };
  }, [refetch]);

  if (isLoading || !data || data.length === 0) return null;
  const picks = pickHomeStories(data, 6);

  return (
    <section className="mt-10 px-5" dir="rtl" aria-label="القصص">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/30">
            <BookOpenText className="size-3.5" />
          </span>
          <div>
            <p className="text-[10px] tracking-[0.28em] text-gold/70">مشاهد موثّقة</p>
            <h2 className="font-display text-[15px] font-bold">القصص</h2>
          </div>
        </div>
        <Link
          to="/stories"
          className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline"
        >
          الكل <ArrowLeft className="size-3" />
        </Link>
      </div>

      <div
        className="-mx-5 flex flex-nowrap items-stretch gap-3 overflow-x-auto overscroll-x-contain px-5 pb-2 no-scrollbar snap-x snap-mandatory sm:-mx-6 sm:gap-4 sm:px-6"
        aria-label="قصص إرث"
      >
        {picks.map((s, i, arr) => (
          <div
            key={s.id}
            className={i === arr.length - 1 ? "pe-5 sm:pe-6" : ""}
          >
            <StoryCard story={s} variant="rail" />
          </div>
        ))}
      </div>
    </section>
  );
}
