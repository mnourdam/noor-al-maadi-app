// Encyclopedia relationship graph resolver.
// Phase 1 of the Encyclopedia Evolution.
//
// Returns a deduped, score-sorted list of related entities for an encyclopedia
// entity. NEVER falls back to same-era matching. NEVER returns random entities.
// If no documented relationships exist, returns an empty array — the caller is
// responsible for rendering a clean empty state.
//
// Priority (highest score wins per related slug):
//   100  explicit metadata.related_entities / related
//    95  biographical refs (battles, events, commanders, figures, location,
//         capital, state, city, affiliation, related_battles)
//    90  metadata.relationships
//    80  campaign core_entities (same campaign)
//    70  campaign supporting_entities (same campaign)
//    60  city ↔ state reverse lookup (entities that point AT this entity)
//    40  atlas: shared metadata.atlas_id family

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";

export type RelationReason =
  | "explicit"
  | "biography"
  | "campaign-core"
  | "campaign-supporting"
  | "geography"
  | "atlas";

export type RelatedNode = {
  entity: SupabaseEncyclopediaEntity;
  score: number;
  reason: RelationReason;
};

export const REASON_LABEL: Record<RelationReason, string> = {
  explicit: "صلة مباشرة موثقة",
  biography: "روابط سيرة وأحداث",
  "campaign-core": "ضمن نفس الحملة",
  "campaign-supporting": "ذكر داعم في الحملة",
  geography: "ارتباط جغرافي/سياسي",
  atlas: "روابط الأطلس التاريخي",
};

// Render order for grouping in UI.
export const REASON_ORDER: RelationReason[] = [
  "explicit",
  "biography",
  "campaign-core",
  "campaign-supporting",
  "geography",
  "atlas",
];

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
        (typeof o.id === "string" && o.id) ||
        (typeof o.entity_slug === "string" && o.entity_slug) ||
        (typeof o.entity_id === "string" && o.entity_id);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}

type ScoredRef = { score: number; reason: RelationReason };

// Canonical aliases for legacy short slugs. Only applied as ADDITIONAL
// candidates — the original slug is also kept. The final `.in("slug", keys)`
// resolution drops any alias that doesn't correspond to a live enabled row,
// so aliases never invent content.
const STATE_ALIASES: Record<string, string[]> = {
  mamluk: ["mamluk-sultanate"],
  mamluks: ["mamluk-sultanate"],
  abbasid: ["abbasid-caliphate", "abbasid-state"],
  abbasids: ["abbasid-caliphate"],
  umayyad: ["umayyad-caliphate", "umayyad-state"],
  umayyads: ["umayyad-caliphate"],
  andalus: ["al-andalus", "andalus-state"],
  andalusia: ["al-andalus"],
  rashidun: ["rashidun-caliphate"],
  ottoman: ["ottoman-empire", "ottoman-state"],
  ottomans: ["ottoman-empire"],
  fatimid: ["fatimid-caliphate", "fatimid-state"],
  fatimids: ["fatimid-caliphate"],
  ayyubid: ["ayyubid-sultanate", "ayyubid-state"],
  ayyubids: ["ayyubid-sultanate"],
  seljuk: ["seljuk-empire", "seljuk-state"],
  seljuks: ["seljuk-empire"],
};

function expandAliases(key: string): string[] {
  const extra = STATE_ALIASES[key];
  return extra ? [key, ...extra] : [key];
}

// PR4: module-level cache for the campaigns scan. resolveRelatedEntities
// was previously refetching all (limit 500) campaigns on every entity
// page view — a classic N+page-views pattern. A 60s TTL eliminates the
// duplicate fetches without changing semantics.
const CAMPAIGN_CACHE_TTL_MS = 60_000;
let campaignsCachePromise: Promise<Array<{ data: unknown }>> | null = null;
let campaignsCacheAt = 0;

async function getCampaignsForRelations(): Promise<Array<{ data: unknown }>> {
  const now = Date.now();
  if (campaignsCachePromise && now - campaignsCacheAt < CAMPAIGN_CACHE_TTL_MS) {
    return campaignsCachePromise;
  }
  campaignsCacheAt = now;
  campaignsCachePromise = (async () => {
    const { data } = await supabase
      .from("admin_campaigns")
      .select("data")
      .limit(500);
    return (data ?? []) as Array<{ data: unknown }>;
  })().catch((err) => {
    // On failure, invalidate so the next call retries instead of caching the error.
    campaignsCachePromise = null;
    throw err;
  });
  return campaignsCachePromise;
}

