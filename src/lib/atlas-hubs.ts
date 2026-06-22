// Phase 3 — Cinematic Atlas: derive tiers (regions, cities, landmarks, entities)
// and hub-entity links purely from encyclopedia_entities + atlas-regions.
// No schema change. Reuses metadata.coords / metadata.region already in use.
import { useMemo } from "react";
import {
  extractCoords,
  extractEra,
  type MapCoords,
  type WorldEntity,
  type WorldEntityType,
} from "./world-map-source";
import { ATLAS_REGIONS, type AtlasRegion, type AtlasRegionId } from "./atlas-regions";

export type Tier = 1 | 2 | 3 | 4;

export type AtlasFilters = {
  era: string | null;
  type: WorldEntityType | null;
  search: string;
};

export type HubMarker = WorldEntity & {
  coords: MapCoords;
  region: AtlasRegionId | null;
};

export type AtlasLayers = {
  regions: AtlasRegion[];
  cities: HubMarker[];     // entity_type === 'city'
  landmarks: HubMarker[];  // entity_type === 'landmark'
  entities: HubMarker[];   // figure/battle/event/artifact/state
  needsLocation: WorldEntity[];
};

// Point-in-polygon (ray casting) over the 100x60 atlas space.
function pip(point: MapCoords, poly: string): boolean {
  const pts = poly
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number]);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function resolveRegion(meta: Record<string, unknown>, coords: MapCoords): AtlasRegionId | null {
  const stored = meta.region;
  if (typeof stored === "string") {
    const hit = ATLAS_REGIONS.find((r) => r.id === stored || r.name === stored);
    if (hit) return hit.id;
  }
  for (const r of ATLAS_REGIONS) if (pip(coords, r.polygon)) return r.id;
  return null;
}

export function useAtlasLayers(
  entities: WorldEntity[] | undefined,
  filters: AtlasFilters,
): AtlasLayers {
  return useMemo(() => {
    const all = entities ?? [];
    const q = filters.search.trim().toLowerCase();
    const passes = (e: WorldEntity): boolean => {
      if (filters.type && e.entity_type !== filters.type) return false;
      if (filters.era && extractEra(e.metadata) !== filters.era) return false;
      if (q && !(e.title.toLowerCase().includes(q) || (e.subtitle ?? "").toLowerCase().includes(q)))
        return false;
      return true;
    };

    const cities: HubMarker[] = [];
    const landmarks: HubMarker[] = [];
    const entitiesLayer: HubMarker[] = [];
    const needsLocation: WorldEntity[] = [];

    for (const e of all) {
      const coords = extractCoords(e.metadata);
      if (!coords) {
        if (passes(e)) needsLocation.push(e);
        continue;
      }
      if (!passes(e)) continue;
      const region = resolveRegion(e.metadata, coords);
      const m: HubMarker = { ...e, coords, region };
      if (e.entity_type === "city") cities.push(m);
      else if (e.entity_type === "landmark") landmarks.push(m);
      else entitiesLayer.push(m);
    }

    return {
      regions: ATLAS_REGIONS,
      cities,
      landmarks,
      entities: entitiesLayer,
      needsLocation,
    };
  }, [entities, filters.era, filters.type, filters.search]);
}

/** Entities linked to a hub: same region OR metadata.linked_place_id === hub.slug. */
export function useHubEntities(
  all: WorldEntity[] | undefined,
  hub: HubMarker | null,
): WorldEntity[] {
  return useMemo(() => {
    if (!hub || !all) return [];
    const out: WorldEntity[] = [];
    for (const e of all) {
      if (e.id === hub.id) continue;
      const link = (e.metadata as { linked_place_id?: unknown }).linked_place_id;
      if (typeof link === "string" && link === hub.slug) {
        out.push(e);
        continue;
      }
      if (!hub.region) continue;
      const r = (e.metadata as { region?: unknown }).region;
      if (typeof r === "string") {
        const hit = ATLAS_REGIONS.find((x) => x.id === r || x.name === r);
        if (hit && hit.id === hub.region) out.push(e);
      }
    }
    const rank: Record<WorldEntityType, number> = {
      figure: 0, battle: 1, event: 2, artifact: 3, state: 4, landmark: 5, city: 6,
    };
    return out.sort((a, b) => rank[a.entity_type] - rank[b.entity_type]);
  }, [all, hub]);
}

