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
import { loadSnapshot, saveSnapshot, MIN_PUBLIC_ENCYCLOPEDIA_ROWS, type OfflineSnapshot } from "./offline-storage";
import { normalizeArabicName } from "./arabic-normalize";
import {
  isDividerRow,
  partitionCampaignRows,
  type RawCampaignRow,
} from "./campaigns/entities";

type Row = Record<string, any>;

let _ready = false;
let _readyPromise: Promise<void> | null = null;
let _snapshot: OfflineSnapshot | null = null;

const REQUIRED_LOCAL_COLLECTIONS = ["encyclopedia_entities", "admin_campaigns"];

function hasRequiredContent(snap: OfflineSnapshot | null | undefined): snap is OfflineSnapshot {
  if (!snap?.collections) return false;
  return REQUIRED_LOCAL_COLLECTIONS.every((key) => {
    const rows = snap.collections[key];
    if (!Array.isArray(rows) || rows.length === 0) return false;
    if (key === "encyclopedia_entities") return rows.length >= MIN_PUBLIC_ENCYCLOPEDIA_ROWS;
    return true;
  });
}

const encyclopediaById = new Map<string, Row>();
const encyclopediaBySlug = new Map<string, Row[]>(); // slug → list across types
const encyclopediaByTypeSlug = new Map<string, Row>(); // `${type}::${slug}` → row
const encyclopediaByType = new Map<string, Row[]>();
const encyclopediaByAlias = new Map<string, Row>();
const encyclopediaByLegacyId = new Map<string, Row>();
// `${type}::${normalizedTitle}` → list of rows that share the same historical
// identity. Powers the canonical resolver so empty duplicates are never shown
// when a richer sibling exists.
const encyclopediaByNormName = new Map<string, Row[]>();
let encyclopediaAll: Row[] = [];

const atlasPublished: Row[] = [];

// Campaigns and section dividers share the `admin_campaigns` collection but
// are DIFFERENT entity types. They are indexed separately so no player
// pipeline can ever receive a divider. See `src/lib/campaigns/entities.ts`.
const campaignsById = new Map<string, Row>();
const campaignsBySlug = new Map<string, Row>();
let campaignsAll: Row[] = [];
let campaignDividerRows: Row[] = [];

const investigationsBySlug = new Map<string, Row>();
let investigationsAll: Row[] = [];

const tihByMonthDay = new Map<string, Row[]>(); // `${m}-${d}` → list
let dailyFactsAll: Row[] = [];

// Stories (P5) — snapshot-backed lookups for offline reading.
const storiesById = new Map<string, Row>();
const storiesBySlug = new Map<string, Row>();
let storiesAll: Row[] = [];
const scenesByStory = new Map<string, Row[]>();
const mediaById = new Map<string, Row>();
const mediaByStory = new Map<string, Row[]>();

