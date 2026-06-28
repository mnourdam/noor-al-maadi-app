/**
 * Local-first content store.
 *
 * Player-facing reads must hit local memory first, not Supabase. This
 * module eagerly loads the offline snapshot (IndexedDB if present, else
 * the bundled `/offline-snapshot.json` shipped with the APK) into RAM and
 * builds lookup indexes so route hooks can return cached content
 * synchronously as `initialData` while a background Supabase refresh
 * updates the cache later.
 *
 * The bundled snapshot is the floor — the app is fully browsable offline
 * even on the first launch with no network, because every player route
 * either accepts cached rows as initialData (encyclopedia, atlas) or
 * resolves the local copy first before any network call (campaigns,
 * today-in-history, investigations).
 *
 * Indexing is idempotent and best-effort; failures here never block UI.
 */
import { loadBundledSnapshot } from "./offline-snapshot";
import { loadSnapshot, type OfflineSnapshot } from "./offline-storage";

type Row = Record<string, any>;

let _ready = false;
let _readyPromise: Promise<void> | null = null;
let _snapshot: OfflineSnapshot | null = null;

const encyclopediaById = new Map<string, Row>();
const encyclopediaBySlug = new Map<string, Row[]>(); // slug → list across types
const encyclopediaByTypeSlug = new Map<string, Row>(); // `${type}::${slug}` → row
const encyclopediaByType = new Map<string, Row[]>();
const encyclopediaByAlias = new Map<string, Row>();
const encyclopediaByLegacyId = new Map<string, Row>();
let encyclopediaAll: Row[] = [];

const atlasPublished: Row[] = [];

const campaignsById = new Map<string, Row>();
const campaignsBySlug = new Map<string, Row>();
let campaignsAll: Row[] = [];

const investigationsBySlug = new Map<string, Row>();
let investigationsAll: Row[] = [];

const tihByMonthDay = new Map<string, Row[]>(); // `${m}-${d}` → list
let dailyFactsAll: Row[] = [];

function indexEncyclopedia(rows: Row[]) {
  encyclopediaById.clear();
  encyclopediaBySlug.clear();
  encyclopediaByTypeSlug.clear();
  encyclopediaByType.clear();
  encyclopediaByAlias.clear();
  encyclopediaByLegacyId.clear();
  encyclopediaAll = rows.filter((r) => r && r.enabled !== false);
  for (const r of encyclopediaAll) {
    if (r.id) encyclopediaById.set(r.id, r);
    if (r.slug) {
      const list = encyclopediaBySlug.get(r.slug) ?? [];
      list.push(r);
      encyclopediaBySlug.set(r.slug, list);
      if (r.entity_type) encyclopediaByTypeSlug.set(`${r.entity_type}::${r.slug}`, r);
    }
    if (r.entity_type) {
      const list = encyclopediaByType.get(r.entity_type) ?? [];
      list.push(r);
      encyclopediaByType.set(r.entity_type, list);
    }
    const meta = r.metadata as Record<string, any> | null | undefined;
    if (meta && typeof meta === "object") {
      if (Array.isArray(meta.aliases)) {
        for (const a of meta.aliases as unknown[]) {
          if (typeof a === "string") encyclopediaByAlias.set(a, r);
        }
      }
      if (typeof meta.legacy_id === "string") {
        encyclopediaByLegacyId.set(meta.legacy_id, r);
      }
    }
  }
}

function indexAtlas(rows: Row[]) {
  atlasPublished.length = 0;
  for (const r of rows) {
    if (r?.status === "published" && r?.aps_verified) atlasPublished.push(r);
  }
}

function indexCampaigns(rows: Row[]) {
  campaignsById.clear();
  campaignsBySlug.clear();
  campaignsAll = rows.filter((r) => r && r.status === "published");
  for (const r of campaignsAll) {
    if (r.id) campaignsById.set(r.id, r);
    if (r.slug) campaignsBySlug.set(r.slug, r);
  }
}

function indexInvestigations(rows: Row[]) {
  investigationsBySlug.clear();
  investigationsAll = rows.filter((r) => r && r.enabled !== false);
  for (const r of investigationsAll) {
    if (r.slug) investigationsBySlug.set(r.slug, r);
  }
}

