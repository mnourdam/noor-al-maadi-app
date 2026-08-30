/**
 * Offline snapshot generator + content-source abstraction.
 *
 * Goal: an APK installed with no internet can still browse and play the
 * current core content. Snapshot is sourced from Supabase (live) by an
 * admin, persisted in IndexedDB, and ships in `public/offline-snapshot.json`
 * as the bundled floor.
 *
 * Runtime read priority:
 *   1. latest synced local cache (IndexedDB)
 *   2. bundled snapshot (/offline-snapshot.json)
 *   3. Differential Manifest Check (only triggers fetch if server updated_at > local)
 *   4. Supabase live fallback (if online)
 *
 * Only public/player-safe published content is included. No drafts, no
 * admin-only data, no PII (profiles, referrals, audit logs, emails).
 */
import { supabase } from "@/integrations/supabase/client";
import { isLocalReady, localDataVersion } from "./local-first-store";
import { ATLAS_PUBLIC_COLUMNS } from "./atlas-entities";


import {
  loadSnapshot,
  saveSnapshot,
  mergeSnapshots,
  MIN_PUBLIC_ENCYCLOPEDIA_ROWS,
  SNAPSHOT_SCHEMA_VERSION,
  type OfflineCollectionKey,
  type OfflineSnapshot,
} from "./offline-storage";

/** Legacy alias kept for older imports. */
export type ContentType =
  | "encyclopedia"
  | "campaigns"
  | "investigations"
  | "today_in_history"
  | "daily_facts"
  | "atlas"
  | "content_registry";

const LEGACY_TO_COLLECTION: Record<ContentType, OfflineCollectionKey> = {
  encyclopedia: "encyclopedia_entities",
  campaigns: "admin_campaigns",
  investigations: "investigations",
  today_in_history: "today_in_history_events",
  daily_facts: "daily_facts",
  atlas: "atlas_entities",
  content_registry: "content_registry",
};

/** Path of the bundled snapshot shipped inside the APK / web build. */
export const BUNDLED_SNAPSHOT_URL = "/offline-snapshot.json";

/** Public-safe collection definitions. */
interface CollectionDef {
  key: OfflineCollectionKey;
  table: string;
  /** Optional filter applied to the query. */
  filter?: (q: any) => any;
  /**
   * Explicit column list. Required for tables whose editorial columns are
   * not granted to `anon`/`authenticated` (a `*` select would fail).
   */
  columns?: string;
  /** Whether this collection is required for first-run playability. */
  required?: boolean;
  /**
   * Collection that has no network source at runtime (seeded from the
   * bundled baseline / build-time pack). It is a first-class snapshot
   * collection for validation and persistence, but sync never fetches or
   * clears it.
   */
  localOnly?: boolean;
  label: string;
}


export const COLLECTIONS: CollectionDef[] = [
  { key: "encyclopedia_entities", table: "encyclopedia_entities", columns: "id,slug,entity_type,title,subtitle,summary,metadata,enabled,created_at,updated_at,body,aliases,timeline_order,timeline_year,timeline_start_year,image_url,image_path,image_credit,image_source",
    filter: (q) => q.eq("enabled", true), required: true,
    label: "الموسوعة (شخصيات، دول، مدن، معارك، أحداث)" },
  { key: "admin_campaigns", table: "campaigns_public",
    required: true,
    label: "الحملات المنشورة (مع الفصول والأنشطة داخل data)" },

  { key: "investigations", table: "investigations_public",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "التحقيقات" },
  { key: "today_in_history_events", table: "today_in_history_events",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "في مثل هذا اليوم" },
  { key: "daily_facts", table: "daily_facts",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "الحقيقة اليومية" },
  { key: "atlas_entities", table: "atlas_entities",
    filter: (q) => q.eq("status", "published").eq("aps_verified", true), required: false,
    columns: ATLAS_PUBLIC_COLUMNS,
    label: "خريطة الأطلس (موثّقة فقط)" },

  // Legacy: museum content lives inside encyclopedia_entities (types:
  // figure/artifact/landmark/city/battle/event). content_registry is kept
  // for backwards-compatibility only — it does NOT duplicate encyclopedia
  // rows and is expected to be empty on modern installs.
  { key: "content_registry", table: "content_registry",
    required: false,
    label: "سجل المتحف (قديم/اختياري — المتحف يقرأ من الموسوعة)" },

  // Stories (P5) — fetched via the M7A RPC `stories_snapshot_manifest_v2`
  // which enforces the M6 visibility contract (locked+hidden omitted,
  // locked+mystery redacted, on_demand excluded from the default snapshot).
  // The `table` field is a placeholder; `fetchCollection` short-circuits
  // to the manifest for these three keys.
  { key: "stories", table: "__rpc:stories_snapshot_manifest_v2__",
    required: false, label: "القصص المنشورة (بواسطة RPC مع تطبيق الرؤية)" },
  { key: "story_scenes", table: "__rpc:stories_snapshot_manifest_v2__",
    required: false, label: "مشاهد القصص (للقصص المفتوحة فقط)" },
  { key: "story_media", table: "__rpc:stories_snapshot_manifest_v2__",
    required: false, label: "وسائط القصص (للقصص المفتوحة، مُتحقّقة فقط)" },
  { key: "story_collections", table: "__rpc:stories_snapshot_manifest_v2__",
    required: false, label: "مجموعات القصص" },

  // Games ship through the build-time baseline pack; there is no
  // player-safe network read path, so sync leaves them untouched.
  { key: "games", table: "__local:games__", localOnly: true,
    required: false, label: "الألعاب (حزمة محتوى مُجمّعة مع الإصدار)" },

];

