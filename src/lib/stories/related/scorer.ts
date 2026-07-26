// ============================================================
// Smart Related Stories — the single scorer.
// ------------------------------------------------------------
// `scoreRelatedStoryForEntity(story, entity, context)` is the ONLY
// place relevance is decided. Every surface (player rail, admin
// diagnostics, tests) calls this function, so what the auditor sees
// is exactly what the player gets.
//
// Weights (canonical-relation first, text last):
//   +100  direct canonical relation, role = depicts / answers
//    +90  direct canonical relation + story subject/type agrees
//    +78  direct canonical relation, role = mentions
//    +70  direct canonical relation, role = context / other
//    +60  story relates to an entity explicitly linked to this one
//    +45  story relates to an entity in the same authored cluster
//         (geography/reverse links)
//    +35  story relates to a campaign this entity belongs to
//    +15  same state
//    +10  same world
//     +5  same era
//   +3–8  text / tag fallback (Arabic-normalised), weak by design
//
// Exclusions: unpublished/archived stories never reach the scorer
// (the RPC only returns published rows); broken relations contribute
// nothing; era/world-only matches are below MIN_SCORE, so a story
// never surfaces on "similar era" evidence alone.
// ============================================================

import type { StorySummary } from "@/lib/stories/summary";
import { normalizeArabicSearch } from "@/lib/encyclopedia-search";
import { toCanonicalEra } from "@/lib/era-canonical";
import type { StoryRelationsIndex } from "./relations-index";
import { roleRank } from "./relations-index";

export type RelatedReason = "direct" | "cluster" | "campaign" | "taxonomy";

export const REASON_BADGE: Record<RelatedReason, string> = {
  direct: "مرتبطة مباشرة",
  cluster: "من نفس الحدث",
  campaign: "من نفس الحملة",
  taxonomy: "من نفس السياق",
};

/** Minimum score for a story to be shown. Below this = era-only noise. */
export const MIN_RELATED_SCORE = 35;

export interface RelatedEntityContext {
  /** Canonical entity id (already resolved by the caller). */
  entityId: string;
  slug: string;
  entityType: string;
  title: string;
  world: string | null;
  state: string | null;
  era: string | null;
  /** Campaign slugs/ids authored on this entity. */
  campaignRefs: Set<string>;
  /** Entities explicitly linked to this one (authored relations). */
  strongNeighborIds: Set<string>;
  /** Weaker authored links (reverse geography / affiliation). */
  weakNeighborIds: Set<string>;
  /** Arabic-normalised search haystack for the weak text fallback. */
  textKeys: string[];
}

export interface MatchedSignal {
  code: string;
  label: string;
  points: number;
}

export interface RelatedScore {
  storyId: string;
  score: number;
  signals: MatchedSignal[];
  reason: RelatedReason | null;
  /** Populated when the story is excluded; `score` is then 0. */
  rejected: string | null;
}

/** Story category ↔ encyclopedia entity type agreement (Priority B). */
const CATEGORY_TO_TYPES: Record<string, string[]> = {
  city: ["city"],
  character: ["figure"],
  battle: ["battle"],
  event: ["event", "battle"],
  artifact: ["artifact"],
  landmark: ["landmark"],
  document: ["artifact", "landmark"],
};

function subjectAgrees(story: StorySummary, entityType: string): boolean {
  const types = CATEGORY_TO_TYPES[story.category ?? ""] ?? [];
  return types.includes(entityType);
}

function textOverlapPoints(story: StorySummary, ctx: RelatedEntityContext): number {
  if (ctx.textKeys.length === 0) return 0;
  const hay = normalizeArabicSearch(
    [story.title_ar, story.summary_ar, ...(story.tags ?? [])].filter(Boolean).join(" "),
  );
  if (!hay) return 0;
  let hits = 0;
  for (const key of ctx.textKeys) {
    if (key.length >= 3 && hay.includes(key)) hits += 1;
  }
  if (hits === 0) return 0;
  return Math.min(8, 3 + (hits - 1) * 2);
}

export function scoreRelatedStoryForEntity(
  story: StorySummary,
  ctx: RelatedEntityContext,
  index: StoryRelationsIndex,
): RelatedScore {
  const signals: MatchedSignal[] = [];
  const facts = index.byStory.get(story.id);

  if (!story.published_at && story.completed === undefined) {
    return { storyId: story.id, score: 0, signals, reason: null, rejected: "غير منشورة" };
  }

  let reason: RelatedReason | null = null;

  // ---- Priority A / B — direct canonical relation -----------------
  const directRole = facts?.roleByEntity.get(ctx.entityId) ?? null;
  if (directRole) {
    const rank = roleRank(directRole);
    let points = rank >= 95 ? 100 : rank >= 78 ? 78 : 70;
    if (subjectAgrees(story, ctx.entityType) && points < 100) points = 90;
    signals.push({ code: `relation:${directRole}`, label: `صلة مباشرة (${directRole})`, points });
    reason = "direct";
  }

  // ---- Priority C — approved encyclopedia graph -------------------
  if (facts) {
    let strong = false;
    let weak = false;
    for (const eid of facts.entities) {
      if (eid === ctx.entityId) continue;
      if (ctx.strongNeighborIds.has(eid)) strong = true;
      else if (ctx.weakNeighborIds.has(eid)) weak = true;
    }
    if (strong) {
      signals.push({ code: "graph:strong", label: "مرتبطة بكيان موثّق الصلة", points: 60 });
      reason ??= "cluster";
    } else if (weak) {
      signals.push({ code: "graph:cluster", label: "من نفس العنقود التاريخي", points: 45 });
      reason ??= "cluster";
    }
  }

  // ---- Priority D — shared campaign -------------------------------
  if (facts && ctx.campaignRefs.size > 0) {
    for (const c of facts.campaigns) {
      if (ctx.campaignRefs.has(c)) {
        signals.push({ code: `campaign:${c}`, label: "حملة مشتركة", points: 35 });
        reason ??= "campaign";
        break;
      }
    }
  }

  // ---- Priority E — taxonomy (never enough on its own) ------------
  if (ctx.state && story.world_slug && ctx.state === story.world_slug) {
    signals.push({ code: "state", label: "نفس الدولة", points: 15 });
  }
  if (ctx.world && story.world_slug && ctx.world === story.world_slug) {
    signals.push({ code: "world", label: "نفس العالم", points: 10 });
  }
  const entityEra = ctx.era ? toCanonicalEra(ctx.era) : null;
  const storyEra = story.era ? toCanonicalEra(story.era) : null;
  if (entityEra && storyEra && entityEra === storyEra) {
    signals.push({ code: "era", label: "نفس الحقبة", points: 5 });
  }

  // ---- Priority F — weak text fallback ----------------------------
  const text = textOverlapPoints(story, ctx);
  if (text > 0) signals.push({ code: "text", label: "تطابق نصي", points: text });

  const score = signals.reduce((sum, s) => sum + s.points, 0);

  if (score < MIN_RELATED_SCORE) {
    return {
      storyId: story.id,
      score,
      signals,
      reason: null,
      rejected: signals.length === 0 ? "لا توجد أي إشارة صلة" : "إشارات ضعيفة (تصنيف/حقبة فقط)",
    };
  }

  return { storyId: story.id, score, signals, reason: reason ?? "taxonomy", rejected: null };
}
