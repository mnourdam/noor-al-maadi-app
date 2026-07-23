// ============================================================
// RelatedStoriesRail — up to N unlocked stories, filtered by
// world when provided. Used by encyclopedia entity pages and
// story-completion screens (P4.1).
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";
import { listStoriesSummary, type StorySummary } from "@/lib/stories/summary";
import { StoryCard } from "@/components/stories/StoryCard";

export function RelatedStoriesRail({
  worldSlug,
  excludeId,
  limit = 4,
  heading = "قصص ذات صلة",
}: {
  worldSlug?: string | null;
  excludeId?: string;
  limit?: number;
  heading?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["stories-summary", worldSlug ?? null, "related"],
    queryFn: () => listStoriesSummary(worldSlug ?? null),
    staleTime: 60_000,
  });

  const picks: StorySummary[] = (data ?? [])
    .filter((s) => s.id !== excludeId && s.unlocked)
    .slice(0, limit);

  if (isLoading || picks.length === 0) return null;

  return (
    <section className="mt-8" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <BookOpenText className="size-4 text-gold" />
        <h2 className="font-display text-base font-bold">{heading}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {picks.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>
    </section>
  );
}