/** Collections that DO NOT expose `updated_at` — sync must full-fetch these. */
const NO_UPDATED_AT: ReadonlySet<OfflineCollectionKey> = new Set<OfflineCollectionKey>([
  "today_in_history_events",
  "daily_facts",
  // Story keys come from the visibility-enforced manifest RPC, which is
  // not `updated_at`-filterable; snapshot builder full-fetches these each
  // sync cycle.
  "stories",
  "story_scenes",
  "story_media",
  "story_collections",
  "games",
]);

/** Story collection keys that are served by the manifest RPC. */
const STORY_MANIFEST_KEYS: ReadonlySet<OfflineCollectionKey> = new Set<OfflineCollectionKey>([
  "stories", "story_scenes", "story_media", "story_collections",
]);

/**
 * V16 — collections that must ALWAYS take the authoritative full fetch when a
 * sync is needed, because their manifest count is not comparable (see
 * `offline-manifest.ts`) and an upsert-only delta merge could never drop a
 * row that was unpublished upstream.
 */
export const FULL_REFRESH_KEYS: ReadonlySet<OfflineCollectionKey> = new Set<OfflineCollectionKey>([
  "admin_campaigns",
]);

/**
 * Per-invocation cache of the manifest RPC result. A snapshot generation
 * pass calls the RPC exactly once, then routes each of the three story
 * collection keys to the corresponding slice of the payload.
 */
interface StoryManifestPayload {
  ok: boolean;
  generated_at?: string;
  stories?: any[];
  story_scenes?: any[];
  story_media?: any[];
  story_collections?: any[];
}
let _manifestPromise: Promise<StoryManifestPayload> | null = null;
async function fetchStoryManifest(): Promise<StoryManifestPayload> {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    try {
      const { data, error } = await supabase.rpc(
        "stories_snapshot_manifest_v2" as never,
        { p_include_on_demand: false } as never,
      );
      if (error) {
        console.warn("[snapshot] stories_snapshot_manifest_v2 failed:", error.message);
        return { ok: false };
      }
      const p = (data ?? {}) as StoryManifestPayload;
      if (!p.ok) return { ok: false };
      return p;
    } catch (e) {
      console.warn("[snapshot] stories_snapshot_manifest_v2 threw:", e);
      return { ok: false };
    }
  })();
  return _manifestPromise;
}
function resetStoryManifestCache() { _manifestPromise = null; }
function pickManifestSlice(key: OfflineCollectionKey, m: StoryManifestPayload): any[] {
  if (!m.ok) return [];
  if (key === "stories") return Array.isArray(m.stories) ? m.stories : [];
  if (key === "story_scenes") return Array.isArray(m.story_scenes) ? m.story_scenes : [];
  if (key === "story_media") return Array.isArray(m.story_media) ? m.story_media : [];
  if (key === "story_collections") return Array.isArray(m.story_collections) ? m.story_collections : [];
  return [];
}

