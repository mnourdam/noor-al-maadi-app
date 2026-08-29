// ============================================================
// Stories — local title resolution for derived prerequisites
// ------------------------------------------------------------
// Pure, presentational lookup over already-loaded local indexes
// (packaged baseline / local-first store). Never fetches.
// ============================================================

import type { PrereqTitleResolver } from "./derive-prereqs";

type Row = Record<string, any>;

export interface LocalTitleSources {
  stories?: Row[];
  entities?: Row[];
  campaigns?: Row[];
  investigations?: Row[];
}

function titleOf(row: Row | undefined | null): string | null {
  if (!row) return null;
  const v =
    row.title_ar ?? row.name_ar ?? row.title ?? row.name ??
    row.title_en ?? row.name_en ?? null;
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function indexRows(rows: Row[] | undefined): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows ?? []) {
    if (!r) continue;
    if (r.id != null) m.set(String(r.id).toLowerCase(), r);
    if (r.slug != null && !m.has(String(r.slug).toLowerCase())) {
      m.set(String(r.slug).toLowerCase(), r);
    }
    if (r.stable_id != null && !m.has(String(r.stable_id).toLowerCase())) {
      m.set(String(r.stable_id).toLowerCase(), r);
    }
  }
  return m;
}

/** Build a resolver over the supplied local indexes. */
export function createLocalTitleResolver(sources: LocalTitleSources): PrereqTitleResolver {
  const stories = indexRows(sources.stories);
  const entities = indexRows(sources.entities);
  const campaigns = indexRows(sources.campaigns);
  const investigations = indexRows(sources.investigations);

  return (kind: string, ref: string): string | null => {
    const key = String(ref ?? "").trim().toLowerCase();
    if (!key) return null;
    switch (kind) {
      case "story_completed":
        return titleOf(stories.get(key));
      case "entity_discovered":
      case "atlas_location_visited":
      case "artifact_owned":
        return titleOf(entities.get(key));
      case "campaign_completed":
        return titleOf(campaigns.get(key));
      case "campaign_chapter_complete":
        return titleOf(campaigns.get(key.split("::")[0] ?? ""));
      case "investigation_completed":
        return titleOf(investigations.get(key));
      default:
        return null;
    }
  };
}

/** Resolver backed by the live local-first store + packaged baseline. */
export async function defaultLocalTitleResolver(): Promise<PrereqTitleResolver> {
  try {
    const store = await import("@/lib/local-first-store");
    const { getLocalLibraryStories } = await import("@/lib/offline-baseline-resolver");
    let stories: Row[] = [];
    try { stories = getLocalLibraryStories() as Row[]; } catch { /* ignore */ }
    if (!stories.length) {
      try { stories = store.localStoriesAll() as Row[]; } catch { /* ignore */ }
    }
    return createLocalTitleResolver({
      stories,
      entities: safe(() => store.localEncyclopediaAll() as Row[]).concat(
        safe(() => store.localAtlasEntities() as Row[]),
      ),
      campaigns: safe(() => store.localPublishedCampaigns() as Row[]),
      investigations: safe(() => store.localInvestigations() as Row[]),
    });
  } catch {
    return () => null;
  }
}

function safe(fn: () => Row[]): Row[] {
  try { const v = fn(); return Array.isArray(v) ? v : []; } catch { return []; }
}
