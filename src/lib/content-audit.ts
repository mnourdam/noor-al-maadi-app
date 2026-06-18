import { CONTENT_PACKS, allPackEntities } from "./packs/registry";
import type { ContentPack, PackEntity, PackEntityType } from "./packs/types";
import { ENGINE_CAMPAIGNS } from "./campaign-engine/registry";
import type { EntityLink } from "./campaign-engine/types";
import { ACHIEVEMENTS } from "./data";

// ============================================================
// Content Audit — pure analytics over the Content Pack registry.
// Nothing is hardcoded; everything recomputes when packs change.
// ============================================================

function isScholar(e: PackEntity): boolean {
  return e.type === "figure" && (e.meta as { kind?: string } | undefined)?.kind === "scholar";
}
function isCampaignPlaceholder(e: PackEntity): boolean {
  const m = e.meta as { kind?: string; locked?: boolean } | undefined;
  return Boolean(m?.locked && m?.kind === "campaign-placeholder");
}

export interface AuditEntityBuckets {
  state: number; figure: number; scholar: number;
  city: number; battle: number; event: number;
  landmark: number; artifact: number; achievement: number;
}

export function bucketCounts(entities: PackEntity[]): AuditEntityBuckets {
  const b: AuditEntityBuckets = {
    state: 0, figure: 0, scholar: 0, city: 0, battle: 0,
    event: 0, landmark: 0, artifact: 0, achievement: 0,
  };
  for (const e of entities) {
    if (e.type === "figure") {
      if (isScholar(e)) b.scholar++; else b.figure++;
    } else {
      b[e.type as Exclude<PackEntityType, "figure">]++;
    }
  }
  return b;
}

export interface PackStats {
  pack: ContentPack;
  buckets: AuditEntityBuckets;
  campaigns: number;
  total: number;
  relationships: number;
}

export function packStats(): PackStats[] {
  return CONTENT_PACKS.map(pack => {
    const buckets = bucketCounts(pack.entities);
    const relationships = pack.entities.reduce((n, e) => n + e.relatedEntities.length, 0);
    const campaigns = ENGINE_CAMPAIGNS.filter(c => c.packId === pack.id).length;
    return { pack, buckets, campaigns, total: pack.entities.length, relationships };
  });
}

function collectCampaignRefs(): Set<string> {
  const out = new Set<string>();
  const push = (links?: EntityLink[]) => links?.forEach(l => out.add(l.id));
  for (const c of ENGINE_CAMPAIGNS) {
    push(c.related);
    if (c.packId) out.add(c.packId);
    for (const ch of c.chapters) {
      push(ch.figures); push(ch.locations); push(ch.events);
      const u = ch.unlocks;
      if (!u) continue;
      [u.characters, u.artifacts, u.cities, u.regions, u.battles,
       u.events, u.states, u.packEntities].forEach(arr => arr?.forEach(id => out.add(id)));
    }
  }
  return out;
}

function entityMatchesRef(e: PackEntity, ids: Set<string>): boolean {
  if (ids.has(e.id)) return true;
  const b = e.bridges;
  if (!b) return false;
  return Boolean(
    (b.characterId && ids.has(b.characterId)) ||
    (b.cityId && ids.has(b.cityId)) ||
    (b.battleId && ids.has(b.battleId)) ||
    (b.regionId && ids.has(b.regionId)) ||
    (b.artifactId && ids.has(b.artifactId)) ||
    (b.storyId && ids.has(b.storyId))
  );
}

export interface CoverageStats {
  total: number;
  timeline: number;
  atlas: number;
  campaign: number;
  museum: number;
}

export function coverageStats(): CoverageStats {
  const all = allPackEntities();
  const refs = collectCampaignRefs();
  let timeline = 0, atlas = 0, campaign = 0, museum = 0;
  for (const e of all) {
    if (e.timelinePosition && e.timelinePosition > 0) timeline++;
    if (e.type === "city" || e.bridges?.cityId || e.bridges?.regionId) atlas++;
    if (entityMatchesRef(e, refs)) campaign++;
    if (e.type === "artifact" || e.type === "landmark" || e.type === "achievement") museum++;
  }
  return { total: all.length, timeline, atlas, campaign, museum };
}

export interface GapList {
  noDescription: PackEntity[];
  noRelations: PackEntity[];
  noTimeline: PackEntity[];
  noImage: PackEntity[];
  noAtlas: PackEntity[];
  orphans: PackEntity[];     // no incoming or outgoing relationship
  unused: PackEntity[];      // not referenced by any campaign
  unreachable: PackEntity[]; // locked / not browsable
}