async function fetchCollection(def: CollectionDef): Promise<any[]> {
  // Local-only collections (games baseline pack) have no network source.
  if (def.localOnly) return [];
  // Story collections come from the M7A visibility-enforcing manifest RPC.
  if (STORY_MANIFEST_KEYS.has(def.key)) {
    const manifest = await fetchStoryManifest();
    if (!manifest.ok) {
      throw new Error(`[snapshot] stories_snapshot_manifest_v2 unavailable for ${def.key}`);
    }
    const rows = pickManifestSlice(def.key, manifest);
    console.info(`[snapshot] ${def.key}: fetched ${rows.length} rows (manifest RPC)`);
    return pruneOfflineRows(def, rows);
  }
  // Smaller page size than the PostgREST default (1000) so heavy JSON
  // columns (encyclopedia body, campaign data) don't push a single page
  // past preview/CDN payload limits and hang.
  const PAGE = 100;
  const out: any[] = [];

  // Ask PostgREST for the exact count BEFORE reading any row data. The count
  // request is tiny and independent of heavy JSON payloads, so we can fail
  // closed if pagination later returns 923/1000 rows without an error.
  const expectedTotal = await fetchCollectionExpectedCount(def);
  if (def.key === "encyclopedia_entities") {
    if (typeof expectedTotal !== "number") {
      throw new Error("[snapshot] encyclopedia_entities: expected count unavailable; refusing full fetch");
    }
    if (expectedTotal < MIN_PUBLIC_ENCYCLOPEDIA_ROWS) {
      throw new Error(
        `[snapshot] encyclopedia_entities: live count ${expectedTotal} is below required floor ` +
        `${MIN_PUBLIC_ENCYCLOPEDIA_ROWS}; refusing full fetch`,
      );
    }
  } else if (def.required && typeof expectedTotal !== "number") {
    throw new Error(`[snapshot] ${def.table}: expected count unavailable; refusing required full fetch`);
  }

  for (let from = 0; ; from += PAGE) {
    let query: any = supabase
      .from(def.table as any)
      .select(def.columns ?? "*")
      // Stable ordering is REQUIRED — PostgREST without an explicit
      // order can reshuffle rows between pages and silently drop or
      // duplicate records across .range() calls.
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (def.filter) query = def.filter(query);
    const { data, error } = await query;
    if (error) {
      console.warn(`[snapshot] failed to read ${def.table}:`, error.message);
      throw error;
    }
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    if (from > 200_000) {
      console.warn(`[snapshot] ${def.table}: pagination safety cap hit at ${from}`);
      break;
    }
  }
  if (typeof expectedTotal === "number" && out.length !== expectedTotal) {
    const msg =
      `[snapshot] ${def.table}: fetched ${out.length}/${expectedTotal} rows ` +
      `— full fetch did not match expected count, refusing to persist data`;
    console.warn(msg);
    throw new Error(msg);
  }
  console.info(
    `[snapshot] ${def.table}: fetched ${out.length} rows` +
      (expectedTotal !== null ? ` (expected ${expectedTotal})` : ""),
  );
  return pruneOfflineRows(def, out);
}


/**
 * Fetch only rows whose `updated_at` is strictly greater than `since`.
 * Returns `null` when the collection has no `updated_at` column and the
 * caller must fall back to a full fetch.
 */
/**
 * Fetch only rows whose `updated_at` is strictly greater than `since`.
 * Returns `null` when the collection has no `updated_at` column and the
 * caller must fall back to a full fetch.
 */
async function fetchCollectionSince(def: CollectionDef, since: string): Promise<any[] | null> {
  if (NO_UPDATED_AT.has(def.key)) return null;
  const PAGE = 500;
  const out: any[] = [];
  
  // Guard: if we are trying to sync against a future/empty timestamp, full fetch.
  if (!since || since === new Date(0).toISOString()) return null;

  for (let from = 0; ; from += PAGE) {
    let query: any = supabase
      .from(def.table as any)
      .select(def.columns ?? "*")
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (def.filter) query = def.filter(query);
    const { data, error } = await query;
    if (error) {
      console.warn(`[snapshot] incremental fetch failed for ${def.table}:`, error.message);
      return null;
    }
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    if (from > 200_000) break;
  }
  return pruneOfflineRows(def, out);
}

/**
 * Return the current authoritative row count for a collection (as seen by
 * the current auth context, i.e. anon RLS in production). Used to detect
 * caches that trail behind the live source and trigger a true-up.
 */
async function fetchCollectionExpectedCount(def: CollectionDef): Promise<number | null> {
  // Story collections are served by the manifest RPC — there is no
  // countable underlying table endpoint. Skip the true-up check.
  if (STORY_MANIFEST_KEYS.has(def.key) || def.localOnly) return null;
  let query: any = supabase
    .from(def.table as any)
    .select("id", { count: "exact", head: true });
  if (def.filter) query = def.filter(query);
  const { count, error } = await query;

  if (error) {
    console.warn(`[snapshot] count query failed for ${def.table}:`, error.message);
    return null;
  }
  return typeof count === "number" ? count : null;
}

