// ============================================================
// RelatedStoriesRail — smart, canonical-relation-driven.
// ------------------------------------------------------------
// Given an encyclopedia entity, shows the 3–6 strongest stories
// as ranked by `scoreRelatedStoryForEntity`. Hides itself entirely
// when nothing truly relevant exists (never era-only filler).
//
// Legacy callers (story completion screens) may still pass just a
// `worldSlug`; that path keeps the old behaviour so nothing breaks.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { listStoriesSummary, type StorySummary } from "@/lib/stories/summary";
import { StoryCard } from "@/components/stories/StoryCard";
import { useRelatedStories } from "@/lib/stories/related/useRelatedStories";
import { REASON_BADGE } from "@/lib/stories/related/scorer";
import { storySummaryQueryKey, useStoryIdentityKey } from "@/lib/stories/query-keys";

type EntityLike = Pick<
  SupabaseEncyclopediaEntity,
  "id" | "slug" | "entity_type" | "title" | "metadata"
>;

export function RelatedStoriesRail({
  entity,
  worldSlug,
  excludeId,
  limit = 4,
  heading = "قصص ذات صلة",
}: {
  entity?: EntityLike | null;
  worldSlug?: string | null;
  excludeId?: string;
  limit?: number;
  heading?: string;
}) {
  if (entity) {
    return (
      <SmartRail
        entity={entity}
        excludeId={excludeId}
        limit={Math.min(6, Math.max(3, limit))}
        heading={heading}
      />
    );
  }
  return (
    <WorldRail worldSlug={worldSlug ?? null} excludeId={excludeId} limit={limit} heading={heading} />
  );
}

function Shell({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <BookOpenText className="size-4 text-gold" />
        <h2 className="font-display text-base font-bold">{heading}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function SmartRail({
  entity,
  excludeId,
  limit,
  heading,
}: {
  entity: EntityLike;
  excludeId?: string;
  limit: number;
  heading: string;
}) {
  const { picks, isLoading } = useRelatedStories(entity, limit, excludeId);
  if (isLoading || picks.length === 0) return null;

  return (
    <Shell heading={heading}>
      {picks.map(({ story, scored }) => (
        <div key={story.id} className="flex flex-col gap-1.5">
          <StoryCard story={story} />
          {scored.reason && (
            <span className="self-start rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
              {REASON_BADGE[scored.reason]}
            </span>
          )}
        </div>
      ))}
    </Shell>
  );
}

function WorldRail({
  worldSlug,
  excludeId,
  limit,
  heading,
}: {
  worldSlug: string | null;
  excludeId?: string;
  limit: number;
  heading: string;
}) {
  const storyIdentity = useStoryIdentityKey();
  const { data, isLoading } = useQuery({
    queryKey: storySummaryQueryKey(storyIdentity, worldSlug ?? null, "related"),
    queryFn: () => listStoriesSummary(worldSlug ?? null),
    staleTime: 60_000,
  });

  const picks: StorySummary[] = (data ?? [])
    .filter((s) => s.id !== excludeId && s.unlocked)
    .slice(0, limit);

  if (isLoading || picks.length === 0) return null;

  return (
    <Shell heading={heading}>
      {picks.map((s) => (
        <StoryCard key={s.id} story={s} />
      ))}
    </Shell>
  );
}
