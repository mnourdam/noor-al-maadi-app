// ============================================================
// ContinueYourJourney — post-completion sheet ("تابع رحلتك").
// Slides up after the RewardMoment. Contains: soft header,
// next-story recommendation, social block (reactions + comments),
// and an unobtrusive exit.
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Home } from "lucide-react";
import { Istazadtu } from "@/components/social/Istazadtu";
import { StoryComments } from "@/components/social/StoryComments";
import { PublicContributionsNotice } from "@/components/social/PublicContributionsNotice";
import { StoryCard } from "@/components/stories/StoryCard";
import { listStoriesSummary, pickNextStory, type StorySummary } from "@/lib/stories/summary";

export function ContinueYourJourney({
  finished,
  onReplay,
  onClose,
}: {
  finished: StorySummary | null;
  onReplay: () => void;
  onClose: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["stories-summary", null, "post-completion"],
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  const next = finished && data ? pickNextStory(data, finished.id) : null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-gold/25 bg-background/98 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] backdrop-blur"
      style={{ animation: "cyj-slide 420ms cubic-bezier(0.16,1,0.3,1) both" }}
    >
      <style>{`@keyframes cyj-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-white/20" />

      <div className="px-5 pt-4 pb-2">
        <p className="text-[11px] tracking-[0.32em] text-gold/70">تابع رحلتك</p>
        <h2 className="mt-1 font-display text-xl font-bold text-gold">
          {finished ? `«${finished.title_ar}»` : "قصة أخرى بانتظارك"}
        </h2>
        <p className="mt-1 text-[12px] text-white/70">
          القراءة انتهت. هنا تبدأ المحادثة.
        </p>
      </div>

      {finished && (
        <div className="px-5 pt-2">
          <Istazadtu anchorType="story" anchorId={finished.id} />
        </div>
      )}

      {next && (
        <div className="px-5 pt-6">
          <p className="mb-2 text-[10px] tracking-[0.28em] text-gold/70">قصة قادمة</p>
          <StoryCard story={next} />
        </div>
      )}

      {finished && (
        <div className="px-5 pt-6">
          <PublicContributionsNotice anchorType="story" anchorId={finished.id} />
          <StoryComments storyId={finished.id} />
        </div>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-background/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/40 px-4 py-2 text-sm text-gold"
        >
          إغلاق
        </button>
        <Link
          to="/stories"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          كل القصص <ArrowLeft className="size-3.5" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          <Home className="size-3.5" /> الرئيسية
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          إعادة القراءة
        </button>
      </div>
    </div>
  );
}

// re-export for callers
export type { StorySummary };
