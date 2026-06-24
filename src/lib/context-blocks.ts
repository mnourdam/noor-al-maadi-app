// Encyclopedia historical context blocks (Phase 2).
//
// Pure transformation: takes the already-resolved relationship-graph output
// and slices it into per-type narrative blocks (e.g. "مدن هذه الدولة",
// "معاركه وأحداثه"). NEVER fabricates text, NEVER hits the network, NEVER
// falls back to same-era. Blocks with zero items are dropped — the renderer
// must not show empty placeholders.

import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import type { RelatedNode } from "@/lib/relationship-graph";

export type ContextBlock = {
  id: string;
  title: string;
  items: RelatedNode[];
};

const TYPES = {
  city: new Set(["city"]),
  state: new Set(["state"]),
  battle: new Set(["battle"]),
  event: new Set(["event"]),
  figure: new Set(["figure", "scholar"]),
  landmark: new Set(["landmark"]),
  artifact: new Set(["artifact"]),
};

function pick(
  nodes: RelatedNode[],
  types: Set<string>,
  limit = 12,
): RelatedNode[] {
  return nodes.filter((n) => types.has(n.entity.entity_type)).slice(0, limit);
}

function block(id: string, title: string, items: RelatedNode[]): ContextBlock | null {
  return items.length > 0 ? { id, title, items } : null;
}

export function buildContextBlocks(
  entity: SupabaseEncyclopediaEntity,
  related: RelatedNode[],
): ContextBlock[] {
  if (!related || related.length === 0) return [];

  const t = entity.entity_type;
  const out: (ContextBlock | null)[] = [];

  if (t === "state") {
    out.push(block("state-cities", "مدن هذه الدولة", pick(related, TYPES.city)));
    out.push(block("state-figures", "أبرز شخصياتها", pick(related, TYPES.figure)));
    out.push(block("state-battles", "معاركها الفاصلة", pick(related, TYPES.battle)));
    out.push(block("state-events", "أحداث مفصلية", pick(related, TYPES.event)));
    out.push(block("state-landmarks", "معالم ومآثر", pick(related, new Set([...TYPES.landmark, ...TYPES.artifact]))));
  } else if (t === "city") {
    out.push(block("city-state", "ضمن دولة", pick(related, TYPES.state, 6)));
    out.push(block("city-figures", "شخصيات من المدينة", pick(related, TYPES.figure)));
    out.push(block("city-battles", "معارك وأحداث فيها", pick(related, new Set([...TYPES.battle, ...TYPES.event]))));
    out.push(block("city-landmarks", "معالم وآثار", pick(related, new Set([...TYPES.landmark, ...TYPES.artifact]))));
  } else if (t === "battle") {
    out.push(block("battle-parties", "أطراف ومشاركون", pick(related, new Set([...TYPES.state, ...TYPES.figure]))));
    out.push(block("battle-places", "ميادين ومدن", pick(related, new Set([...TYPES.city, ...TYPES.landmark]))));
    out.push(block("battle-related", "أحداث متصلة", pick(related, TYPES.event)));
  } else if (t === "event") {
    out.push(block("event-actors", "شخصيات الحدث", pick(related, TYPES.figure)));
    out.push(block("event-states", "الدول المعنية", pick(related, TYPES.state)));
    out.push(block("event-places", "أماكن الحدث", pick(related, new Set([...TYPES.city, ...TYPES.landmark]))));
    out.push(block("event-battles", "معارك متصلة", pick(related, TYPES.battle)));
  } else if (t === "figure" || t === "scholar") {
    out.push(block("figure-states", "ولاؤه ودولته", pick(related, TYPES.state, 6)));
    out.push(block("figure-cities", "مدنه ومجاله", pick(related, TYPES.city)));
    out.push(block("figure-battles", "معاركه وأحداثه", pick(related, new Set([...TYPES.battle, ...TYPES.event]))));
    out.push(block("figure-works", "آثاره ومعالمه", pick(related, new Set([...TYPES.landmark, ...TYPES.artifact]))));
  } else if (t === "landmark" || t === "artifact") {
    out.push(block("place-city", "في مدينة", pick(related, TYPES.city, 4)));
    out.push(block("place-state", "ضمن دولة", pick(related, TYPES.state, 4)));
    out.push(block("place-figures", "شخصيات مرتبطة", pick(related, TYPES.figure)));
    out.push(block("place-events", "أحداث ومعارك", pick(related, new Set([...TYPES.battle, ...TYPES.event]))));
  }

  return out.filter((b): b is ContextBlock => b !== null);
}
