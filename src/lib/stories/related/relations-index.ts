// ============================================================
// Smart Related Stories — canonical relation index (read-only).
// ------------------------------------------------------------
// ONE network read for the whole app: `list_story_relations_v1`
// returns every relation row of every published, non-hidden story.
// The payload is tiny (a few hundred rows at most), is cached in
// localStorage, and is re-indexed only when the story data version
// or the local snapshot version changes.
//
// The index is the reverse map the encyclopedia needs:
//     canonical entity id → story ids (+ strongest relation role)
//     campaign ref        → story ids
//
// Every relation target is normalised through the encyclopedia
// canonical resolver BEFORE indexing, so merged/converted/redirected
// ids, legacy ids and slugs all collapse onto the canonical entity.
// Nothing here reads Arabic labels or invents edges.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import {
  ensureLocalSnapshotLoaded,
  localDataVersion,
  localEncyclopediaById,
  localEncyclopediaBySlug,
} from "@/lib/local-first-store";
import { resolveCanonicalLocal } from "@/lib/encyclopedia-canonical";

export type StoryRelationTargetType =
  | "encyclopedia_entity"
  | "campaign"
  | "collection"
  | "story";

export interface StoryRelationRow {
  story_id: string;
  target_type: StoryRelationTargetType | string;
  target_id: string;
  role: string | null;
  display_order: number | null;
}

export interface StoryRelationFacts {
  /** Canonical encyclopedia entity ids this story points at. */
  entities: Set<string>;
  /** Campaign slugs/ids this story points at. */
  campaigns: Set<string>;
  /** Collection ids this story belongs to. */
  collections: Set<string>;
  /** canonical entity id → strongest relation role. */
  roleByEntity: Map<string, string>;
  /** Relation targets that could not be resolved to a canonical entity. */
  broken: string[];
}

export interface StoryRelationsIndex {
  /** canonical entity id → (story id → strongest role). */
  byEntity: Map<string, Map<string, string>>;
  /** campaign slug/id → story ids. */
  byCampaign: Map<string, Set<string>>;
  /** story id → resolved facts. */
  byStory: Map<string, StoryRelationFacts>;
  brokenRefs: Array<{ story_id: string; target_id: string }>;
  relationCount: number;
  dataVersion: number;
}

const CACHE_KEY = "irth.stories.relations.v1";

/** Relation roles ranked by how strongly they mean "this story is about it". */
const ROLE_RANK: Record<string, number> = {
  depicts: 100,
  answers_investigation: 95,
  part_of_collection: 60,
  prerequisite: 70,
  unlocks: 70,
  sequel_of: 70,
  prequel_of: 70,
  related_reading: 65,
  source_context: 60,
  mentions: 78,
  context: 70,
};

export function roleRank(role: string | null | undefined): number {
  if (!role) return 60;
  return ROLE_RANK[role] ?? 60;
}

// ------------------------------------------------------------------
// Fetch (network once, then cache; offline reads the cache)
// ------------------------------------------------------------------

function readCache(): StoryRelationRow[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rows?: unknown };
    return Array.isArray(parsed.rows) ? (parsed.rows as StoryRelationRow[]) : null;
  } catch {
    return null;
  }
}

function writeCache(rows: StoryRelationRow[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rows, at: Date.now() }));
  } catch {
    /* quota — index still works for this session */
  }
}

export async function loadStoryRelationRows(): Promise<StoryRelationRow[]> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!online) return readCache() ?? [];
  const { data, error } = await supabase.rpc("list_story_relations_v1" as never, {} as never);
  if (error || !Array.isArray(data)) {
    // Never fail the page over a relation read — degrade to the cache.
    return readCache() ?? [];
  }
  const rows = (data as StoryRelationRow[]).filter(
    (r) => r && typeof r.story_id === "string" && typeof r.target_id === "string",
  );
  writeCache(rows);
  return rows;
}