/**
 * Full entity context for the EntityPanel.
 *
 * Auto-surfaces, in order:
 *   1. Direct `metadata.linked_place_id === hub.slug` (curator-asserted).
 *   2. Shared region (same `metadata.region`).
 *   3. Shared era + region pair (boosts ranking).
 *   4. Proximity neighbours on the atlas (excluded from "related" to avoid dupes).
 *
 * All derivation is client-side over the already-loaded world-map dataset, so
 * the panel opens instantly without an extra network round-trip.
 */
export function useEntityContext(
  all: WorldEntity[] | undefined,
  hub: HubMarker | null,
  opts: { proximityRadius?: number; nearbyLimit?: number } = {},
): { related: WorldEntity[]; nearby: (WorldEntity & { distance: number })[] } {
  const proximityRadius = opts.proximityRadius ?? 6;   // viewBox units (atlas 100×60)
  const nearbyLimit = opts.nearbyLimit ?? 8;

  return useMemo(() => {
    if (!hub || !all) return { related: [], nearby: [] };

    const hubEra = (hub.metadata as { era?: unknown }).era;
    const relatedSet = new Map<string, WorldEntity>();

    // 1+2+3 — relational surfacing
    for (const e of all) {
      if (e.id === hub.id) continue;
      const meta = e.metadata as { linked_place_id?: unknown; region?: unknown };
      let matched = false;

      if (typeof meta.linked_place_id === "string" && meta.linked_place_id === hub.slug) {
        matched = true;
      } else if (hub.region && typeof meta.region === "string") {
        const hit = ATLAS_REGIONS.find((x) => x.id === meta.region || x.name === meta.region);
        if (hit && hit.id === hub.region) matched = true;
      }

      if (matched) relatedSet.set(e.id, e);
    }

    // Ranking: era-match within region gets bumped first inside its type group.
    const typeRank: Record<WorldEntityType, number> = {
      figure: 0, battle: 1, event: 2, artifact: 3, state: 4, landmark: 5, city: 6,
    };
    const related = Array.from(relatedSet.values()).sort((a, b) => {
      const dt = typeRank[a.entity_type] - typeRank[b.entity_type];
      if (dt !== 0) return dt;
      const ae = (a.metadata as { era?: unknown }).era === hubEra ? 0 : 1;
      const be = (b.metadata as { era?: unknown }).era === hubEra ? 0 : 1;
      return ae - be;
    });

    // 4 — proximity neighbours not already in related
    const nearby: (WorldEntity & { distance: number })[] = [];
    for (const e of all) {
      if (e.id === hub.id || relatedSet.has(e.id)) continue;
      const c = (e.metadata as { coords?: { x?: unknown; y?: unknown } }).coords;
      if (!c || typeof c.x !== "number" || typeof c.y !== "number") continue;
      const dx = c.x - hub.coords.x;
      const dy = c.y - hub.coords.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= proximityRadius) nearby.push({ ...e, distance });
    }
    nearby.sort((a, b) => a.distance - b.distance);

    return { related, nearby: nearby.slice(0, nearbyLimit) };
  }, [all, hub, proximityRadius, nearbyLimit]);
}


export function tierForScale(scale: number): Tier {
  if (scale < 1.8) return 1;
  if (scale < 3.5) return 2;
  if (scale < 6) return 3;
  return 4;
}

export const TIER_LABEL: Record<Tier, string> = {
  1: "الأقاليم",
  2: "المدن",
  3: "المعالم",
  4: "التفاصيل التاريخية",
};
