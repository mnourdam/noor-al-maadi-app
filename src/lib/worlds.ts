// Historical Worlds — player-facing exploration hubs.
// Sources: encyclopedia_entities (hubs + related), admin_campaigns (counts).
// Connected worlds are derived from related_entities limited to other hub slugs.
// No hardcoded content beyond initial ordering + glyphs.

import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import { resolveRelatedEntities, type RelatedNode } from "@/lib/relationship-graph";

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
  { slug: "seljuk", glyph: "🏹", order: 6 },
  { slug: "zengid", glyph: "🛡️", order: 7 },
  { slug: "ayyubid-state", glyph: "⚔️", order: 8 },
  { slug: "mamluk-sultanate", glyph: "🗡️", order: 9 },
  { slug: "ottoman", glyph: "🌘", order: 10 },
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
  seljuk: "seljuk",
  zengid: "zengid",
  "ayyubid-state": "ayyubid",
  "mamluk-sultanate": "mamluk",
  ottoman: "ottoman",
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
  const { data } = await supabase.from("admin_campaigns").select("data").limit(500);
  let count = 0;
  for (const c of data ?? []) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
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
  const slugs = WORLD_HUBS.map((h) => h.slug);
  const { data: rows } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body")
    .in("slug", slugs)
    .eq("enabled", true);

  const bySlug = new Map<string, SupabaseEncyclopediaEntity>();
  for (const r of (rows ?? []) as SupabaseEncyclopediaEntity[]) {
    bySlug.set(r.slug, r);
  }

  // Count campaigns once per hub (cheap: 500 rows, in-memory filter per hub).
  const { data: campRows } = await supabase.from("admin_campaigns").select("data").limit(500);
  const campCount = new Map<string, number>();
  for (const c of campRows ?? []) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
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
  const hub = findHub(slug);
  if (!hub) return null;
  const { data } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  const entity = (data ?? null) as SupabaseEncyclopediaEntity | null;
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

  for (const n of related) {
    const t = n.entity.entity_type;
    if (t === "scholar") scholars.push(n);
    else if (t === "state") states.push(n);
    else if ((SECTION_KEYS as string[]).includes(t)) {
      sections[t as WorldSectionKey].push(n);
    }
  }
  // Fold scholars into the figures section so player UI stays tidy.
  sections.figure = [...sections.figure, ...scholars];

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
