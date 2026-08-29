// ============================================================
// Smart Related Stories — entity context + ranked selection.
// ------------------------------------------------------------
// Local and near-instant:
//   • story summaries    → the one shared `listStoriesSummary` feed
//   • relation index     → one cached RPC, indexed once per version
//   • encyclopedia graph → the existing local relationship graph
// No per-entity query. No N+1. Offline uses the cached relation
// payload plus the local snapshot, so the ranking is identical.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { resolveRelatedEntities } from "@/lib/relationship-graph";
import { normalizeArabicSearch } from "@/lib/encyclopedia-search";
import { listStoriesSummary, type StorySummary } from "@/lib/stories/summary";
import {
  EMPTY_RELATIONS_INDEX,
  useStoryRelationsIndex,
  type StoryRelationsIndex,
} from "./relations-index";
import { storySummaryQueryKey, useStoryIdentityKey } from "@/lib/stories/query-keys";
import {
  MIN_RELATED_SCORE,
  scoreRelatedStoryForEntity,
  type RelatedEntityContext,
  type RelatedScore,
} from "./scorer";

type EntityLike = Pick<
  SupabaseEncyclopediaEntity,
  "id" | "slug" | "entity_type" | "title" | "metadata"
>;

function metaObj(e: EntityLike): Record<string, unknown> {
  return e.metadata && typeof e.metadata === "object"
    ? (e.metadata as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function campaignRefsOf(meta: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const push = (v: unknown) => {
    const s = str(v);
    if (s) out.add(s);
  };
  push(meta.campaign);
  push(meta.campaign_slug);
  const arr = meta.campaigns;
  if (Array.isArray(arr)) for (const c of arr) push(typeof c === "string" ? c : (c as any)?.slug);
  return out;
}

function textKeysOf(entity: EntityLike, meta: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const add = (v: unknown) => {
    const s = str(v);
    if (!s) return;
    const n = normalizeArabicSearch(s);
    if (n.length >= 3) keys.add(n);
  };
  add(entity.title);
  const aliases = meta.aliases;
  if (Array.isArray(aliases)) for (const a of aliases.slice(0, 8)) add(a);
  return Array.from(keys);
}

export async function buildRelatedEntityContext(
  entity: EntityLike,
): Promise<RelatedEntityContext> {
  const meta = metaObj(entity);
  const nodes = await resolveRelatedEntities(entity as SupabaseEncyclopediaEntity);
  const strongNeighborIds = new Set<string>();
  const weakNeighborIds = new Set<string>();
  for (const n of nodes) {
    if (n.score >= 90) strongNeighborIds.add(n.entity.id);
    else weakNeighborIds.add(n.entity.id);
  }
  return {
    entityId: entity.id,
    slug: entity.slug,
    entityType: entity.entity_type,
    title: entity.title,
    world: str(meta.world),
    state: str(meta.state),
    era: str(meta.era),
    campaignRefs: campaignRefsOf(meta),
    strongNeighborIds,
    weakNeighborIds,
    textKeys: textKeysOf(entity, meta),
  };
}

export interface RankedRelatedStory {
  story: StorySummary;
  scored: RelatedScore;
}

/** Pure ranking step — shared by the player rail and admin diagnostics. */
export function rankRelatedStories(
  stories: StorySummary[],
  ctx: RelatedEntityContext,
  index: StoryRelationsIndex,
  limit: number,
): { picks: RankedRelatedStory[]; all: RankedRelatedStory[] } {
  const all: RankedRelatedStory[] = stories.map((story) => ({
    story,
    scored: scoreRelatedStoryForEntity(story, ctx, index),
  }));

  const kept = all
    .filter((r) => !r.scored.rejected && r.scored.score >= MIN_RELATED_SCORE)
    .sort(
      (a, b) =>
        b.scored.score - a.scored.score ||
        (a.story.display_order ?? 0) - (b.story.display_order ?? 0) ||
        String(b.story.published_at ?? "").localeCompare(String(a.story.published_at ?? "")),
    );

  // Diversity: drop near-duplicate titles so the rail never shows the
  // same story twice under two slugs.
  const seenTitles = new Set<string>();
  const picks: RankedRelatedStory[] = [];
  for (const r of kept) {
    const key = normalizeArabicSearch(r.story.title_ar ?? "");
    if (key && seenTitles.has(key)) continue;
    if (key) seenTitles.add(key);
    picks.push(r);
    if (picks.length >= limit) break;
  }

  return { picks, all };
}

export function useRelatedStories(
  entity: EntityLike | null | undefined,
  limit = 4,
  excludeId?: string,
) {
  const relations = useStoryRelationsIndex();

  const storyIdentity = useStoryIdentityKey();
  const storiesQuery = useQuery({
    queryKey: storySummaryQueryKey(storyIdentity, null, "related-engine"),
    queryFn: () => listStoriesSummary(null),
    staleTime: 60_000,
  });

  const ctxQuery = useQuery({
    queryKey: ["stories", "related-ctx", entity?.id ?? ""],
    enabled: !!entity,
    staleTime: 60_000,
    queryFn: () => buildRelatedEntityContext(entity as EntityLike),
  });

  const ranked = useMemo(() => {
    const ctx = ctxQuery.data;
    const stories = storiesQuery.data;
    if (!ctx || !stories) return { picks: [], all: [] };
    const pool = excludeId ? stories.filter((s) => s.id !== excludeId) : stories;
    return rankRelatedStories(pool, ctx, relations.data ?? EMPTY_RELATIONS_INDEX, limit);
  }, [ctxQuery.data, storiesQuery.data, relations.data, limit, excludeId]);

  return {
    picks: ranked.picks,
    all: ranked.all,
    context: ctxQuery.data ?? null,
    index: relations.data ?? EMPTY_RELATIONS_INDEX,
    isLoading: storiesQuery.isLoading || ctxQuery.isLoading || relations.isLoading,
  };
}