function indexEncyclopedia(rows: Row[]) {
  encyclopediaById.clear();
  encyclopediaBySlug.clear();
  encyclopediaByTypeSlug.clear();
  encyclopediaByType.clear();
  encyclopediaByAlias.clear();
  encyclopediaByLegacyId.clear();
  encyclopediaByNormName.clear();
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
    // Normalized-name index (same-historical-entity grouping).
    if (r.entity_type && typeof r.title === "string" && r.title.trim().length > 0) {
      const key = `${r.entity_type}::${normalizeArabicName(r.title)}`;
      if (!key.endsWith("::")) {
        const list = encyclopediaByNormName.get(key) ?? [];
        list.push(r);
        encyclopediaByNormName.set(key, list);
      }
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
  const published = rows.filter((r) => r && r.status === "published");
  const split = partitionCampaignRows(published as RawCampaignRow[]);
  campaignsAll = split.campaigns as Row[];
  campaignDividerRows = published.filter((r) => isDividerRow(r as RawCampaignRow));
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

function indexStories(rows: Row[]) {
  storiesById.clear(); storiesBySlug.clear();
  // Filter for published status and EXCLUDE campaign intros.
  // We use the library-filter helper to ensure consistency with Phase 2 rules.
  const { isCampaignIntroRow, introStoryIdsFromCampaigns } = require("./stories/library-filter");
  const introIds = introStoryIdsFromCampaigns(campaignsAll);
  
  storiesAll = rows.filter((r) => 
    r && 
    r.status === "published" && 
    !isCampaignIntroRow(r, introIds)
  );
  
  for (const r of storiesAll) {
    if (r.id) storiesById.set(String(r.id), r);
    if (r.slug) storiesBySlug.set(String(r.slug), r);
  }
}
function indexScenes(rows: Row[]) {
  scenesByStory.clear();
  for (const r of rows) {
    const sid = String(r?.story_id ?? "");
    if (!sid) continue;
    const list = scenesByStory.get(sid) ?? [];
    list.push(r);
    scenesByStory.set(sid, list);
  }
  for (const list of scenesByStory.values()) {
    list.sort((a, b) => (a.scene_index ?? 0) - (b.scene_index ?? 0));
  }
}
function indexStoryMedia(rows: Row[]) {
  mediaById.clear(); mediaByStory.clear();
  for (const r of rows) {
    if (!r?.verified) continue;
    if (r.id) mediaById.set(String(r.id), r);
    const sid = r.story_id ? String(r.story_id) : null;
    if (sid) {
      const list = mediaByStory.get(sid) ?? [];
      list.push(r);
      mediaByStory.set(sid, list);
    }
  }
}

// ── Snapshot identity + change notification ──────────────────────────
// Any derived index (e.g. the encyclopedia unified index) must be keyed by
// this value. It changes whenever the in-memory rows change, so a derived
// cache built from an older/partial snapshot can never keep serving wrong
// counts after the real snapshot lands.
let _dataVersion = 0;
const _listeners = new Set<() => void>();

/** Monotonic id of the currently applied snapshot content. 0 = not loaded. */
export function localDataVersion(): number { return _dataVersion; }

/** Subscribe to snapshot (re)application. Returns an unsubscribe fn. */
export function onLocalSnapshotChange(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
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
  indexStories(c.stories ?? []);
  indexScenes(c.story_scenes ?? []);
  indexStoryMedia(c.story_media ?? []);
  _snapshot = snap;
  _ready = true;
  _dataVersion += 1;
  for (const cb of Array.from(_listeners)) { try { cb(); } catch { /* ignore */ } }
}

/**
 * Replace the campaign/divider collection with authoritative server rows.
 *
 * The bundled snapshot is a SEED, not the truth: once an editor reorders the
 * timeline in the admin workshop, every `chronological_order` in the shipped
 * snapshot becomes stale, which silently moves campaigns across era dividers.
 * This merges the live `campaigns_public` rows into the in-memory store (and
 * persists them) so player ordering always matches the admin ordering.
 */
export function mergeLocalCampaignRows(rows: Row[] | null | undefined): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  indexCampaigns(rows);
  if (_snapshot?.collections) {
    _snapshot.collections.admin_campaigns = rows;
    void saveSnapshot(_snapshot).catch(() => {});
  }
  _dataVersion += 1;
  for (const cb of Array.from(_listeners)) { try { cb(); } catch { /* ignore */ } }
  return true;
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
      const localUsable = hasRequiredContent(local);
      if (localUsable) {
        applyLocalSnapshot(local);
        // Best-effort: if bundled is newer (e.g. shipped APK update), merge it.
        try {
          const bundled = await loadBundledSnapshot();
          if (hasRequiredContent(bundled) && bundled.snapshot_version > local.snapshot_version) {
            applyLocalSnapshot(bundled);
            await saveSnapshot(bundled).catch(() => {});
          }
        } catch { /* ignore */ }
        return;
      }
      const bundled = await loadBundledSnapshot();
      if (hasRequiredContent(bundled)) {
        applyLocalSnapshot(bundled);
        await saveSnapshot(bundled).catch(() => {});
      }
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[local-first] init failed", e);
    } finally {
      _ready = !!_snapshot;
      if (!_ready) _readyPromise = null;
    }
  })();
  return _readyPromise;
}

export function isLocalReady(): boolean { return _ready; }

// ---------- Synchronous lookups (fast path for initialData) ----------