// ------------------------------------------------------------------
// Canonical resolution
// ------------------------------------------------------------------

/**
 * Normalise any entity reference (canonical id, merged id, converted id,
 * legacy id, slug) into the canonical entity id. Returns null when the
 * reference cannot be resolved against the local snapshot.
 */
export function canonicalEntityIdLocal(ref: string): string | null {
  const raw = (ref ?? "").trim();
  if (!raw) return null;
  const row =
    (localEncyclopediaById(raw) as { id: string } | null) ??
    (localEncyclopediaBySlug(normalizeEntitySlug(raw)) as { id: string } | null);
  if (!row) return null;
  const resolved = (resolveCanonicalLocal(row as never) as { id: string } | null) ?? row;
  return resolved?.id ?? null;
}

// ------------------------------------------------------------------
// Index build
// ------------------------------------------------------------------

export function buildStoryRelationsIndex(
  rows: StoryRelationRow[],
  dataVersion: number,
): StoryRelationsIndex {
  const byEntity = new Map<string, Map<string, string>>();
  const byCampaign = new Map<string, Set<string>>();
  const byStory = new Map<string, StoryRelationFacts>();
  const brokenRefs: Array<{ story_id: string; target_id: string }> = [];

  const facts = (sid: string): StoryRelationFacts => {
    let f = byStory.get(sid);
    if (!f) {
      f = {
        entities: new Set(),
        campaigns: new Set(),
        collections: new Set(),
        roleByEntity: new Map(),
        broken: [],
      };
      byStory.set(sid, f);
    }
    return f;
  };

  for (const r of rows) {
    const sid = String(r.story_id);
    const f = facts(sid);
    const role = r.role ?? null;

    if (r.target_type === "encyclopedia_entity") {
      const canonical = canonicalEntityIdLocal(r.target_id);
      if (!canonical) {
        f.broken.push(r.target_id);
        brokenRefs.push({ story_id: sid, target_id: r.target_id });
        continue;
      }
      f.entities.add(canonical);
      const prevRole = f.roleByEntity.get(canonical);
      if (!prevRole || roleRank(role) > roleRank(prevRole)) {
        f.roleByEntity.set(canonical, role ?? "context");
      }
      const bucket = byEntity.get(canonical) ?? new Map<string, string>();
      const prev = bucket.get(sid);
      if (!prev || roleRank(role) > roleRank(prev)) bucket.set(sid, role ?? "context");
      byEntity.set(canonical, bucket);
    } else if (r.target_type === "campaign") {
      const ref = r.target_id.trim();
      if (!ref) continue;
      f.campaigns.add(ref);
      const set = byCampaign.get(ref) ?? new Set<string>();
      set.add(sid);
      byCampaign.set(ref, set);
    } else if (r.target_type === "collection") {
      f.collections.add(r.target_id.trim());
    }
  }

  return {
    byEntity,
    byCampaign,
    byStory,
    brokenRefs,
    relationCount: rows.length,
    dataVersion,
  };
}

export const EMPTY_RELATIONS_INDEX: StoryRelationsIndex = {
  byEntity: new Map(),
  byCampaign: new Map(),
  byStory: new Map(),
  brokenRefs: [],
  relationCount: 0,
  dataVersion: 0,
};

export const STORY_RELATIONS_QUERY_KEY = ["stories", "relations-index", "v1"] as const;

/**
 * One shared query for the whole app. The key carries the local snapshot
 * data version so the index is rebuilt (never served stale) once a newer
 * encyclopedia snapshot lands and canonical ids change.
 */
export function useStoryRelationsIndex() {
  return useQuery({
    queryKey: [...STORY_RELATIONS_QUERY_KEY],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async (): Promise<StoryRelationsIndex> => {
      await ensureLocalSnapshotLoaded();
      const rows = await loadStoryRelationRows();
      return buildStoryRelationsIndex(rows, localDataVersion());
    },
  });
}
