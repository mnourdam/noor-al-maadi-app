import type { ContentPack, PackEntity, PackEntityType } from "./types";
import { AYYUBID_PACK } from "./ayyubid";
import { UMAYYAD_PACK } from "./umayyad";
import { ABBASID_PACK } from "./abbasid";
import { MAMLUK_PACK } from "./mamluk";
import { ANDALUSIA_PACK } from "./andalusia";
import { OTTOMAN_PACK } from "./ottoman";
import { RASHIDUN_PACK } from "./rashidun";
import { SELJUK_PACK } from "./seljuk";
import { ZENGID_PACK } from "./zengid";
import { MURABITUN_PACK } from "./murabitun";
import { MUWAHHIDUN_PACK } from "./muwahhidun";

// ============================================================
// Content Pack registry
// ------------------------------------------------------------
// Future packs (Umayyads, Abbasids, Ottomans, Mamluks…) plug in
// by exporting a `ContentPack` and adding it to the array below.
// Nothing else in the app needs to change.
// ============================================================

export const CONTENT_PACKS: ContentPack[] = [
  AYYUBID_PACK,
  UMAYYAD_PACK,
  ABBASID_PACK,
  MAMLUK_PACK,
  ANDALUSIA_PACK,
  OTTOMAN_PACK,
  RASHIDUN_PACK,
  SELJUK_PACK,
  ZENGID_PACK,
  MURABITUN_PACK,
  MUWAHHIDUN_PACK,
].sort((a, b) => a.order - b.order);

// --- index by entity id (with collision detection) ---
const ENTITY_INDEX = new Map<string, { entity: PackEntity; pack: ContentPack }>();
for (const pack of CONTENT_PACKS) {
  for (const entity of pack.entities) {
    if (ENTITY_INDEX.has(entity.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[content-packs] duplicate id: ${entity.id}`);
    }
    ENTITY_INDEX.set(entity.id, { entity, pack });
  }
}

// --- bridge index: legacy id -> pack entities ---
type BridgeKey = "characterId" | "battleId" | "cityId" | "regionId" | "artifactId" | "storyId" | "era";
const BRIDGE_INDEX: Record<BridgeKey, Map<string, PackEntity[]>> = {
  characterId: new Map(), battleId: new Map(), cityId: new Map(),
  regionId: new Map(), artifactId: new Map(), storyId: new Map(), era: new Map(),
};
for (const { entity } of ENTITY_INDEX.values()) {
  const b = entity.bridges; if (!b) continue;
  (Object.keys(BRIDGE_INDEX) as BridgeKey[]).forEach(k => {
    const v = b[k]; if (!v) return;
    const list = BRIDGE_INDEX[k].get(v) ?? [];
    list.push(entity);
    BRIDGE_INDEX[k].set(v, list);
  });
}

// --- public helpers ---------------------------------------------------------

export function allPackEntities(): PackEntity[] {
  return Array.from(ENTITY_INDEX.values()).map(v => v.entity);
}

export function getPackEntity(id: string): PackEntity | undefined {
  return ENTITY_INDEX.get(id)?.entity;
}

export function getPackForEntity(id: string): ContentPack | undefined {
  return ENTITY_INDEX.get(id)?.pack;
}

export function entitiesByType(type: PackEntityType): PackEntity[] {
  return allPackEntities().filter(e => e.type === type);
}

export function entitiesByPack(packId: string): PackEntity[] {
  return CONTENT_PACKS.find(p => p.id === packId)?.entities ?? [];
}

/** Outgoing first-degree relationships declared on the entity itself. */
export function relatedTo(id: string): PackEntity[] {
  const entry = ENTITY_INDEX.get(id); if (!entry) return [];
  return entry.entity.relatedEntities
    .map(rid => ENTITY_INDEX.get(rid)?.entity)
    .filter((x): x is PackEntity => Boolean(x));
}

/** Incoming relationships — other entities that point back at `id`. */
export function backlinksTo(id: string): PackEntity[] {
  return allPackEntities().filter(e => e.relatedEntities.includes(id));
}

/** Union of outgoing + incoming, de-duplicated. */
export function neighborsOf(id: string): PackEntity[] {
  const seen = new Set<string>();
  const out: PackEntity[] = [];
  for (const e of [...relatedTo(id), ...backlinksTo(id)]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id); out.push(e);
  }
  return out;
}

/** Look up pack entities tied to a legacy in-app id. */
export function packEntitiesForBridge(key: BridgeKey, id: string): PackEntity[] {
  return BRIDGE_INDEX[key].get(id) ?? [];
}

/** Ordered chronologically for timeline rails. */
export function entitiesByTimeline(): PackEntity[] {
  return allPackEntities().slice().sort((a, b) => a.timelinePosition - b.timelinePosition);
}

/** Museum grouping helper. */
export function museumSections(): { type: PackEntityType; label: string; entities: PackEntity[] }[] {
  const LABELS: Record<PackEntityType, string> = {
    state: "الدول والممالك",
    figure: "الشخصيات التاريخية",
    city: "المدن",
    battle: "المعارك",
    event: "الأحداث",
    landmark: "المعالم",
    artifact: "الآثار والمخطوطات",
    achievement: "الألقاب والإنجازات",
  };
  const order: PackEntityType[] = ["state","figure","battle","event","city","landmark","artifact","achievement"];
  return order.map(type => ({ type, label: LABELS[type], entities: entitiesByType(type) }));
}