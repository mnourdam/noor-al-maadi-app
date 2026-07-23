// ============================================================
// StoryCard — shared card used by Home rail, Worlds section,
// Related Stories rails, and generic catalog contexts (P4.1).
// Purely presentational; caller decides the wrapper (grid/rail).
// ============================================================

import { Link } from "@tanstack/react-router";
import { BookOpenText, CheckCircle2, Clock, Lock, PlayCircle } from "lucide-react";
import {
  progressFraction,
  storyState,
  estimateReadingMinutes,
  type StorySummary,
} from "@/lib/stories/summary";
import { useStoryMediaUrl } from "@/lib/stories/media/url";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CoverRow { id: string; storage_bucket: string; storage_path: string; processing_version: number }

/** Batch-friendly cover row loader via TanStack Query cache; URL signed by hook. */
function useCoverUrl(coverMediaId: string | null): string | null {
  const { data } = useQuery({
    queryKey: ["story-cover-row", coverMediaId],
    enabled: !!coverMediaId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!coverMediaId) return null;
      const { data } = await supabase
        .from("story_media")
        .select("id, storage_bucket, storage_path, processing_version")
        .eq("id", coverMediaId)
        .maybeSingle();
      return (data as CoverRow | null) ?? null;
    },
  });
  return useStoryMediaUrl(data ?? null);
}

export function StoryCard({ story, variant = "grid" }: {
  story: StorySummary;
  variant?: "grid" | "rail";
}) {
  const state = storyState(story);
  const pct = Math.round(progressFraction(story) * 100);
  const mins = estimateReadingMinutes(story.scene_count);
  const cover = useCoverUrl(story.cover_media_id);

  const widthClass = variant === "rail"
    ? "w-56 flex-none snap-start sm:w-64"
    : "w-full";

  return (
    <Link
      to="/story/$id"
      params={{ id: story.id }}
      className={`group block overflow-hidden rounded-2xl border border-gold/20 bg-surface/60 transition hover:border-gold/50 ${widthClass}`}
      aria-label={story.title_ar}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={story.title_ar}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover transition group-hover:scale-[1.02] ${
              !story.unlocked ? "opacity-50 blur-[1px]" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/40">
            <BookOpenText className="size-8 text-gold/50" />
          </div>
        )}
        {state === "locked" && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Lock className="size-6 text-gold/90" />
          </div>
        )}
        {state === "completed" && (
          <div className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] text-white">
            <CheckCircle2 className="size-3" /> اكتمل
          </div>
        )}
        {state === "in_progress" && (
          <div className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold/90 px-2 py-0.5 text-[10px] text-black">
            <PlayCircle className="size-3" /> استئناف
          </div>
        )}
        {state === "new" && (
          <div className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-gold">
            قصة جديدة
          </div>
        )}
        {state === "in_progress" && pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3" dir="rtl">
        <h3 className="line-clamp-1 font-display text-[14px] font-bold text-gold">
          {story.title_ar}
        </h3>
        {story.era && (
          <div className="text-[10px] tracking-wide text-gold/70">{story.era}</div>
        )}
        {story.summary_ar && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            {story.summary_ar}
          </p>
        )}
        <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> ≈{mins} د
          </span>
          <span>
            {story.xp_reward > 0 && <>+{story.xp_reward} XP</>}
            {story.xp_reward > 0 && story.dinar_reward > 0 && " · "}
            {story.dinar_reward > 0 && <>+{story.dinar_reward} د</>}
          </span>
        </div>
      </div>

    </Link>
  );
}
