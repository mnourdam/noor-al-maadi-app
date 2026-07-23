// ============================================================
// StoryCompletion — celebratory ending screen (P4.1)
// ------------------------------------------------------------
// Rendered when the reader emits `onCompleted`. Shows earned
// rewards (already granted server-side), a next-story
// recommendation, and clear exits so the player does NOT drop
// back into the catalog.
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Home, Sparkles, Trophy } from "lucide-react";
import { listStoriesSummary, pickNextStory, type StorySummary } from "@/lib/stories/summary";
import { StoryCard } from "@/components/stories/StoryCard";

export function StoryCompletion({
  finished,
  onReplay,
}: {
  finished: StorySummary;
  onReplay: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["stories-summary", null, "post-completion"],
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  const next = data ? pickNextStory(data, finished.id) : null;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-5 pb-10 pt-6 text-center">
      <div className="relative mx-auto grid size-24 place-items-center rounded-full bg-gradient-to-br from-gold to-amber-600 shadow-lg shadow-gold/40">
        <Trophy className="size-10 text-black" />
        <Sparkles className="absolute -end-2 -top-2 size-6 text-gold" />
      </div>
      <h1 className="mt-4 font-display text-2xl font-bold text-gold">
        أنهيت «{finished.title_ar}»
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        بارك الله فيك — قصة أخرى تُضاف إلى رحلتك في إرث.
      </p>

      {(finished.xp_reward > 0 || finished.dinar_reward > 0) && (
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3">
          {finished.xp_reward > 0 && (
            <span className="rounded-full bg-black/40 px-3 py-1 text-[12px] text-gold">
              +{finished.xp_reward} XP
            </span>
          )}
          {finished.dinar_reward > 0 && (
            <span className="rounded-full bg-black/40 px-3 py-1 text-[12px] text-gold">
              +{finished.dinar_reward} دينار
            </span>
          )}
        </div>
      )}

      {next && (
        <div className="mt-8 text-start">
          <p className="mb-2 text-[11px] tracking-[0.28em] text-gold/70">التالية</p>
          <StoryCard story={next} />
        </div>
      )}

      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-black/40 px-4 py-2.5 text-sm text-gold hover:border-gold/60"
        >
          <Home className="size-4" /> العودة إلى الرئيسية
        </Link>
        <Link
          to="/stories"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface/60 px-4 py-2.5 text-sm text-foreground/90 hover:border-gold/40"
        >
          كل القصص <ArrowLeft className="size-3.5" />
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-surface/60 px-4 py-2.5 text-sm text-foreground/90 hover:border-gold/40"
        >
          إعادة القراءة
        </button>
      </div>
    </div>
  );
}