export async function resolveRelatedEntities(
  entity: SupabaseEncyclopediaEntity,
): Promise<RelatedNode[]> {
  const meta = metaObj(entity);
  const selfSlug = entity.slug.toLowerCase();
  const selfId = entity.id;

  // slug → best score+reason
  const scores = new Map<string, ScoredRef>();

  const bump = (refs: string[], score: number, reason: RelationReason) => {
    for (const raw of refs) {
      const base = normalizeEntitySlug(raw);
      if (!base) continue;
      for (const key of expandAliases(base)) {
        if (!key || key === selfSlug || key === selfId) continue;
        const prev = scores.get(key);
        if (!prev || score > prev.score) scores.set(key, { score, reason });
      }
    }
  };

  // 1. Explicit relationship fields.
  bump(asStringList(meta.related_entities), 100, "explicit");
  bump(asStringList(meta.related), 100, "explicit");
  bump(asStringList(meta.relationships), 90, "explicit");

  // 1b. Biographical / type-specific references on this entity's metadata.
  const bioFields = [
    "battles",
    "events",
    "commanders",
    "figures",
    "related_battles",
    "related_events",
    "related_figures",
    "landmarks",
  ];
  for (const f of bioFields) bump(asStringList(meta[f]), 95, "biography");

  const singleRefFields = ["location", "capital", "state", "city", "affiliation"];
  for (const f of singleRefFields) {
    const v = meta[f];
    if (typeof v === "string" && v.trim()) bump([v.trim()], 95, "biography");
  }

  // 2. Campaigns containing this entity. References can live at top-level
  //    or under data.metadata, and slugs may be "<type>:<slug>" or dotted.
  const stripPrefix = (s: string) => {
    const colon = s.includes(":") ? s.split(":").pop()! : s;
    return normalizeEntitySlug(colon);
  };
  const camps = await getCampaignsForRelations();
  for (const c of camps) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const core = [
      ...asStringList(cm.core_entities),
      ...asStringList(cmeta.core_entities),
    ].map(stripPrefix);
    const sup = [
      ...asStringList(cm.supporting_entities),
      ...asStringList(cmeta.supporting_entities),
    ].map(stripPrefix);
    const campSlug = typeof cm.slug === "string" ? cm.slug : "";
    const hintMatch =
      typeof meta.campaign === "string" && meta.campaign === campSlug;
    if (!hintMatch && !core.includes(selfSlug) && !sup.includes(selfSlug)) continue;
    bump(core, 80, "campaign-core");
    bump(sup, 70, "campaign-supporting");
  }

  // 2b. Other entities that declare the same metadata.campaign hint.
  if (typeof meta.campaign === "string" && meta.campaign.trim()) {
    const { data: camp_sibs } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", selfId)
      .contains("metadata", { campaign: meta.campaign })
      .limit(60);
    bump((camp_sibs ?? []).map((r: { slug: string }) => r.slug), 75, "campaign-core");
  }

  // 3. Geography reverse lookup — entities that point AT this entity.
  const ors: string[] = [];
  if (entity.entity_type === "city") {
    ors.push(`metadata->>city.eq.${entity.slug}`);
    ors.push(`metadata->>location.eq.${entity.slug}`);
    ors.push(`metadata->>capital.eq.${entity.slug}`);
  }
  if (entity.entity_type === "state") {
    ors.push(`metadata->>state.eq.${entity.slug}`);
    ors.push(`metadata->>affiliation.eq.${entity.slug}`);
  }
  // Forward: other entities sharing this entity's declared city/state.
  const cityRef = typeof meta.city === "string" ? meta.city : "";
  const stateRef = typeof meta.state === "string" ? meta.state : "";
  if (cityRef) ors.push(`metadata->>city.eq.${cityRef}`);
  if (stateRef) ors.push(`metadata->>state.eq.${stateRef}`);

  if (ors.length > 0) {
    const { data: geo } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", selfId)
      .or(ors.join(","))
      .limit(80);
    bump((geo ?? []).map((r: { slug: string }) => r.slug), 60, "geography");
  }

  // 4. Atlas family.
  const atlasId = typeof meta.atlas_id === "string" ? meta.atlas_id : "";
  if (atlasId) {
    const { data: atl } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", selfId)
      .contains("metadata", { atlas_id: atlasId })
      .limit(40);
    bump((atl ?? []).map((r: { slug: string }) => r.slug), 40, "atlas");
  }

  if (scores.size === 0) return [];

  // Resolve slugs to live entities.
  const keys = Array.from(scores.keys());
  const { data: rows } = await supabase
    .from("encyclopedia_entities")
    .select(ENCYCLOPEDIA_ENTITY_COLUMNS)
    .eq("enabled", true)
    .in("slug", keys);

  const nodes: RelatedNode[] = ((rows ?? []) as SupabaseEncyclopediaEntity[]).map((r) => {
    const ref = scores.get(r.slug.toLowerCase())!;
    return { entity: r, score: ref.score, reason: ref.reason };
  });

  nodes.sort((a, b) => b.score - a.score || a.entity.title.localeCompare(b.entity.title, "ar"));
  return nodes;
}

export function groupRelatedByReason(
  nodes: RelatedNode[],
): Array<{ reason: RelationReason; label: string; items: RelatedNode[] }> {
  const groups = new Map<RelationReason, RelatedNode[]>();
  for (const n of nodes) {
    const arr = groups.get(n.reason) ?? [];
    arr.push(n);
    groups.set(n.reason, arr);
  }
  return REASON_ORDER.filter((r) => groups.has(r)).map((r) => ({
    reason: r,
    label: REASON_LABEL[r],
    items: groups.get(r)!,
  }));
}