function richnessScore(e: Row | null | undefined): number {
  if (!e) return -1;
  let s = 0;
  const b = e.body as unknown;
  if (b && typeof b === "object") {
    const bb = b as Record<string, unknown>;
    if (Array.isArray(bb.sections)) s += (bb.sections as unknown[]).length * 4;
    if (Array.isArray(bb.timeline)) s += (bb.timeline as unknown[]).length * 3;
    if (Array.isArray(bb.facts)) s += (bb.facts as unknown[]).length;
    if (Array.isArray(bb.sources)) s += (bb.sources as unknown[]).length;
    if (typeof bb.overview === "string")
      s += Math.min(5, Math.floor((bb.overview as string).length / 200));
    if (typeof bb.introduction === "string")
      s += Math.min(5, Math.floor((bb.introduction as string).length / 200));
  } else if (typeof b === "string" && (b as string).length > 20) {
    s += Math.min(10, Math.floor((b as string).length / 200));
  }
  if (typeof e.summary === "string" && e.summary.trim().length > 0) s += 1;
  if (typeof e.subtitle === "string" && e.subtitle.trim().length > 0) s += 1;
  return s;
}

function pickRichest(list: Row[], preferType?: string | null): Row | null {
  if (!list || list.length === 0) return null;
  return [...list].sort((a, b) => {
    const ra = richnessScore(a), rb = richnessScore(b);
    if (ra !== rb) return rb - ra;
    if (preferType) {
      const at = a.entity_type === preferType ? 1 : 0;
      const bt = b.entity_type === preferType ? 1 : 0;
      if (at !== bt) return bt - at;
    }
    return 0;
  })[0] ?? null;
}

export function localEncyclopediaById(id: string): Row | null {
  if (!id) return null;
  const direct = encyclopediaById.get(id) ?? encyclopediaByAlias.get(id) ?? encyclopediaByLegacyId.get(id) ?? null;
  if (!direct) return null;
  // If the direct hit is a stub but a richer sibling exists under the same
  // slug, prefer the richer one so the player doesn't see an empty page.
  if (richnessScore(direct) > 1) return direct;
  if (direct.slug) {
    const richer = pickRichest(encyclopediaBySlug.get(direct.slug) ?? [direct]);
    if (richer && richnessScore(richer) > richnessScore(direct)) return richer;
  }
  return direct;
}

export function localEncyclopediaBySlug(slug: string, type?: string | null): Row | null {
  if (!slug) return null;
  if (type) {
    const hit = encyclopediaByTypeSlug.get(`${type}::${slug}`);
    if (hit && richnessScore(hit) > 1) return hit;
  }
  const list = encyclopediaBySlug.get(slug);
  return pickRichest(list ?? [], type ?? null);
}

export function localEncyclopediaByType(type: string): Row[] {
  return encyclopediaByType.get(type) ?? [];
}

export function localEncyclopediaSlugCandidates(slug: string): Row[] {
  return encyclopediaBySlug.get(slug) ?? [];
}

/**
 * Return every row that represents the same historical entity (same type +
 * normalized Arabic title) as `entity`. Includes `entity` itself.
 * Sub-millisecond — backed by an in-memory Map built at boot.
 */
export function localEncyclopediaSameNameSiblings(entity: {
  entity_type?: string; title?: string;
} | null | undefined): Row[] {
  if (!entity?.entity_type || !entity?.title) return [];
  const key = `${entity.entity_type}::${normalizeArabicName(entity.title)}`;
  if (key.endsWith("::")) return [];
  return encyclopediaByNormName.get(key) ?? [];
}

export function localEncyclopediaAll(): Row[] { return encyclopediaAll; }

export function localAtlasEntities(): Row[] { return atlasPublished; }

/** Playable campaigns only — section dividers are NEVER included. */
export function localPublishedCampaigns(): Row[] { return campaignsAll; }
/** Raw section-divider rows (organizational only). */
export function localCampaignDividerRows(): Row[] { return campaignDividerRows; }

/** Raw published games (used for Daily Challenges rotation). */
export function localPublishedGames(): Row[] {
  if (!_snapshot?.collections?.games) return [];
  return (_snapshot.collections.games as Row[]).filter(g => g && g.status === 'published');
}

export function localCampaignByIdOrSlug(idOrSlug: string): Row | null {
  if (!idOrSlug) return null;
  return campaignsById.get(idOrSlug) ?? campaignsBySlug.get(idOrSlug) ?? null;
}

/**
 * Drop a campaign from the in-memory local store so the next
 * `fetchCampaignByIdOrSlug` call falls through to Supabase. Called by the
 * admin studio after publish so player pages read fresh content immediately.
 */
export function invalidateLocalCampaign(idOrSlug: string): void {
  if (!idOrSlug) return;
  const row = campaignsById.get(idOrSlug) ?? campaignsBySlug.get(idOrSlug);
  if (!row) return;
  if (row.id) campaignsById.delete(row.id);
  if (row.slug) campaignsBySlug.delete(row.slug);
  campaignsAll = campaignsAll.filter(r => r !== row);
}