function maxUpdatedAt(rows: any[]): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const u = (r as any)?.updated_at;
    if (typeof u === "string" && (!best || u > best)) best = u;
  }
  return best;
}

/**
 * V16 — NON-DESTRUCTIVE story merge.
 *
 * `stories_snapshot_manifest_v2()` evaluates visibility as ANON, so every
 * locked-visible story arrives REDACTED: no `unlock_spec`, no scenes, no
 * media. Full-replacing the packaged 186-row baseline with that subset
 * both destroyed offline content and (because a row without an
 * `unlock_spec` key used to normalize to ALWAYS) unlocked everything.
 *
 * Rules:
 *   * merge by stable `id`;
 *   * a field ABSENT from the incoming row keeps its existing value
 *     (absent ≠ explicitly cleared);
 *   * PROTECTED fields are never overwritten by a redacted row;
 *   * rows missing from the incoming subset are preserved (no shrinkage).
 */
const PROTECTED_STORY_FIELDS = [
  "unlock_spec", "lock_visibility", "lock_explanation", "prereqs",
  "cover_media_id", "metadata", "tags", "scene_count",
] as const;

function isRedactedStoryRow(row: any): boolean {
  if (!row || typeof row !== "object") return false;
  if (row.is_redacted === true) return true;
  if (row.is_locked === true) return true;
  return !("unlock_spec" in row);
}

export function mergeStoryRowsPreserving(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  for (const r of existing) if (r?.id != null) byId.set(String(r.id), r);
  for (const inc of incoming) {
    if (inc?.id == null) continue;
    const id = String(inc.id);
    const prev = byId.get(id);
    if (!prev) { byId.set(id, inc); continue; }
    // Absent keys keep their existing values.
    const merged: any = { ...prev, ...inc };
    if (isRedactedStoryRow(inc)) {
      for (const f of PROTECTED_STORY_FIELDS) {
        if (f in prev && !(f in inc)) merged[f] = prev[f];
        else if (f in prev && prev[f] != null && inc[f] == null) merged[f] = prev[f];
      }
    }
    byId.set(id, merged);
  }
  return Array.from(byId.values());
}

/** Union merge for story children (scenes/media): a subset never deletes. */
export function mergeStoryChildRows(existing: any[], incoming: any[]): any[] {
  const byId = new Map<string, any>();
  for (const r of existing) if (r?.id != null) byId.set(String(r.id), r);
  for (const r of incoming) {
    if (r?.id == null) continue;
    const id = String(r.id);
    const prev = byId.get(id);
    byId.set(id, prev ? { ...prev, ...r } : r);
  }
  return Array.from(byId.values());
}

/** Apply the correct non-destructive strategy for a story collection key. */
export function mergeStoryCollection(key: string, existing: any[], incoming: any[]): any[] {
  const merged = key === "stories"
    ? mergeStoryRowsPreserving(existing, incoming)
    : mergeStoryChildRows(existing, incoming);
  // Reject shrinkage: a redacted subset can never degrade the baseline.
  return merged.length >= existing.length ? merged : existing;
}

/** Merge deltas into an existing row set by `id`, replacing on conflict. */
function mergeRows(existing: any[], deltas: any[]): any[] {
  if (deltas.length === 0) return existing;
  const byId = new Map<string, any>();
  for (const r of existing) if (r?.id != null) byId.set(String(r.id), r);
  for (const r of deltas) if (r?.id != null) byId.set(String(r.id), r);
  return Array.from(byId.values());
}

function pruneOfflineRow(def: CollectionDef, row: any): any {
  if (!row || typeof row !== "object") return row;
  if (def.key === "admin_campaigns") {
    // Player-facing offline mode only reads the published `data` payload.
    // `draft_data` duplicates most campaign content and can push the bundled
    // APK snapshot over the repository/package size limit; keep drafts live in
    // the admin editor, not in the public offline bundle.
    const {
      draft_data: _draftData,
      last_editor_email: _lastEditorEmail,
      updated_by: _updatedBy,
      ...playerRow
    } = row;
    return playerRow;
  }
  if (def.key === "story_media") {
    // Strip auditing UUIDs before persisting to the public offline snapshot.
    const { verified_by: _v, ...rest } = row;
    return rest;
  }
  return row;
}

