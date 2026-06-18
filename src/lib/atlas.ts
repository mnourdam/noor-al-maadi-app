import { MAP_REGIONS, type MapRegion } from "./data";
import { allPackEntities, getPackForEntity } from "./packs/registry";
import type { PackEntity, PackEntityType } from "./packs/types";

// ============================================================
// Atlas placement engine — derives map coordinates for every
// atlas-capable PackEntity, with deterministic fallbacks so new
// content packs surface on the map automatically.
// ============================================================

export type AtlasPinKind = "capital" | "city" | "battle" | "event" | "landmark" | "state";

export interface AtlasPin {
  id: string;
  entity: PackEntity;
  kind: AtlasPinKind;
  x: number;        // SVG coords (0..100)
  y: number;        // SVG coords (0..60)
  era?: string;     // bridges.era id when known
  source: "city" | "region" | "era" | "type-city";
}

const ATLAS_TYPES: ReadonlySet<PackEntityType> = new Set([
  "state", "city", "battle", "event", "landmark",
]);

/** All landmark coordinates declared in MAP_REGIONS, keyed by landmark id. */
const CITY_COORDS: Map<string, { x: number; y: number; regionId: string }> = (() => {
  const m = new Map<string, { x: number; y: number; regionId: string }>();
  for (const r of MAP_REGIONS) {
    for (const lm of r.landmarks ?? []) {
      m.set(lm.id, { x: lm.x, y: lm.y, regionId: r.id });
    }
  }
  return m;
})();

const REGION_BY_ID: Record<string, MapRegion> = Object.fromEntries(
  MAP_REGIONS.map(r => [r.id, r]),
);

/** Stable hash → small deterministic jitter so co-located pins don't fully overlap. */
function jitter(seed: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // distribute on a small ring
  const a = (h & 0xff) / 256 * Math.PI * 2;
  const r = 1.2 + ((h >>> 8) & 0x7) * 0.18;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7 };
}

function place(x: number, y: number, id: string, applyJitter = true) {
  if (!applyJitter) return { x, y };
  const j = jitter(id);
  return { x: x + j.dx, y: y + j.dy };
}

/** Resolve a city-id-like token to canvas coords (slug or full id). */
function lookupCity(token: string): { x: number; y: number; regionId: string } | undefined {
  if (CITY_COORDS.has(token)) return CITY_COORDS.get(token);
  const slug = token.split(".").pop()!;
  return CITY_COORDS.get(slug);
}

function pinKindFor(e: PackEntity): AtlasPinKind {
  if (e.type === "state") return "state";
  if (e.type === "battle") return "battle";
  if (e.type === "event") return "event";
  if (e.type === "landmark") return "landmark";
  // city — promote to "capital" if meta says so
  const m = e.meta as { capital?: boolean; kind?: string } | undefined;
  if (e.type === "city" && (m?.capital || m?.kind === "capital")) return "capital";
  return "city";
}

/** True coordinates for an entity, or null if it can't be placed. */
export function placeEntity(e: PackEntity): AtlasPin | null {
  if (!ATLAS_TYPES.has(e.type)) return null;

  // Era: explicit bridge, else inherit from owning pack.
  const era = e.bridges?.era ?? getPackForEntity(e.id)?.era;

  // 1) explicit cityId bridge
  if (e.bridges?.cityId) {
    const c = lookupCity(e.bridges.cityId);
    if (c) {
      const p = place(c.x, c.y, e.id);
      return { id: e.id, entity: e, kind: pinKindFor(e), x: p.x, y: p.y, era, source: "city" };
    }
  }

  // 2) type=city — try slug match
  if (e.type === "city") {
    const c = lookupCity(e.id);
    if (c) {
      // cities sit precisely on their landmark spot (no jitter for headline cities)
      return { id: e.id, entity: e, kind: pinKindFor(e), x: c.x, y: c.y, era, source: "type-city" };
    }
  }

  // 3) regionId bridge
  if (e.bridges?.regionId) {
    const r = REGION_BY_ID[e.bridges.regionId];
    if (r) {
      const p = place(r.labelX ?? r.x, r.labelY ?? r.y, e.id);
      return { id: e.id, entity: e, kind: pinKindFor(e), x: p.x, y: p.y, era, source: "region" };
    }
  }

  // 4) era fallback — pick the matching region's centroid
  if (era) {
    const r = MAP_REGIONS.find(rr => rr.era === era);
    if (r) {
      const p = place(r.labelX ?? r.x, r.labelY ?? r.y, e.id);
      return { id: e.id, entity: e, kind: pinKindFor(e), x: p.x, y: p.y, era, source: "era" };
    }
  }

  // 5) Related-entity fallback — borrow coords from a related placeable
  //    entity (single hop, no recursion to avoid cycles).
  for (const rid of e.relatedEntities) {
    const sub = resolveSimpleCoords(rid);
    if (sub) {
      const p = place(sub.x, sub.y, e.id);
      return { id: e.id, entity: e, kind: pinKindFor(e), x: p.x, y: p.y, era, source: "region" };
    }
  }

  return null;
}