export function gapList(): GapList {
  const all = allPackEntities();
  const refs = collectCampaignRefs();

  const incoming = new Map<string, number>();
  for (const e of all) for (const r of e.relatedEntities) {
    incoming.set(r, (incoming.get(r) ?? 0) + 1);
  }

  const noDescription: PackEntity[] = [];
  const noRelations: PackEntity[] = [];
  const noTimeline: PackEntity[] = [];
  const noImage: PackEntity[] = [];
  const noAtlas: PackEntity[] = [];
  const orphans: PackEntity[] = [];
  const unused: PackEntity[] = [];
  const unreachable: PackEntity[] = [];

  for (const e of all) {
    if (!e.description || e.description.trim().length < 24) noDescription.push(e);
    if (e.relatedEntities.length === 0) noRelations.push(e);
    if (!e.timelinePosition || e.timelinePosition <= 0) noTimeline.push(e);
    if (!e.image?.glyph) noImage.push(e);
    if (!(e.type === "city" || e.bridges?.cityId || e.bridges?.regionId)) noAtlas.push(e);
    const inc = incoming.get(e.id) ?? 0;
    if (inc === 0 && e.relatedEntities.length === 0) orphans.push(e);
    if (!entityMatchesRef(e, refs)) unused.push(e);
    if (isCampaignPlaceholder(e)) unreachable.push(e);
  }

  return { noDescription, noRelations, noTimeline, noImage, noAtlas, orphans, unused, unreachable };
}

export interface HealthScore {
  completeness: number;     // 0..100
  relationships: number;    // 0..100
  navigation: number;       // 0..100
  overall: number;          // 0..100
}

export function healthScore(): HealthScore {
  const all = allPackEntities();
  const total = Math.max(1, all.length);
  let complete = 0, related = 0, reachable = 0;
  for (const e of all) {
    const hasDesc = e.description && e.description.trim().length >= 24;
    const hasImg = !!e.image?.glyph;
    const hasTime = !!e.timelinePosition && e.timelinePosition > 0;
    if (hasDesc && hasImg && hasTime) complete++;
    if (e.relatedEntities.length > 0) related++;
    if (!isCampaignPlaceholder(e)) reachable++;
  }
  const completeness = Math.round((complete / total) * 100);
  const relationships = Math.round((related / total) * 100);
  const navigation = Math.round((reachable / total) * 100);
  const overall = Math.round((completeness + relationships + navigation) / 3);
  return { completeness, relationships, navigation, overall };
}

export interface AuditReport {
  totals: AuditEntityBuckets & {
    campaigns: number;
    achievementsLegacy: number;
    entitiesTotal: number;
    relationships: number;
    packs: number;
  };
  packs: PackStats[];
  coverage: CoverageStats;
  gaps: GapList;
  health: HealthScore;
  largestPack?: PackStats;
  mostConnected?: { entity: PackEntity; degree: number };
  leastConnected?: { entity: PackEntity; degree: number };
}

export function buildAuditReport(): AuditReport {
  const all = allPackEntities();
  const buckets = bucketCounts(all);
  const relationships = all.reduce((n, e) => n + e.relatedEntities.length, 0);
  const packs = packStats();

  const incoming = new Map<string, number>();
  for (const e of all) for (const r of e.relatedEntities) {
    incoming.set(r, (incoming.get(r) ?? 0) + 1);
  }
  const degreeOf = (e: PackEntity) =>
    e.relatedEntities.length + (incoming.get(e.id) ?? 0);

  const ranked = all
    .filter(e => !isCampaignPlaceholder(e))
    .map(e => ({ entity: e, degree: degreeOf(e) }))
    .sort((a, b) => b.degree - a.degree);

  return {
    totals: {
      ...buckets,
      campaigns: ENGINE_CAMPAIGNS.length,
      achievementsLegacy: ACHIEVEMENTS.length,
      entitiesTotal: all.length,
      relationships,
      packs: CONTENT_PACKS.length,
    },
    packs,
    coverage: coverageStats(),
    gaps: gapList(),
    health: healthScore(),
    largestPack: packs.slice().sort((a, b) => b.total - a.total)[0],
    mostConnected: ranked[0],
    leastConnected: ranked[ranked.length - 1],
  };
}
