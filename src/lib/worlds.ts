// Historical Worlds — player-facing exploration hubs.
// Sources: encyclopedia_entities (hubs + related), admin_campaigns (counts).
// Connected worlds are derived from related_entities limited to other hub slugs.
// No hardcoded content beyond initial ordering + glyphs.

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { normalizeEntitySlug, ENCYCLOPEDIA_ENTITY_COLUMNS } from "@/lib/encyclopedia-source";
import { resolveRelatedEntities, type RelatedNode } from "@/lib/relationship-graph";
import { sortEntitiesChronological } from "@/lib/entityChronology";
import {
  ensureLocalSnapshotLoaded,
  localEncyclopediaBySlug,
  localPublishedCampaigns,
} from "@/lib/local-first-store";

export type WorldHub = {
  slug: string;
  glyph: string;
  order: number;
};

// Ordering + glyphs only. Titles/subtitles come from Supabase.
export const WORLD_HUBS: WorldHub[] = [
  { slug: "prophetic", glyph: "🌙", order: 1 },
  { slug: "rashidun", glyph: "🕋", order: 2 },
  { slug: "umayyad", glyph: "🏛️", order: 3 },
  { slug: "andalus", glyph: "🕌", order: 4 },
  { slug: "abbasid", glyph: "📚", order: 5 },
  { slug: "fatimid", glyph: "🌌", order: 6 },
  { slug: "seljuk", glyph: "🏹", order: 7 },
  { slug: "zengid", glyph: "🛡️", order: 8 },
  { slug: "ayyubid-state", glyph: "⚔️", order: 9 },
  { slug: "mamluk-sultanate", glyph: "🗡️", order: 10 },
  { slug: "mongols", glyph: "🐎", order: 11 },
  { slug: "timurid", glyph: "🏇", order: 12 },
  { slug: "ottoman", glyph: "🌘", order: 13 },
  { slug: "safavid", glyph: "🏺", order: 14 },
];

export const WORLD_SLUGS = new Set(WORLD_HUBS.map((h) => h.slug));

// Canonical era tag per hub. Used to enforce strict world membership for
// related entities so that, e.g., prophetic-era events never appear inside
// the Ottoman world page. Hubs whose data has no era tag fall back to the
// hub slug itself.
export const WORLD_ERA: Record<string, string> = {
  prophetic: "prophetic",
  rashidun: "rashidun",
  umayyad: "umayyad",
  andalus: "andalus",
  abbasid: "abbasid",
  fatimid: "fatimid",
  seljuk: "seljuk",
  zengid: "zengid",
  "ayyubid-state": "ayyubid",
  "mamluk-sultanate": "mamluk",
  mongols: "mongols",
  timurid: "timurid",
  ottoman: "ottoman",
  safavid: "safavid",
};

// State-reference aliases an entity may use to declare it belongs to a hub.
const WORLD_STATE_ALIASES: Record<string, string[]> = {
  "ayyubid-state": ["ayyubid", "ayyubid-state", "ayyubid-sultanate"],
  "mamluk-sultanate": ["mamluk", "mamluks", "mamluk-sultanate"],
  ottoman: ["ottoman", "ottomans", "ottoman-empire", "ottoman-state"],
  umayyad: ["umayyad", "umayyads", "umayyad-caliphate", "umayyad-state"],
  abbasid: ["abbasid", "abbasids", "abbasid-caliphate", "abbasid-state"],
  andalus: ["andalus", "al-andalus", "andalus-state"],
  rashidun: ["rashidun", "rashidun-caliphate"],
  seljuk: ["seljuk", "seljuks", "seljuk-empire", "seljuk-state"],
  zengid: ["zengid", "zengids"],
  mongols: ["mongols", "mongol", "mongol-empire", "ilkhanid", "ilkhanate", "golden-horde"],
  timurid: ["timurid", "timurids", "timurid-empire", "timurid-state"],
  fatimid: ["fatimid", "fatimids", "fatimid-caliphate", "fatimid-state"],
  safavid: ["safavid", "safavids", "safavid-empire", "safavid-state"],
  prophetic: ["prophetic"],
};

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

function stripPrefix(s: string): string {
  const colon = s.includes(":") ? s.split(":").pop()! : s;
  return normalizeEntitySlug(colon);
}

