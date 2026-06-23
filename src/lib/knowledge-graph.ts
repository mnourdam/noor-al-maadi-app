import {
  CHARACTERS, CHARACTER_PROFILES, BATTLE_PROFILES, MAP_REGIONS,
  ARTIFACTS, STORIES, CAMPAIGNS, ERAS,
  type Era, type CharacterCard, type BattleProfile, type MapRegion,
  type Artifact, type Story, type Campaign,
} from "./data";
import {
  CITIES, citiesForCharacter, citiesForBattle, citiesForArtifact,
  citiesForStory, citiesForEra, citiesInRegion, getCity,
  type CityProfile,
} from "./cities";
import { packEntitiesForBridge, neighborsOf } from "./packs/registry";

export type EntityKind = "character" | "battle" | "region" | "story" | "artifact" | "campaign" | "city";

export type EntityRef =
  | { kind: "character"; id: string }
  | { kind: "battle"; id: string }
  | { kind: "region"; id: string }
  | { kind: "story"; id: string }
  | { kind: "artifact"; id: string }
  | { kind: "campaign"; era: Era }
  | { kind: "city"; id: string };

export interface RelatedGraph {
  characters: CharacterCard[];
  battles: BattleProfile[];
  regions: MapRegion[];
  artifacts: Artifact[];
  stories: Story[];
  campaigns: Campaign[];
  cities: CityProfile[];
  eras: Era[];
}

const empty = (): RelatedGraph => ({
  characters: [], battles: [], regions: [], artifacts: [], stories: [], campaigns: [], cities: [], eras: [],
});

function uniq<T>(arr: T[], keyOf: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyOf(x);
    if (seen.has(k)) continue;
    seen.add(k); out.push(x);
  }
  return out;
}

function fromCharacter(id: string): RelatedGraph {
  const g = empty();
  const card = CHARACTERS.find(c => c.id === id);
  const prof = CHARACTER_PROFILES[id];
  if (!card) return g;
  g.eras.push(card.era);
  if (prof) {
    g.characters.push(...CHARACTERS.filter(c => prof.relatedCharacterIds.includes(c.id)));
    g.artifacts.push(...ARTIFACTS.filter(a => prof.artifactIds.includes(a.id)));
    g.regions.push(...MAP_REGIONS.filter(r => prof.regionIds.includes(r.id)));
    g.eras.push(...prof.campaignEras);
    for (const b of prof.battles) {
      if (b.storyId) { const s = STORIES.find(s => s.id === b.storyId); if (s) g.stories.push(s); }
    }
  }
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => b.relatedCharacterIds.includes(id)));
  g.regions.push(...MAP_REGIONS.filter(r => r.characterIds?.includes(id)));
  g.cities.push(...citiesForCharacter(id));
  return g;
}

function fromBattle(id: string): RelatedGraph {
  const g = empty();
  const b = BATTLE_PROFILES[id]; if (!b) return g;
  g.eras.push(b.era, ...b.campaignEras);
  g.characters.push(...CHARACTERS.filter(c => b.relatedCharacterIds.includes(c.id)));
  g.regions.push(...MAP_REGIONS.filter(r => b.relatedRegionIds.includes(r.id)));
  g.artifacts.push(...ARTIFACTS.filter(a => b.relatedArtifactIds.includes(a.id)));
  if (b.storyId) { const s = STORIES.find(s => s.id === b.storyId); if (s) g.stories.push(s); }
  g.cities.push(...citiesForBattle(id));
  return g;
}

function fromRegion(id: string): RelatedGraph {
  const g = empty();
  const r = MAP_REGIONS.find(x => x.id === id); if (!r) return g;
  g.eras.push(r.era);
  if (r.campaignEra) g.eras.push(r.campaignEra);
  g.characters.push(...CHARACTERS.filter(c => r.characterIds?.includes(c.id)));
  g.stories.push(...STORIES.filter(s => r.storyIds?.includes(s.id)));
  if (r.unlocksArtifact) { const a = ARTIFACTS.find(a => a.id === r.unlocksArtifact); if (a) g.artifacts.push(a); }
  for (const [cid, prof] of Object.entries(CHARACTER_PROFILES)) {
    if (prof.regionIds.includes(id)) { const c = CHARACTERS.find(c => c.id === cid); if (c) g.characters.push(c); }
  }
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => b.relatedRegionIds.includes(id)));
  g.cities.push(...citiesInRegion(id));
  return g;
}