function indexTih(rows: Row[]) {
  tihByMonthDay.clear();
  for (const r of rows) {
    if (!r || r.enabled === false) continue;
    const k = `${r.month}-${r.day}`;
    const list = tihByMonthDay.get(k) ?? [];
    list.push(r);
    tihByMonthDay.set(k, list);
  }
  for (const list of tihByMonthDay.values()) {
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }
}

function indexDailyFacts(rows: Row[]) {
  dailyFactsAll = rows.filter((r) => r && r.enabled !== false);
}

/** Rebuild every index from a snapshot. Safe to call repeatedly. */
export function applyLocalSnapshot(snap: OfflineSnapshot | null) {
  if (!snap?.collections) return;
  const c = snap.collections;
  indexEncyclopedia(c.encyclopedia_entities ?? []);
  indexAtlas(c.atlas_entities ?? []);
  indexCampaigns(c.admin_campaigns ?? []);
  indexInvestigations(c.investigations ?? []);
  indexTih(c.today_in_history_events ?? []);
  indexDailyFacts(c.daily_facts ?? []);
  _snapshot = snap;
}

/**
 * Ensure the in-memory store is populated. Reads IndexedDB first, then
 * the bundled snapshot. Resolves once on the first call and reuses the
 * same promise for concurrent callers.
 */
export function ensureLocalSnapshotLoaded(): Promise<void> {
  if (_ready) return Promise.resolve();
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    try {
      const local = await loadSnapshot();
      if (local) {
        applyLocalSnapshot(local);
        _ready = true;
        // Best-effort: if bundled is newer (e.g. shipped APK update), merge it.
        try {
          const bundled = await loadBundledSnapshot();
          if (bundled && bundled.snapshot_version > local.snapshot_version) {
            applyLocalSnapshot(bundled);
          }
        } catch { /* ignore */ }
        return;
      }
      const bundled = await loadBundledSnapshot();
      if (bundled) applyLocalSnapshot(bundled);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[local-first] init failed", e);
    } finally {
      _ready = true;
    }
  })();
  return _readyPromise;
}

export function isLocalReady(): boolean { return _ready; }

// ---------- Synchronous lookups (fast path for initialData) ----------

export function localEncyclopediaById(id: string): Row | null {
  if (!id) return null;
  return encyclopediaById.get(id) ?? encyclopediaByAlias.get(id) ?? encyclopediaByLegacyId.get(id) ?? null;
}

export function localEncyclopediaBySlug(slug: string, type?: string | null): Row | null {
  if (!slug) return null;
  if (type) {
    const hit = encyclopediaByTypeSlug.get(`${type}::${slug}`);
    if (hit) return hit;
  }
  const list = encyclopediaBySlug.get(slug);
  if (!list || list.length === 0) return null;
  return list[0];
}

export function localEncyclopediaByType(type: string): Row[] {
  return encyclopediaByType.get(type) ?? [];
}

export function localEncyclopediaSlugCandidates(slug: string): Row[] {
  return encyclopediaBySlug.get(slug) ?? [];
}

export function localEncyclopediaAll(): Row[] { return encyclopediaAll; }

export function localAtlasEntities(): Row[] { return atlasPublished; }

export function localPublishedCampaigns(): Row[] { return campaignsAll; }
export function localCampaignByIdOrSlug(idOrSlug: string): Row | null {
  if (!idOrSlug) return null;
  return campaignsById.get(idOrSlug) ?? campaignsBySlug.get(idOrSlug) ?? null;
}

export function localInvestigations(): Row[] { return investigationsAll; }
export function localInvestigationBySlug(slug: string): Row | null {
  return investigationsBySlug.get(slug) ?? null;
}

export function localTihForMonthDay(month: number, day: number): Row[] {
  return tihByMonthDay.get(`${month}-${day}`) ?? [];
}

export function localDailyFacts(): Row[] { return dailyFactsAll; }

export function localSnapshotInfo() {
  if (!_snapshot) return null;
  return {
    generated_at: _snapshot.generated_at,
    source: _snapshot.source,
    snapshot_version: _snapshot.snapshot_version,
    content_counts: _snapshot.content_counts,
  };
}
