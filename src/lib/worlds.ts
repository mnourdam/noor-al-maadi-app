// Historical Worlds — player-facing exploration hubs.
// Membership is delegated to the CANONICAL resolver in
// `worlds-progress.ts::buildWorldIndex`. This module contains no
// duplicate era / state-alias / entity-ref mapping.

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { ENCYCLOPEDIA_ENTITY_COLUMNS } from "@/lib/encyclopedia-source";
import type { RelatedNode } from "@/lib/relationship-graph";
import { resolveRelatedEntities } from "@/lib/relationship-graph";
import { sortEntitiesChronological } from "@/lib/entityChronology";
import {
  ensureLocalSnapshotLoaded,
  localEncyclopediaBySlug,
} from "@/lib/local-first-store";
import {
  buildWorldIndex,
  getWorldCampaignIds,
} from "@/lib/worlds-progress";
import { WORLD_HUBS } from "@/lib/worlds-constants";
import type { WorldHub } from "@/lib/worlds-constants";

export { WORLD_ERA, WORLD_HUBS, WORLD_SLUGS } from "@/lib/worlds-constants";
export type { WorldHub } from "@/lib/worlds-constants";

export function findHub(slug: string): WorldHub | null {
  return WORLD_HUBS.find((h) => h.slug === slug) ?? null;
}


export type WorldSummary = {
  hub: WorldHub;
  entity: SupabaseEncyclopediaEntity;
  relatedCount: number;
  campaignsCount: number;
};

function metaObj(e: { metadata: unknown }): Record<string, unknown> {
  return e.metadata && typeof e.metadata === "object"
    ? (e.metadata as Record<string, unknown>)
    : {};
}

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const s =
        (typeof o.slug === "string" && o.slug) ||
        (typeof o.id === "string" && o.id);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}


export async function fetchWorldsIndex(): Promise<WorldSummary[]> {
  await ensureLocalSnapshotLoaded();
  const slugs = WORLD_HUBS.map((h) => h.slug);
  let rows = slugs
    .map((slug) => localEncyclopediaBySlug(slug, "state"))
    .filter((row): row is SupabaseEncyclopediaEntity => !!row && row.enabled !== false);

  if (rows.length === 0 && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    const live = await supabase
      .from("encyclopedia_entities")
      .select(ENCYCLOPEDIA_ENTITY_COLUMNS)
      .in("slug", slugs)
      .eq("enabled", true);
    rows = (live.data ?? []) as unknown as SupabaseEncyclopediaEntity[];
  }

  const bySlug = new Map<string, SupabaseEncyclopediaEntity>();
  for (const r of rows) {
    bySlug.set(r.slug, r);
  }

  // Campaign counts come from the CANONICAL world index. No separate scan.
  const out: WorldSummary[] = [];
  for (const hub of WORLD_HUBS) {
    const entity = bySlug.get(hub.slug);
    if (!entity) continue;
    const related = asStringList(metaObj(entity).related_entities).length;
    out.push({
      hub,
      entity,
      relatedCount: related,
      campaignsCount: getWorldCampaignIds(hub.slug).size,
    });
  }
  out.sort((a, b) => a.hub.order - b.hub.order);
  return out;
}



export type WorldSectionKey =
  | "figure"
  | "city"
  | "event"
  | "battle"
  | "landmark"
  | "artifact";

export type WorldDetail = {
  hub: WorldHub;
  entity: SupabaseEncyclopediaEntity;
  sections: Record<WorldSectionKey, RelatedNode[]>;
  scholars: RelatedNode[];
  states: RelatedNode[];
  connectedWorlds: SupabaseEncyclopediaEntity[];
  campaignsCount: number;
  stats: Record<WorldSectionKey, number>;
};

const SECTION_KEYS: WorldSectionKey[] = [
  "figure",
  "city",
  "event",
  "battle",
  "landmark",
  "artifact",
];

export async function fetchWorldDetail(slug: string): Promise<WorldDetail | null> {
  await ensureLocalSnapshotLoaded();
  const hub = findHub(slug);
  if (!hub) return null;
  let entity = localEncyclopediaBySlug(slug, "state") as SupabaseEncyclopediaEntity | null;
  if (!entity && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    const { data } = await supabase
      .from("encyclopedia_entities")
      .select(ENCYCLOPEDIA_ENTITY_COLUMNS)
      .eq("slug", slug)
      .eq("enabled", true)
      .maybeSingle();
    entity = (data ?? null) as unknown as SupabaseEncyclopediaEntity | null;
  }
  if (!entity) return null;

  // Sections come DIRECTLY from the canonical world index. This is the
  // same set counted by World progress totals — no separate related-graph
  // filter, no era/state alias duplication. Guarantees numeric parity
  // between "we count N cities in this world" and "we display N city
  // cards inside this world".
  const idx = buildWorldIndex().get(slug);
  const wrap = (e: SupabaseEncyclopediaEntity): RelatedNode => ({
    entity: e,
    score: 0,
    reason: "explicit",
  });

  const sections: Record<WorldSectionKey, RelatedNode[]> = {
    figure: (idx?.byBucket.figure ?? []).map(wrap),
    city:   (idx?.byBucket.city   ?? []).map(wrap),
    event:  (idx?.byBucket.event  ?? []).map(wrap),
    battle: (idx?.byBucket.battle ?? []).map(wrap),
    landmark: (idx?.byBucket.landmark ?? []).map(wrap),
    artifact: (idx?.byBucket.artifact ?? []).map(wrap),
  };
  const scholars: RelatedNode[] = (idx?.byBucket.scholar ?? []).map(wrap);
  // Fold scholars into figures for the UI (unchanged behavior).
  sections.figure = [...sections.figure, ...scholars];

  // Deterministic chronological order per section.
  for (const k of SECTION_KEYS) {
    sections[k] = sortEntitiesChronological(sections[k]);
  }

  // Admin-review signal: entities missing any chronology signal.
  const missingChronology = SECTION_KEYS.reduce(
    (sum, k) => sum + sections[k].filter((n) => !Number.isFinite(
      (n.entity.timeline_order ?? 0) ||
      (n.entity.timeline_year ?? 0) ||
      (n.entity.timeline_start_year ?? 0),
    )).length,
    0,
  );
  if (missingChronology > 0 && typeof console !== "undefined") {
    console.warn(
      `[worlds] ${missingChronology} related entities in "${slug}" have no chronology — add timeline_order for deterministic placement.`,
    );
  }

  // Connected worlds are derived from the hub entity's own related states
  // (a graph edge, not membership). Still handled via resolveRelatedEntities
  // limited to state-type siblings that are themselves canonical hubs.
  const related = await resolveRelatedEntities(entity);
  const states: RelatedNode[] = related.filter((n) => n.entity.entity_type === "state");
  const connectedWorlds: SupabaseEncyclopediaEntity[] = states
    .filter((n) => WORLD_SLUGS.has(n.entity.slug) && n.entity.slug !== slug)
    .map((n) => n.entity);

  const campaignsCount = getWorldCampaignIds(slug).size;


  const stats: Record<WorldSectionKey, number> = {
    figure: sections.figure.length,
    city: sections.city.length,
    event: sections.event.length,
    battle: sections.battle.length,
    landmark: sections.landmark.length,
    artifact: sections.artifact.length,
  };

  return {
    hub,
    entity,
    sections,
    scholars,
    states,
    connectedWorlds,
    campaignsCount,
    stats,
  };
}