function fromStory(id: string): RelatedGraph {
  const g = empty();
  const s = STORIES.find(x => x.id === id); if (!s) return g;
  g.eras.push(s.era);
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => b.storyId === id));
  for (const [cid, prof] of Object.entries(CHARACTER_PROFILES)) {
    if (prof.battles.some(b => b.storyId === id)) {
      const c = CHARACTERS.find(c => c.id === cid); if (c) g.characters.push(c);
    }
  }
  g.regions.push(...MAP_REGIONS.filter(r => r.storyIds?.includes(id)));
  g.stories.push(...STORIES.filter(x => x.era === s.era && x.id !== id));
  g.cities.push(...citiesForStory(id));
  return g;
}

function fromArtifact(id: string): RelatedGraph {
  const g = empty();
  const a = ARTIFACTS.find(x => x.id === id); if (!a) return g;
  g.eras.push(a.era);
  g.regions.push(...MAP_REGIONS.filter(r => r.unlocksArtifact === id));
  for (const [cid, prof] of Object.entries(CHARACTER_PROFILES)) {
    if (prof.artifactIds.includes(id)) { const c = CHARACTERS.find(c => c.id === cid); if (c) g.characters.push(c); }
  }
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => b.relatedArtifactIds.includes(id)));
  g.cities.push(...citiesForArtifact(id));
  return g;
}

function fromCampaign(era: Era): RelatedGraph {
  const g = empty();
  g.eras.push(era);
  g.characters.push(...CHARACTERS.filter(c => c.era === era));
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => b.era === era || b.campaignEras.includes(era)));
  g.regions.push(...MAP_REGIONS.filter(r => r.era === era || r.campaignEra === era));
  g.artifacts.push(...ARTIFACTS.filter(a => a.era === era));
  g.stories.push(...STORIES.filter(s => s.era === era));
  g.cities.push(...citiesForEra(era));
  return g;
}

function fromCity(id: string): RelatedGraph {
  const g = empty();
  const c = getCity(id); if (!c) return g;
  g.eras.push(...c.eras, ...c.campaignEras);
  g.characters.push(...CHARACTERS.filter(x => c.characterIds.includes(x.id)));
  g.battles.push(...Object.values(BATTLE_PROFILES).filter(b => c.battleIds.includes(b.id)));
  g.artifacts.push(...ARTIFACTS.filter(a => c.artifactIds.includes(a.id)));
  g.stories.push(...STORIES.filter(s => c.storyIds.includes(s.id)));
  const region = MAP_REGIONS.find(r => r.id === c.regionId);
  if (region) g.regions.push(region);
  // sister cities in same region / overlapping eras
  g.cities.push(...CITIES.filter(other => other.id !== id && (other.regionId === c.regionId || other.eras.some(e => c.eras.includes(e)))));
  return g;
}

export function buildRelations(ref: EntityRef): RelatedGraph {
  const g =
    ref.kind === "character" ? fromCharacter(ref.id) :
    ref.kind === "battle"    ? fromBattle(ref.id) :
    ref.kind === "region"    ? fromRegion(ref.id) :
    ref.kind === "story"     ? fromStory(ref.id) :
    ref.kind === "artifact"  ? fromArtifact(ref.id) :
    ref.kind === "city"      ? fromCity(ref.id) :
    fromCampaign(ref.era);

  // ---- Content-pack augmentation -----------------------------------------
  // Pull pack entities that bridge to this ref's legacy id, then surface
  // their neighbours back into the legacy graph so Related History stays in
  // sync as future packs add new entities.
  const bridgeKey =
    ref.kind === "character" ? "characterId" :
    ref.kind === "battle"    ? "battleId"    :
    ref.kind === "region"    ? "regionId"    :
    ref.kind === "story"     ? "storyId"     :
    ref.kind === "artifact"  ? "artifactId"  :
    ref.kind === "city"      ? "cityId"      :
    "era";
  const bridgeId = ref.kind === "campaign" ? ref.era : (ref as { id: string }).id;
  const seedEntities = packEntitiesForBridge(bridgeKey as never, bridgeId);
  const packNeighbours = seedEntities.flatMap(e => [e, ...neighborsOf(e.id)]);
  for (const pe of packNeighbours) {
    const b = pe.bridges; if (!b) continue;
    if (b.characterId) { const c = CHARACTERS.find(x => x.id === b.characterId); if (c) g.characters.push(c); }
    if (b.battleId)    { const bp = BATTLE_PROFILES[b.battleId]; if (bp) g.battles.push(bp); }
    if (b.regionId)    { const r = MAP_REGIONS.find(x => x.id === b.regionId); if (r) g.regions.push(r); }
    if (b.cityId)      { const ct = getCity(b.cityId); if (ct) g.cities.push(ct); }
    if (b.artifactId)  { const a = ARTIFACTS.find(x => x.id === b.artifactId); if (a) g.artifacts.push(a); }
    if (b.storyId)     { const s = STORIES.find(x => x.id === b.storyId); if (s) g.stories.push(s); }
    if (b.era)         { g.eras.push(b.era as Era); }
  }
  // ------------------------------------------------------------------------

  const eras = Array.from(new Set(g.eras));
  g.campaigns = CAMPAIGNS.filter(c => eras.includes(c.eraId));
  g.characters = uniq(g.characters, c => c.id).filter(c => !(ref.kind === "character" && c.id === ref.id));
  g.battles = uniq(g.battles, b => b.id).filter(b => !(ref.kind === "battle" && b.id === ref.id));
  g.regions = uniq(g.regions, r => r.id).filter(r => !(ref.kind === "region" && r.id === ref.id));
  g.artifacts = uniq(g.artifacts, a => a.id).filter(a => !(ref.kind === "artifact" && a.id === ref.id));
  g.stories = uniq(g.stories, s => s.id).filter(s => !(ref.kind === "story" && s.id === ref.id));
  g.cities = uniq(g.cities, c => c.id).filter(c => !(ref.kind === "city" && c.id === ref.id));
  g.eras = eras;
  return g;
}