export function localInvestigations(): Row[] { return investigationsAll; }
export function localInvestigationBySlug(slug: string): Row | null {
  return investigationsBySlug.get(slug) ?? null;
}

/**
 * Drop an investigation from the in-memory local store so the next
 * `useSupabaseInvestigation(s)` refresh falls through to Supabase. Called by
 * the admin lifecycle after publish so player pages read fresh content
 * immediately, mirroring `invalidateLocalCampaign`.
 */
export function invalidateLocalInvestigation(idOrSlug: string): void {
  if (!idOrSlug) return;
  // We only index by slug for investigations; match either the slug key or
  // the row's id defensively.
  let hit: Row | null = investigationsBySlug.get(idOrSlug) ?? null;
  if (!hit) {
    for (const r of investigationsAll) {
      if (r.id === idOrSlug || r.slug === idOrSlug) { hit = r; break; }
    }
  }
  if (!hit) return;
  if (hit.slug) investigationsBySlug.delete(hit.slug);
  investigationsAll = investigationsAll.filter((r) => r !== hit);
}

export function localTihForMonthDay(month: number, day: number): Row[] {
  return tihByMonthDay.get(`${month}-${day}`) ?? [];
}

export function localTihAll(): Row[] {
  const out: Row[] = [];
  for (const list of tihByMonthDay.values()) out.push(...list);
  return out;
}

export function localDailyFacts(): Row[] { return dailyFactsAll; }

export function localStoryScenes(storyId: string): Row[] {
  return scenesByStory.get(storyId) ?? [];
}

export function localStoryById(storyId: string): Row | null {
  return storiesById.get(storyId) ?? null;
}

export function localSnapshotInfo() {
  if (!_snapshot) return null;
  return {
    generated_at: _snapshot.generated_at,
    source: _snapshot.source,
    snapshot_version: _snapshot.snapshot_version,
    content_counts: _snapshot.content_counts,
  };
}

// ---------- Stories (P5) ----------
export function localStoriesAll(): Row[] { return storiesAll; }
export function localStoryById(id: string): Row | null {
  if (!id) return null;
  return storiesById.get(id) ?? storiesBySlug.get(id) ?? null;
}
export function localStoryScenes(storyId: string): Row[] {
  return scenesByStory.get(storyId) ?? [];
}
export function localStoryMediaById(id: string): Row | null {
  if (!id) return null;
  return mediaById.get(id) ?? null;
}
export function localStoryMediaForStory(storyId: string, referencedIds: Iterable<string> = []): Row[] {
  const out = new Map<string, Row>();
  for (const m of mediaByStory.get(storyId) ?? []) out.set(String(m.id), m);
  for (const id of referencedIds) {
    const m = mediaById.get(String(id));
    if (m) out.set(String(m.id), m);
  }
  return Array.from(out.values());
}

/**
 * Prune stories from the in-memory snapshot whose IDs are no longer
 * present in the authoritative server list. This is called by
 * `listStoriesSummary` on every successful online fetch so that stories
 * that were hard-deleted server-side (test/duplicate rows) stop leaking
 * into Home/Worlds via the offline fallback path.
 *
 * Only the in-memory indexes are trimmed here — the persisted snapshot
 * refreshes through its normal pipeline. That's the correct scope: we
 * want the current session to reflect reality immediately, without
 * racing the snapshot writer.
 */
export function pruneStoriesToAuthoritative(authoritativeIds: Iterable<string>): void {
  const keep = new Set<string>();
  for (const id of authoritativeIds) if (id) keep.add(String(id));
  if (keep.size === 0) return; // never prune to empty on a bad response
  storiesAll = storiesAll.filter((r) => keep.has(String(r.id)));
  for (const id of Array.from(storiesById.keys())) {
    if (!keep.has(id)) storiesById.delete(id);
  }
  for (const [slug, row] of Array.from(storiesBySlug.entries())) {
    if (!keep.has(String(row.id))) storiesBySlug.delete(slug);
  }
  for (const id of Array.from(scenesByStory.keys())) {
    if (!keep.has(id)) scenesByStory.delete(id);
  }
  for (const id of Array.from(mediaByStory.keys())) {
    if (!keep.has(id)) mediaByStory.delete(id);
  }
}

