// Encyclopedia Exploration Paths (Phase 3).
// Builds a connected historical journey from REAL graph relationships.
// No hardcoded content — each path is anchored to a Supabase entity slug,
// then resolved via the relationship graph.

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { resolveRelatedEntities, type RelatedNode } from "@/lib/relationship-graph";

export type ExplorationPathConfig = {
  id: string;
  title: string;
  subtitle?: string;
  anchorSlug: string;
  glyph?: string;
};

// Only metadata — no content. Each anchor must resolve to a live enabled
// entity, otherwise the path renders empty state.
export const EXPLORATION_PATHS: ExplorationPathConfig[] = [
  { id: "andalus", title: "طريق الأندلس", subtitle: "من الفتح حتى السقوط", anchorSlug: "andalus", glyph: "🕌" },
  { id: "salah-al-din", title: "طريق صلاح الدين", subtitle: "من تكريت إلى القدس", anchorSlug: "salahuddin", glyph: "⚔️" },
  { id: "mamluk", title: "طريق المماليك", subtitle: "من عين جالوت إلى القاهرة", anchorSlug: "mamluk-sultanate", glyph: "🛡️" },
  { id: "abbasid", title: "طريق العباسيين", subtitle: "من بغداد عاصمة العالم", anchorSlug: "abbasid", glyph: "📚" },
  { id: "ottoman", title: "طريق العثمانيين", subtitle: "من القسطنطينية إلى الحرمين", anchorSlug: "ottoman", glyph: "🌙" },
];

export function findExplorationPath(id: string): ExplorationPathConfig | null {
  return EXPLORATION_PATHS.find((p) => p.id === id) ?? null;
}

// Preferred type sequence — gives the journey a narrative shape when possible.
const TYPE_FLOW: string[] = [
  "event",
  "figure",
  "city",
  "figure",
  "landmark",
  "battle",
  "city",
  "event",
];

export type ExplorationStep = {
  entity: SupabaseEncyclopediaEntity;
  role: "anchor" | "step";
};

export type ExplorationJourney = {
  config: ExplorationPathConfig;
  anchor: SupabaseEncyclopediaEntity | null;
  steps: ExplorationStep[];
  related: RelatedNode[];
};

async function loadAnchor(slug: string): Promise<SupabaseEncyclopediaEntity | null> {
  const { data } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  return (data ?? null) as SupabaseEncyclopediaEntity | null;
}

/**
 * Build a connected journey from a path config.
 * - Anchor is loaded from Supabase.
 * - Steps are derived from the anchor's relationship-graph result.
 * - Steps are interleaved by entity_type to form a narrative flow.
 * - No fallback content. If anchor is missing OR has no related nodes,
 *   the returned journey is empty.
 */
export async function buildExplorationJourney(
  config: ExplorationPathConfig,
): Promise<ExplorationJourney> {
  const anchor = await loadAnchor(config.anchorSlug);
  if (!anchor) {
    return { config, anchor: null, steps: [], related: [] };
  }
  const related = await resolveRelatedEntities(anchor);
  if (related.length === 0) {
    return { config, anchor, steps: [{ entity: anchor, role: "anchor" }], related };
  }

  // Bucket related nodes by entity_type, preserving score order.
  const buckets = new Map<string, RelatedNode[]>();
  for (const n of related) {
    const t = n.entity.entity_type;
    const arr = buckets.get(t) ?? [];
    arr.push(n);
    buckets.set(t, arr);
  }

  const used = new Set<string>([anchor.id]);
  const ordered: SupabaseEncyclopediaEntity[] = [];

  // First pass — follow the preferred type flow.
  for (const t of TYPE_FLOW) {
    const bucket = buckets.get(t);
    if (!bucket) continue;
    const next = bucket.find((n) => !used.has(n.entity.id));
    if (next) {
      used.add(next.entity.id);
      ordered.push(next.entity);
    }
  }

  // Second pass — any remaining strong nodes, capped to keep journeys readable.
  for (const n of related) {
    if (ordered.length >= 7) break;
    if (used.has(n.entity.id)) continue;
    used.add(n.entity.id);
    ordered.push(n.entity);
  }

  // Place the anchor near the middle of the journey for a "you-are-here" feel.
  const insertAt = Math.min(2, Math.floor(ordered.length / 2));
  const steps: ExplorationStep[] = [];
  ordered.forEach((e, i) => {
    if (i === insertAt) steps.push({ entity: anchor, role: "anchor" });
    steps.push({ entity: e, role: "step" });
  });
  if (steps.length === ordered.length) {
    steps.push({ entity: anchor, role: "anchor" });
  }

  return { config, anchor, steps, related };
}