// NOTE: story-media lives in a PRIVATE bucket, so there is no public URL
// to warm. Image-cache warm-up for story media goes through
// `prefetchStoryMediaRows` (signed fetch stored under a stable key).



function pruneOfflineRows(def: CollectionDef, rows: any[]): any[] {
  return rows.map((row) => pruneOfflineRow(def, row));
}

async function sha256Hex(text: string): Promise<string | undefined> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return undefined;
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

function canonicalJSON(value: any): string {
  // Stable JSON for checksums — sort object keys recursively.
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export async function generateSnapshot(): Promise<OfflineSnapshot> {
  resetStoryManifestCache();
  const results = await Promise.all(COLLECTIONS.map((def) => fetchCollection(def)));

  const collections: Record<string, any[]> = {};
  const content_counts: Record<string, number> = {};
  const collection_manifest = [] as { key: string; count: number; checksum?: string }[];
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const def = COLLECTIONS[i];
    const rows = results[i];
    collections[def.key] = rows;
    content_counts[def.key] = rows.length;
    collection_manifest.push({
      key: def.key,
      count: rows.length,
      checksum: await sha256Hex(canonicalJSON(rows)),
    });
  }
  const checksum = await sha256Hex(canonicalJSON(collections));
  return {
    snapshot_version: Date.now(),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: "live",
    content_counts,
    checksum,
    collection_manifest,
    collections,
  };
}

/**
 * Sync the local store with the server.
 * Strategy:
 *   1. Fetch Server Manifest (lightweight)
 *   2. Identify Deltas (Count or Max UpdatedAt change)
 *   3. Atomic Converge: Fetch only required deltas, merge, validate, then commit swap.
 */
export async function generateAndStoreSnapshot(): Promise<OfflineSnapshot> {
  const previous = await loadSnapshot();
  
  // Differential Sync Strategy: Check manifest before starting any work.
  const { fetchContentManifest, manifestKeyToLocalKey, isManifestCountComparable } =
    await import("./offline-manifest");
  const serverManifest = await fetchContentManifest();
  
  if (previous?.collections && serverManifest) {
    let changed = false;
    for (const s of serverManifest) {
      // Map server collection name to local key
      const localKey = manifestKeyToLocalKey(s.collection);

      // Collections the local snapshot does not carry (baseline-owned
      // stories) are not comparable and must not force endless syncs.
      if (!(localKey in previous.content_counts)) continue;
      const localCount = previous.content_counts[localKey] ?? 0;
      const serverDate = new Date(s.last_updated).getTime();
      const localDate = new Date(previous.generated_at).getTime();
      const countChanged = isManifestCountComparable(localKey) && s.total_count !== localCount;

      // If count differs or server has newer data, we need a sync
      if (countChanged || serverDate > localDate) {
        changed = true;
        break;
      }
    }
    
    if (!changed) {
      console.info("[snapshot] background sync skipped: local content matches server manifest");
      return previous;
    }
  }

  // Converge: generate a new snapshot by merging deltas into previous if available
  const snap = await (previous?.collections ? refreshSnapshotIncremental() : generateSnapshot());
  
  const { validateSnapshot } = await import("./offline-snapshot-validate");
  const report = validateSnapshot(snap);
  if (!report.ok) {
    console.warn("[snapshot] refusing to store invalid snapshot", report.issues);
    throw new Error("Invalid offline snapshot; keeping existing local content");
  }

  // Atomic Commit: persist to IndexedDB then swap into memory
  await saveSnapshot(snap);
  try {
    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(snap);
    
    // Background Task: Warm the image cache.
    // Order: Priority story media -> General images -> Tail media.
    const warmTask = async () => {
      try {
        await warmSnapshotImageCache(snap.collections);
      } catch (err) {
        console.warn("[snapshot] background warming failed:", err);
      }
    };

    if (typeof window !== "undefined") {
      // Re-expose/update diagnostic global on every successful sync
      const { localDataVersion, isLocalReady } = await import("./local-first-store");
      (window as any).irth = {
        localDataVersion,
        isLocalReady,
        generateAndStoreSnapshot
      };

      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => void warmTask(), { timeout: 10000 });
      } else {
        setTimeout(() => void warmTask(), 5000);
      }
    }
  } catch (e) {
    console.warn("[snapshot] background post-commit failed:", e);
  }



  return snap;
}


