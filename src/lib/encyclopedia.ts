import {
  allPackEntities, entitiesByType, neighborsOf, getPackEntity,
} from "./packs/registry";
import type { PackEntity, PackEntityType } from "./packs/types";

// ============================================================
// Encyclopedia helpers — pure data, no UI.
// Operates entirely on the existing Content Packs.
// ============================================================

export type EncyclopediaSection =
  | "state" | "figure" | "scholar" | "battle"
  | "city"  | "event"  | "landmark" | "artifact";

export const SECTION_LABELS: Record<EncyclopediaSection, string> = {
  state:    "الدول",
  figure:   "الشخصيات",
  scholar:  "العلماء",
  battle:   "المعارك",
  city:     "المدن",
  event:    "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};

export const SECTION_GLYPHS: Record<EncyclopediaSection, string> = {
  state: "🏛️", figure: "🪶", scholar: "📚", battle: "⚔️",
  city: "🏙️", event: "📜", landmark: "🕌", artifact: "🗝️",
};

/** Era ids known to the packs (matches bridges.era and data.ts ERAS). */
export const KNOWN_ERAS: { id: string; label: string }[] = [
  { id: "rashidun", label: "الخلافة الراشدة" },
  { id: "umayyad", label: "الدولة الأموية" },
  { id: "abbasid", label: "الدولة العباسية" },
  { id: "ayyubid", label: "الدولة الأيوبية" },
  { id: "mamluk", label: "الدولة المملوكية" },
  { id: "andalusia", label: "الأندلس الإسلامية" },
  { id: "ottoman", label: "الدولة العثمانية" },
  { id: "seljuk", label: "الدولة السلجوقية" },
  { id: "zengid", label: "الدولة الزنكية" },
  { id: "murabitun", label: "دولة المرابطين" },
  { id: "muwahhidun", label: "دولة الموحدين" },
];

function isScholar(e: PackEntity): boolean {
  return e.type === "figure" && (e.meta as { kind?: string } | undefined)?.kind === "scholar";
}

/** True pack-entity-type for an encyclopedia section. */
function baseTypeFor(section: EncyclopediaSection): PackEntityType {
  return section === "scholar" ? "figure" : (section as PackEntityType);
}

/** All entities for a section (scholars carved out of figures). */
export function entitiesForSection(section: EncyclopediaSection): PackEntity[] {
  if (section === "figure")  return entitiesByType("figure").filter(e => !isScholar(e));
  if (section === "scholar") return entitiesByType("figure").filter(isScholar);
  return entitiesByType(baseTypeFor(section));
}

/** Era id for an entity if it declares one. */
export function entityEra(e: PackEntity): string | undefined {
  return e.bridges?.era;
}

/** Skip locked future-campaign placeholders from generic listings. */
function isCampaignPlaceholder(e: PackEntity): boolean {
  const m = e.meta as { kind?: string; locked?: boolean } | undefined;
  return Boolean(m?.locked && m?.kind === "campaign-placeholder");
}

export function browsable(entities: PackEntity[]): PackEntity[] {
  return entities.filter(e => !isCampaignPlaceholder(e));
}

export interface BrowseFilters {
  query?: string;
  era?: string;
  state?: string; // alias for era (state pages = era buckets)
}

const normalize = (s: string) =>
  s.toLocaleLowerCase("ar").replace(/[\u064B-\u0652\u0670]/g, ""); // strip Arabic diacritics

export function applyFilters(entities: PackEntity[], f: BrowseFilters): PackEntity[] {
  let out = browsable(entities);
  const era = f.era ?? f.state;
  if (era) out = out.filter(e => entityEra(e) === era);
  if (f.query && f.query.trim()) {
    const q = normalize(f.query.trim());
    out = out.filter(e =>
      normalize(e.title).includes(q) ||
      normalize(e.description).includes(q) ||
      (e.latin && e.latin.toLowerCase().includes(q.toLowerCase()))
    );
  }
  return out;
}

/** Search across every section, returns ranked entities. */
export function searchAll(query: string, era?: string, limit = 24): PackEntity[] {
  const all = applyFilters(allPackEntities(), { query, era });
  return all.slice(0, limit);
}

/** Section counts for the hub header. */
export function sectionCounts(): Record<EncyclopediaSection, number> {
  const out = {} as Record<EncyclopediaSection, number>;
  (Object.keys(SECTION_LABELS) as EncyclopediaSection[]).forEach(s => {
    out[s] = browsable(entitiesForSection(s)).length;
  });
  return out;
}

/** All entities tied to a given state id (era bridge), grouped by section. */
export function stateEntities(stateId: string): Record<EncyclopediaSection, PackEntity[]> {
  const all = browsable(allPackEntities()).filter(e => entityEra(e) === stateId);
  const groups = {} as Record<EncyclopediaSection, PackEntity[]>;
  (Object.keys(SECTION_LABELS) as EncyclopediaSection[]).forEach(s => (groups[s] = []));
  for (const e of all) {
    if (e.type === "figure") {
      (isScholar(e) ? groups.scholar : groups.figure).push(e);
    } else if ((SECTION_LABELS as Record<string, string>)[e.type]) {
      groups[e.type as EncyclopediaSection].push(e);
    }
  }
  return groups;
}

/** Find the State entity for an era id (e.g. "abbasid" → abbasid.state.abbasid). */
export function stateEntityForEra(stateId: string): PackEntity | undefined {
  return entitiesByType("state").find(e => entityEra(e) === stateId);
}

/** Sort by chronology then title. */
export function sortChrono(entities: PackEntity[]): PackEntity[] {
  return entities.slice().sort((a, b) =>
    a.timelinePosition - b.timelinePosition || a.title.localeCompare(b.title, "ar")
  );
}

/** First-degree neighbours, grouped per section, for an entity-detail page. */
export function neighboursGrouped(id: string): Record<EncyclopediaSection, PackEntity[]> {
  const groups = {} as Record<EncyclopediaSection, PackEntity[]>;
  (Object.keys(SECTION_LABELS) as EncyclopediaSection[]).forEach(s => (groups[s] = []));
  for (const e of neighborsOf(id)) {
    if (isCampaignPlaceholder(e)) continue;
    if (e.type === "figure") {
      (isScholar(e) ? groups.scholar : groups.figure).push(e);
    } else if ((SECTION_LABELS as Record<string, string>)[e.type]) {
      groups[e.type as EncyclopediaSection].push(e);
    }
  }
  return groups;
}

export { getPackEntity };