/** Non-recursive coord lookup for a related entity id (cityId/regionId/era). */
function resolveSimpleCoords(id: string): { x: number; y: number } | null {
  // Direct landmark / city id
  const c = lookupCity(id);
  if (c) return { x: c.x, y: c.y };
  // Otherwise resolve via the pack entity's own bridges
  const related = ENTITY_BY_ID().get(id);
  if (!related) return null;
  if (related.bridges?.cityId) {
    const cc = lookupCity(related.bridges.cityId);
    if (cc) return { x: cc.x, y: cc.y };
  }
  if (related.bridges?.regionId) {
    const r = REGION_BY_ID[related.bridges.regionId];
    if (r) return { x: r.labelX ?? r.x, y: r.labelY ?? r.y };
  }
  const era = related.bridges?.era ?? getPackForEntity(related.id)?.era;
  if (era) {
    const r = MAP_REGIONS.find(rr => rr.era === era);
    if (r) return { x: r.labelX ?? r.x, y: r.labelY ?? r.y };
  }
  return null;
}

let _entityById: Map<string, PackEntity> | null = null;
function ENTITY_BY_ID(): Map<string, PackEntity> {
  if (!_entityById) {
    _entityById = new Map(allPackEntities().map(e => [e.id, e]));
  }
  return _entityById;
}

/** All entity pins across every content pack. */
export function allAtlasPins(): AtlasPin[] {
  const out: AtlasPin[] = [];
  for (const e of allPackEntities()) {
    const m = e.meta as { locked?: boolean; kind?: string } | undefined;
    if (m?.locked && m?.kind === "campaign-placeholder") continue;
    const pin = placeEntity(e);
    if (pin) out.push(pin);
  }
  return out;
}

/** Subset of pins for a given era filter (undefined = all). */
export function pinsForEra(era: string | null): AtlasPin[] {
  const all = allAtlasPins();
  if (!era) return all;
  return all.filter(p => p.era === era);
}

// ============================================================
// State influence overlays — historical, not modern borders.
// Each entry unions existing region polygons with a faint wash.
// ============================================================

export interface StateOverlay {
  era: string;          // matches PackEntity.bridges.era
  label: string;
  regions: string[];    // MAP_REGIONS ids
  fill: string;         // svg fill (with alpha)
  stroke: string;
}

export const STATE_OVERLAYS: StateOverlay[] = [
  {
    era: "umayyad", label: "نفوذ الدولة الأموية",
    regions: ["sham", "andalus", "maghrib", "hijaz", "iraq", "hind", "egypt"],
    fill: "oklch(0.7 0.13 230 / 0.18)", stroke: "oklch(0.55 0.16 230 / 0.45)",
  },
  {
    era: "abbasid", label: "نفوذ الدولة العباسية",
    regions: ["iraq", "khorasan", "transoxiana", "hijaz", "sham", "egypt"],
    fill: "oklch(0.68 0.16 300 / 0.16)", stroke: "oklch(0.5 0.18 300 / 0.45)",
  },
  {
    era: "ayyubid", label: "نفوذ الدولة الأيوبية",
    regions: ["egypt", "sham"],
    fill: "oklch(0.78 0.14 70 / 0.22)", stroke: "oklch(0.55 0.16 60 / 0.55)",
  },
];

export function overlayForEra(era: string | null): StateOverlay | undefined {
  if (!era) return undefined;
  return STATE_OVERLAYS.find(s => s.era === era);
}

// ============================================================
// Coverage stats (used by the dev panel and content-audit page).
// ============================================================

export interface AtlasCoverage {
  capableTotal: number;     // atlas-eligible entities (right types)
  covered: number;          // entities actually placed
  uncovered: PackEntity[];  // atlas-eligible but missing coords
  byKind: Record<AtlasPinKind, number>;
  percent: number;          // covered / capableTotal
}

export function atlasCoverage(): AtlasCoverage {
  const byKind: Record<AtlasPinKind, number> = {
    capital: 0, city: 0, battle: 0, event: 0, landmark: 0, state: 0,
  };
  let capableTotal = 0;
  let covered = 0;
  const uncovered: PackEntity[] = [];
  for (const e of allPackEntities()) {
    if (!ATLAS_TYPES.has(e.type)) continue;
    const m = e.meta as { locked?: boolean; kind?: string } | undefined;
    if (m?.locked && m?.kind === "campaign-placeholder") continue;
    capableTotal++;
    const pin = placeEntity(e);
    if (pin) { covered++; byKind[pin.kind]++; }
    else uncovered.push(e);
  }
  return {
    capableTotal, covered, uncovered, byKind,
    percent: capableTotal === 0 ? 0 : Math.round((covered / capableTotal) * 100),
  };
}

/** Distinct era ids surfaced by atlas-capable entities (for filter chips). */
export function atlasEras(): string[] {
  const set = new Set<string>();
  for (const p of allAtlasPins()) if (p.era) set.add(p.era);
  return Array.from(set);
}