/**
 * Priority-first image cache warm-up. Order:
 *   1. Story priority media (cover / first scene / first document / first reveal)
 *   2. General snapshot images (encyclopedia thumbnails, atlas, etc.)
 *   3. Remaining story media (long tail scenes)
 *
 * All three phases run through `prefetchImages`, which is idempotent
 * and cache-aware, so overlapping URLs are only fetched once.
 */
async function warmSnapshotImageCache(collections: Record<string, any[]>): Promise<void> {
  try {
    const { collectImageUrls, prefetchImages } = await import("./image-cache");
    const { collectPriorityMediaIds } = await import("./stories/media/priority");
    const { prefetchStoryMediaRows } = await import("./stories/media/url");
    const media: any[] = collections.story_media ?? [];
    const priorityIds = collectPriorityMediaIds(
      collections.stories ?? [],
      collections.story_scenes ?? [],
    );
    // The `story-media` bucket is PRIVATE: warm the cache through signed
    // URLs stored under a stable, token-free cache key.
    const priorityRows = media.filter((m) => m?.verified && priorityIds.has(m.id));
    if (priorityRows.length > 0) await prefetchStoryMediaRows(priorityRows);

    const generalUrls = collectImageUrls(collections);
    if (generalUrls.size > 0) await prefetchImages(generalUrls);

    const tailRows = media.filter((m) => m?.verified && !priorityIds.has(m.id));
    if (tailRows.length > 0) await prefetchStoryMediaRows(tailRows);
  } catch { /* ignore */ }
}


/**
 * Incremental refresh: for each collection with `updated_at`, fetch only
 * rows newer than the previous snapshot and merge by id. Collections
 * without an `updated_at` column full-fetch (they are small: today-in-
 * history, daily-facts). Preserves the existing cache and player progress
 * (which lives in a separate table).
 *
 * Returns the merged, validated, persisted snapshot. Throws if no previous
 * snapshot exists — callers should use `generateAndStoreSnapshot()` in
 * that case.
 */
/**
 * Incremental refresh: for each collection, fetch only required deltas
 * based on the server manifest and merge by ID.
 */
export async function refreshSnapshotIncremental(): Promise<OfflineSnapshot> {
  resetStoryManifestCache();
  const previous = await loadSnapshot();

  if (!previous?.collections) {
    return generateSnapshot();
  }

  const { fetchContentManifest, isManifestCountComparable } = await import("./offline-manifest");
  const serverManifest = await fetchContentManifest();
  
  const nextCollections: Record<string, any[]> = { ...previous.collections };
  const nextCounts: Record<string, number> = { ...previous.content_counts };
  const manifest: { key: string; count: number; checksum?: string }[] = [];
  let totalDeltas = 0;

  for (const def of COLLECTIONS) {
    const prevRows = previous.collections[def.key] ?? [];
    const since = maxUpdatedAt(prevRows);
    let merged: any[] = prevRows;

    // Local-only collections (games baseline pack) are never fetched and
    // never cleared by a sync — they belong to the build-time pack.
    if (def.localOnly) {
      nextCollections[def.key] = prevRows;
      nextCounts[def.key] = prevRows.length;
      manifest.push({ key: def.key, count: prevRows.length, checksum: await sha256Hex(canonicalJSON(prevRows)) });
      continue;
    }

    try {
      // Find this collection in the manifest to see if a fetch is actually needed
      const serverItem = serverManifest?.find(m => 
        (m.collection === 'campaigns_public' && def.key === 'admin_campaigns') ||
        (m.collection === 'investigations_public' && def.key === 'investigations') ||
        m.collection === def.key
      );

      const localCount = prevRows.length;
      // V16: a COUNT mismatch means rows were removed/disabled upstream.
      // An upsert-only delta merge can never drop them, so retired rows
      // become sticky forever. Fetch the complete authoritative collection
      // instead (fetchCollection asserts the exact expected count).
      //
      // Story scenes/media are the visibility-filtered SUBSET returned by
      // `stories_snapshot_manifest_v2`, so their local count can never
      // equal the raw table count in the server manifest — comparing them
      // would force an endless full re-fetch. Only their timestamps count.
      const countComparable = isManifestCountComparable(def.key);
      const countMismatch = serverItem && countComparable ? serverItem.total_count !== localCount : false;
      const needsSync = serverItem 
        ? (countMismatch || new Date(serverItem.last_updated).getTime() > new Date(previous.generated_at).getTime())
        : true; // fallback if manifest missing

      if (needsSync) {
        if (STORY_MANIFEST_KEYS.has(def.key)) {
          // Story collections come from the visibility-redacting manifest
          // RPC — merge, never replace (V16 regression fix #2).
          const fetched = await fetchCollection(def);
          merged = mergeStoryCollection(def.key, prevRows, fetched);
        } else if (countMismatch || FULL_REFRESH_KEYS.has(def.key)) {
          // V16: campaigns always take the authoritative full fetch of
          // `campaigns_public`. An upsert-only delta merge cannot drop a
          // campaign that was unpublished/retired upstream, and the manifest
          // count is not comparable for this collection (it counts drafts).
          merged = await fetchCollection(def);
        } else if (since && !NO_UPDATED_AT.has(def.key)) {
          const deltas = await fetchCollectionSince(def, since);
          if (deltas === null) {
            merged = await fetchCollection(def);
          } else {
            merged = mergeRows(prevRows, deltas);
            totalDeltas += deltas.length;
          }
        } else {
          merged = await fetchCollection(def);
        }
      }
    } catch (e) {
      console.warn(`[snapshot] incremental sync failed for ${def.table}, keeping cache:`, e);
      merged = prevRows;
    }

    // Atomic verify: ensure we didn't wipe the collection
    if (merged.length === 0 && prevRows.length > 0) merged = prevRows;
    
    nextCollections[def.key] = merged;
    nextCounts[def.key] = merged.length;
    manifest.push({
      key: def.key,
      count: merged.length,
      checksum: await sha256Hex(canonicalJSON(merged)),
    });
  }

  const snap: OfflineSnapshot = {
    snapshot_version: Date.now(),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: "live",
    content_counts: nextCounts,
    checksum: await sha256Hex(canonicalJSON(nextCollections)),
    collection_manifest: manifest,
    collections: nextCollections,
  };

  return snap;
}


