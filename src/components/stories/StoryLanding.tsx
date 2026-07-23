// ============================================================
// StoryLanding — pre-reader landing screen (P4.1)
// ------------------------------------------------------------
// Player enters here from any list. Shows metadata, prereqs
// (with clear satisfied/unsatisfied labels), estimated reading
// time, progress, and a Start/Resume button.
// The reader is only mounted after the player confirms.
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Clock,
  Compass, Lock, PlayCircle, ScrollText, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  estimateReadingMinutes, labelPrereqKind, progressFraction, storyState,
  type StorySummary,
} from "@/lib/stories/summary";
import { storyMediaPublicUrl } from "@/lib/stories/media/url";
import { RelatedStoriesRail } from "@/components/stories/RelatedStoriesRail";

interface CoverRow { id: string; storage_bucket: string; storage_path: string }

export function StoryLanding({
  summary, onStart,
}: {
  summary: StorySummary;
  onStart: () => void;
}) {
  const state = storyState(summary);
  const pct = Math.round(progressFraction(summary) * 100);
  const mins = estimateReadingMinutes(summary.scene_count);

  const { data: cover } = useQuery({
    queryKey: ["story-cover", summary.cover_media_id],
    enabled: !!summary.cover_media_id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!summary.cover_media_id) return null;
      const { data } = await supabase
        .from("story_media")
        .select("id, storage_bucket, storage_path")
        .eq("id", summary.cover_media_id)
        .maybeSingle();
      return (data as CoverRow | null) ?? null;
    },
  });

  const coverUrl = cover ? storyMediaPublicUrl(cover) : null;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-5 pb-10 pt-4">
      <Link
        to="/stories"
        className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold"
      >
        <ArrowRight className="size-3.5" /> كل القصص
      </Link>

      <div className="mt-3 overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/15 via-black/40 to-transparent">
        {coverUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              src={coverUrl}
              alt={summary.title_ar}
              className={`h-full w-full object-cover ${
                state === "locked" ? "opacity-60 blur-[1px]" : ""
              }`}
            />
            {state === "locked" && (
              <div className="absolute inset-0 grid place-items-center bg-black/40">
                <Lock className="size-8 text-gold" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-muted/40">
            <BookOpenText className="size-10 text-gold/50" />
          </div>
        )}

        <div className="space-y-3 p-5">
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight text-gold">
              {summary.title_ar}
            </h1>
            {summary.title_en && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {summary.title_en}
              </p>
            )}
          </div>

          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {summary.era && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-gold/90">
                <ScrollText className="size-3" /> {summary.era}
              </span>
            )}
            {summary.world_slug && (
              <Link
                to="/worlds/$slug"
                params={{ slug: summary.world_slug }}
                className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-gold/90 hover:border-gold/60"
              >
                <Compass className="size-3" /> {summary.world_slug}
              </Link>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-muted-foreground">
              <Clock className="size-3" /> ≈{mins} دقيقة
            </span>
            {(summary.xp_reward > 0 || summary.dinar_reward > 0) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-muted-foreground">
                <Star className="size-3" />
                {summary.xp_reward > 0 && <>+{summary.xp_reward} XP</>}
                {summary.xp_reward > 0 && summary.dinar_reward > 0 && " · "}
                {summary.dinar_reward > 0 && <>+{summary.dinar_reward} د</>}
              </span>
            )}
          </div>

          {/* Reactions — "استزدتُ" primitive (§P6.1). Online-only. */}
          <div>
            <Istazadtu anchorType="story" anchorId={summary.id} />
          </div>

          {summary.summary_ar && (
            <p className="text-[13px] leading-relaxed text-white/85">
              {summary.summary_ar}
            </p>
          )}

          {/* Progress row */}
          {state === "in_progress" && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>تقدّمك</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Prereqs — clear machine-readable → localized text */}
          {state === "locked" && summary.prereqs.length > 0 && (
            <div className="rounded-xl border border-gold/25 bg-gold/5 p-3">
              <p className="mb-2 flex items-center gap-1 text-[12px] font-bold text-gold">
                <Lock className="size-3" /> لفتح هذه القصة، أنجز:
              </p>
              <ul className="space-y-1 text-[12px]">
                {summary.prereqs.map((p) => (
                  <li
                    key={`${p.kind}:${p.ref}`}
                    className={`flex items-center gap-2 ${
                      p.satisfied ? "text-emerald-400" : "text-white/80"
                    }`}
                  >
                    {p.satisfied ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <span className="size-3.5 rounded-full border border-white/40" />
                    )}
                    <span className="text-muted-foreground">{labelPrereqKind(p.kind)}:</span>
                    <span>{p.title ?? p.ref}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Primary action */}
          <div className="pt-2">
            {state === "locked" ? (
              <button
                type="button"
                disabled
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              >
                <Lock className="size-4" /> مقفلة
              </button>
            ) : (
              <button
                type="button"
                onClick={onStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-black shadow-lg shadow-gold/20"
              >
                {state === "completed" ? (
                  <>إعادة القراءة <ArrowLeft className="size-4" /></>
                ) : state === "in_progress" ? (
                  <><PlayCircle className="size-4" /> استئناف من {pct}%</>
                ) : (
                  <><BookOpenText className="size-4" /> ابدأ القصة</>
                )}
              </button>
            )}
            {state === "completed" && (
              <p className="mt-2 text-center text-[11px] text-emerald-400">
                <CheckCircle2 className="mx-1 inline size-3" />
                أكملت هذه القصة — إعادة القراءة لا تمنح مكافآت جديدة.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Related Encyclopedia is deferred to reader/completion screens
          to avoid encouraging exit mid-landing. Related Stories only. */}
      <RelatedStoriesRail
        worldSlug={summary.world_slug}
        excludeId={summary.id}
        limit={4}
      />
    </div>
  );
}