export interface Recommendation {
  kind: EntityKind;
  id: string;
  label: string;
  sublabel?: string;
  icon: string;
  score: number;
}

export function recommend(ref: EntityRef, limit = 6): Recommendation[] {
  const first = buildRelations(ref);
  const scores = new Map<string, Recommendation>();
  const bump = (key: string, rec: Omit<Recommendation, "score">, weight = 1) => {
    const prev = scores.get(key);
    if (prev) prev.score += weight; else scores.set(key, { ...rec, score: weight });
  };
  for (const c of first.characters) bump(`c:${c.id}`, { kind: "character", id: c.id, label: c.name, sublabel: c.title, icon: c.avatar }, 2);
  for (const b of first.battles) bump(`b:${b.id}`, { kind: "battle", id: b.id, label: b.name, sublabel: b.subtitle, icon: b.hero }, 2);
  for (const r of first.regions) bump(`r:${r.id}`, { kind: "region", id: r.id, label: r.name, sublabel: r.capital, icon: r.glyph ?? "📍" }, 1);
  for (const a of first.artifacts) bump(`a:${a.id}`, { kind: "artifact", id: a.id, label: a.name, sublabel: a.typeLabel, icon: a.icon }, 1);
  for (const s of first.stories) bump(`s:${s.id}`, { kind: "story", id: s.id, label: s.title, sublabel: `${s.readMinutes} د قراءة`, icon: "📜" }, 1);
  for (const ct of first.cities) bump(`ct:${ct.id}`, { kind: "city", id: ct.id, label: ct.name, sublabel: ct.honorific ?? ct.tagline, icon: ct.glyph }, 1.5);

  const hop = (e: EntityRef) => {
    const g = buildRelations(e);
    for (const c of g.characters) bump(`c:${c.id}`, { kind: "character", id: c.id, label: c.name, sublabel: c.title, icon: c.avatar }, 1);
    for (const b of g.battles) bump(`b:${b.id}`, { kind: "battle", id: b.id, label: b.name, sublabel: b.subtitle, icon: b.hero }, 1);
    for (const r of g.regions) bump(`r:${r.id}`, { kind: "region", id: r.id, label: r.name, sublabel: r.capital, icon: r.glyph ?? "📍" }, 0.5);
    for (const a of g.artifacts) bump(`a:${a.id}`, { kind: "artifact", id: a.id, label: a.name, sublabel: a.typeLabel, icon: a.icon }, 0.5);
    for (const s of g.stories) bump(`s:${s.id}`, { kind: "story", id: s.id, label: s.title, sublabel: `${s.readMinutes} د قراءة`, icon: "📜" }, 0.5);
    for (const ct of g.cities) bump(`ct:${ct.id}`, { kind: "city", id: ct.id, label: ct.name, sublabel: ct.honorific ?? ct.tagline, icon: ct.glyph }, 0.75);
  };
  for (const c of first.characters.slice(0, 4)) hop({ kind: "character", id: c.id });
  for (const b of first.battles.slice(0, 3)) hop({ kind: "battle", id: b.id });
  for (const r of first.regions.slice(0, 3)) hop({ kind: "region", id: r.id });

  const selfKey = ref.kind === "campaign" ? `era:${ref.era}` : `${ref.kind[0]}:${(ref as any).id}`;
  scores.delete(selfKey);
  return Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function eraName(era: Era): string {
  return ERAS.find(e => e.id === era)?.name ?? era;
}