/** Load the bundled snapshot shipped in /public. */
export async function loadBundledSnapshot(): Promise<OfflineSnapshot | null> {
  const urls = new Set<string>([BUNDLED_SNAPSHOT_URL]);
  try {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    urls.add(`${String(base).replace(/\/$/, "")}/offline-snapshot.json`);
  } catch { /* ignore */ }
  try {
    if (typeof window !== "undefined") {
      urls.add(new URL("/offline-snapshot.json", window.location.origin).toString());
      urls.add(new URL("offline-snapshot.json", window.location.href).toString());
    }
  } catch { /* ignore */ }

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const j = await res.json();
      if (!j || typeof j !== "object" || !j.collections) continue;
      const snap = { ...j, source: "bundled" } as OfflineSnapshot;
      const { validateSnapshot } = await import("./offline-snapshot-validate");
      if (!validateSnapshot(snap).ok) continue;
      return snap;
    } catch { /* try next URL */ }
  }
  return null;
}

/** Read content for a collection using the documented priority order. */
export async function getCollection<T = any>(
  key: OfflineCollectionKey,
): Promise<T[]> {
  const local = await loadSnapshot();
  if (local?.collections?.[key]?.length) return local.collections[key] as T[];

  const bundled = await loadBundledSnapshot();
  if (bundled?.collections?.[key]?.length) return bundled.collections[key] as T[];

  const def = COLLECTIONS.find((c) => c.key === key);
  if (def && typeof navigator !== "undefined" && navigator.onLine !== false) {
    try { return (await fetchCollection(def)) as T[]; } catch { /* ignore */ }
  }
  return [];
}

/** Back-compat wrapper for the older `getContent("encyclopedia")` API. */
export async function getContent<T = any>(
  type: ContentType,
  legacyFallback?: () => T[] | Promise<T[]>,
): Promise<T[]> {
  const rows = await getCollection<T>(LEGACY_TO_COLLECTION[type]);
  if (rows.length > 0) return rows;
  if (legacyFallback) {
    try { return await legacyFallback(); } catch { /* ignore */ }
  }
  return [];
}

/**
 * Boot-time sync.
 * - If no local snapshot, hydrate from bundled immediately so first paint
 *   has data even when offline.
 * - If online and local snapshot is missing or older than `maxAgeMs`,
 *   regenerate from Supabase in the background.
 */
const SYNC_LOCK_KEY = "irth.offline.sync.lock";

function hasRequiredSnapshotContent(snap: OfflineSnapshot | null | undefined): snap is OfflineSnapshot {
  if (!snap?.collections) return false;
  return REQUIRED_COLLECTION_KEYS.every((key) => {
    const rows = snap.collections[key];
    if (!Array.isArray(rows) || rows.length === 0) return false;
    if (key === "encyclopedia_entities") return rows.length >= MIN_PUBLIC_ENCYCLOPEDIA_ROWS;
    return true;
  });
}