async function countCampaignsForSlug(slug: string): Promise<number> {
  await ensureLocalSnapshotLoaded();
  const local = localPublishedCampaigns() as Array<{ data: any }>;
  const data = local.length > 0
    ? local
    : (typeof navigator === "undefined" || navigator.onLine !== false)
      ? (((await supabase.from("campaigns_public" as any).select("data").limit(500)) as any).data ?? [])
      : [];

  let count = 0;
  for (const c of data) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    // Preferred: canonical worldSlug (populated on 90%+ of published campaigns).
    const ws = typeof cm.worldSlug === "string" ? cm.worldSlug : null;
    if (ws) {
      if (ws === slug) count++;
      continue;
    }
    // Fallback for legacy imports without worldSlug: scan related-entity refs.
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const all = [
      ...asStringList(cm.core_entities),
      ...asStringList(cmeta.core_entities),
      ...asStringList(cm.supporting_entities),
      ...asStringList(cmeta.supporting_entities),
    ].map(stripPrefix);
    if (all.includes(slug)) count++;
  }
  return count;
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

  // Count campaigns once per hub (cheap: 500 rows, in-memory filter per hub).
  const localCampaignRows = localPublishedCampaigns() as Array<{ data: any }>;
  const campRows = localCampaignRows.length > 0
    ? localCampaignRows
    : (typeof navigator === "undefined" || navigator.onLine !== false)
      ? (((await supabase.from("campaigns_public" as any).select("data").limit(500)) as any).data ?? [])
      : [];

  const campCount = new Map<string, number>();
  for (const c of campRows) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    // Preferred: canonical worldSlug directly on the campaign.
    const ws = typeof cm.worldSlug === "string" ? cm.worldSlug : null;
    if (ws) {
      if (WORLD_SLUGS.has(ws)) campCount.set(ws, (campCount.get(ws) ?? 0) + 1);
      continue;
    }
    // Fallback: entity-ref scan for legacy imports missing worldSlug.
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const all = new Set([
      ...asStringList(cm.core_entities),
      ...asStringList(cmeta.core_entities),
      ...asStringList(cm.supporting_entities),
      ...asStringList(cmeta.supporting_entities),
    ].map(stripPrefix));
    for (const s of slugs) {
      if (all.has(s)) campCount.set(s, (campCount.get(s) ?? 0) + 1);
    }
  }


  const out: WorldSummary[] = [];
  for (const hub of WORLD_HUBS) {
    const entity = bySlug.get(hub.slug);
    if (!entity) continue;
    const related = asStringList(metaObj(entity).related_entities).length;
    out.push({
      hub,
      entity,
      relatedCount: related,
      campaignsCount: campCount.get(hub.slug) ?? 0,
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

  const related = await resolveRelatedEntities(entity);

  const sections: Record<WorldSectionKey, RelatedNode[]> = {
    figure: [],
    city: [],
    event: [],
    battle: [],
    landmark: [],
    artifact: [],
  };
  const scholars: RelatedNode[] = [];
  const states: RelatedNode[] = [];



  // Strict world membership filter. The relationship resolver pulls in
  // entities via campaigns, geography, and atlas links — none of which
  // guarantee historical belonging. We accept a related entity for THIS
  // world only when at least one explicit signal confirms it:
  //   1. listed in this hub's own related / related_entities
  //   2. entity.metadata.era matches the hub era
  //   3. entity.metadata.state | affiliation | world | worldSlug matches
  //      this hub's slug (or an accepted alias)
  // Everything else is treated as ambiguous and surfaced for admin review
  // instead of leaking onto the player-facing world page.
  const hubMeta = metaObj(entity);
  const explicitAllow = new Set<string>([
    ...asStringList(hubMeta.related_entities).map(stripPrefix),
    ...asStringList(hubMeta.related).map(stripPrefix),
  ]);
  const hubEra = WORLD_ERA[slug] ?? slug;
  const acceptedStateRefs = new Set<string>(WORLD_STATE_ALIASES[slug] ?? [slug]);

  const ambiguous: RelatedNode[] = [];
  const belongs = (n: RelatedNode): boolean => {
    const m = metaObj(n.entity);
    if (explicitAllow.has(n.entity.slug)) return true;
    const era = typeof m.era === "string" ? m.era.toLowerCase() : "";
    if (era && era === hubEra) return true;
    const refFields = ["state", "affiliation", "world", "worldSlug", "world_slug"];
    for (const f of refFields) {
      const v = m[f];
      if (typeof v === "string" && acceptedStateRefs.has(v.toLowerCase())) return true;
    }
    const rel = asStringList(m.related_entities).map(stripPrefix);
    if (rel.includes(slug)) return true;
    return false;
  };

  for (const n of related) {
    const t = n.entity.entity_type;
    if (t === "state") {
      // Connected worlds are handled separately below.
      states.push(n);
      continue;
    }
    if (!belongs(n)) {
      ambiguous.push(n);
      continue;
    }
    if (t === "scholar") scholars.push(n);
    else if ((SECTION_KEYS as string[]).includes(t)) {
      sections[t as WorldSectionKey].push(n);
    }
  }
  // Fold scholars into the figures section so player UI stays tidy.
  sections.figure = [...sections.figure, ...scholars];

  // Sprint 2 — Historical Chronology Engine.
  // Every section is ordered deterministically by timeline_order →
  // timeline_year → timeline_start_year → metadata year. Never by
  // relationship score, created_at, or insertion order.
  for (const k of SECTION_KEYS) {
    sections[k] = sortEntitiesChronological(sections[k]);
  }

  if (ambiguous.length > 0 && typeof console !== "undefined") {
    // Admin-review signal: never silently include ambiguous entities, but
    // make them discoverable for triage.
    console.warn(
      `[worlds] ${ambiguous.length} ambiguous related entities suppressed for world "${slug}":`,
      ambiguous.slice(0, 25).map((n) => `${n.entity.entity_type}:${n.entity.slug}`),
    );
  }

  // Admin-review signal: count entities missing any chronology signal so
  // the admin review surface can flag them for backfill.
  const missingChronology = SECTION_KEYS.reduce(
    (sum, k) => sum + sections[k].filter((n) => !Number.isFinite(
      // entitySortKey returns +Infinity when nothing is known
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


  const connectedWorlds: SupabaseEncyclopediaEntity[] = states
    .filter((n) => WORLD_SLUGS.has(n.entity.slug) && n.entity.slug !== slug)
    .map((n) => n.entity);

  const campaignsCount = await countCampaignsForSlug(slug);

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