/**
 * Staleness decision for the boot-time background sync.
 *
 * V16 fix: a snapshot whose `generated_at` lies in the FUTURE (corrupt or
 * externally-written metadata) produced a negative age, which read as
 * "fresh" and permanently suppressed the background sync. A negative age —
 * and an unparseable date — now fail open: treat as stale and sync.
 */
export function isSnapshotStale(
  local: OfflineSnapshot | null | undefined,
  maxAgeMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (!local) return true;
  if (local.schema_version !== SNAPSHOT_SCHEMA_VERSION) return true;
  const generatedAt = new Date(local.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) return true;
  const age = nowMs - generatedAt;
  if (age < 0) return true; // future-dated metadata → never trust as fresh
  return age > maxAgeMs;
}


export async function bootstrapOfflineSync(opts: { maxAgeMs?: number } = {}): Promise<void> {
  const maxAge = opts.maxAgeMs ?? 6 * 60 * 60 * 1000; // 6h
  try {
    // Phase 2: Priority Bootstrap (Memory baseline -> IDB Seed)
    try {
      const { getBaselineContent, seedBaselineToPersistentStore } = await import("./offline-baseline-resolver");
      await getBaselineContent();
      void seedBaselineToPersistentStore();
    } catch (e) {
      console.warn("[offline-sync] baseline bootstrap failed:", e);
    }

    let local = await loadSnapshot();
    if (!hasRequiredSnapshotContent(local)) {
      const bundled = await loadBundledSnapshot();
      if (hasRequiredSnapshotContent(bundled)) {
        // Merge, never replace: keep any locally-seeded collections the
        // APK bundle does not carry (baseline games / story collections).
        const merged = mergeSnapshots(local, bundled);
        await saveSnapshot(merged);
        local = merged;
      }
    }

    // Phase 3: Immediate memory hydration for fast paint
    try {
      const { applyLocalSnapshot, ensureLocalSnapshotLoaded } = await import("./local-first-store");
      // Hydrate memory immediately so UI isn't empty on first paint
      if (hasRequiredSnapshotContent(local)) {
        applyLocalSnapshot(local);
      } else {
        await ensureLocalSnapshotLoaded();
      }
    } catch (e) {
      console.warn("[offline-sync] initial hydration failed:", e);
    }


    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!online) return;

    // Background Sync Strategy
    const stale = isSnapshotStale(local, maxAge);

    
    if (!stale) {
      // Even if not stale, check the manifest for deltas (lightweight)
      const { checkManifestUpdates } = await import("./offline-manifest");
      const { upToDate } = await checkManifestUpdates();
      if (upToDate) return;
    }

    // Lightweight in-tab debounce
    try {
      const last = Number(sessionStorage.getItem(SYNC_LOCK_KEY) ?? "0");
      if (Date.now() - last < 60 * 1000) return;
      sessionStorage.setItem(SYNC_LOCK_KEY, String(Date.now()));
    } catch { /* ignore */ }

    // Phase 3 (V16): canonical content is NEVER replaced silently once the
    // device already holds a usable snapshot. We only DETECT that newer
    // content exists and surface "يتوفر تحديث للمحتوى"; the player decides.
    if (hasRequiredSnapshotContent(local)) {
      void import("./offline-content-update")
        .then((m) => m.checkForContentUpdate())
        .catch((e) => console.warn("[offline-sync] update check failed:", e));
    } else {
      // No usable local content at all — first run online. Building the
      // initial snapshot is not a "replacement", so it may proceed.
      void generateAndStoreSnapshot().catch((e) =>
        console.warn("[offline-sync] initial convergence failed:", e),
      );
    }

    // Warm high-priority images from the current snapshot
    void (async () => {
      const snap = local ?? (await loadSnapshot());
      if (snap?.collections) {
        await warmSnapshotImageCache(snap.collections);
      }
    })();

    // EXPOSE FOR DIAGNOSTICS: Attach irth global if window exists
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as any).irth = {
        localDataVersion,
        isLocalReady,
        generateAndStoreSnapshot
      };
    }
  } catch (e) {
    console.warn("[offline-sync] bootstrap failed:", e);
  }
}



export const REQUIRED_COLLECTION_KEYS: OfflineCollectionKey[] = COLLECTIONS
  .filter((c) => c.required)
  .map((c) => c.key);
