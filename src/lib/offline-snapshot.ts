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
 *   3. Supabase live fallback (if online)
 *
 * Only public/player-safe published content is included. No drafts, no
 * admin-only data, no PII (profiles, referrals, audit logs, emails).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  loadSnapshot,
  saveSnapshot,
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
  /** Whether this collection is required for first-run playability. */
  required?: boolean;
  label: string;
}

export const COLLECTIONS: CollectionDef[] = [
  { key: "encyclopedia_entities", table: "encyclopedia_entities",
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
    label: "خريطة الأطلس (موثّقة فقط)" },
  // Legacy: museum content lives inside encyclopedia_entities (types:
  // figure/artifact/landmark/city/battle/event). content_registry is kept
  // for backwards-compatibility only — it does NOT duplicate encyclopedia
  // rows and is expected to be empty on modern installs.
  { key: "content_registry", table: "content_registry",
    required: false,
    label: "سجل المتحف (قديم/اختياري — المتحف يقرأ من الموسوعة)" },

  // Stories (P5) — first-class snapshot content. Anon RLS restricts
  // stories to status='published', scenes to scenes-of-published-stories,
  // and media to verified=true, so no additional filter is needed here.
  { key: "stories", table: "stories",
    filter: (q) => q.eq("status", "published"), required: false,
    label: "القصص المنشورة" },
  { key: "story_scenes", table: "story_scenes",
    required: false,
    label: "مشاهد القصص" },
  { key: "story_media", table: "story_media",
    filter: (q) => q.eq("verified", true), required: false,
    label: "وسائط القصص (مُتحقّقة فقط)" },
];

/** Collections that DO NOT expose `updated_at` — sync must full-fetch these. */
const NO_UPDATED_AT: ReadonlySet<OfflineCollectionKey> = new Set<OfflineCollectionKey>([
  "today_in_history_events",
  "daily_facts",
]);

async function fetchCollection(def: CollectionDef): Promise<any[]> {
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
      .select("*")
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
async function fetchCollectionSince(def: CollectionDef, since: string): Promise<any[] | null> {
  if (NO_UPDATED_AT.has(def.key)) return null;
  const PAGE = 500;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let query: any = supabase
      .from(def.table as any)
      .select("*")
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (def.filter) query = def.filter(query);
    const { data, error } = await query;
    if (error) {
      // Missing column, permission issue, etc. — surrender to full fetch.
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

/**
 * Collect cache URLs for verified story_media rows. Each URL is stamped
 * with `?v=<processing_version>` so a version bump forces a fresh fetch
 * without inventing a second image cache implementation.
 */
export function collectStoryMediaCacheUrls(mediaRows: any[]): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(mediaRows)) return out;
  // Compute the storage public URL prefix lazily and only once, so the
  // helper stays synchronous and importable from bootstrap paths.
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) return out;
  for (const row of mediaRows) {
    if (!row?.verified) continue;
    const bucket = row.storage_bucket;
    const path = row.storage_path;
    const pv = Number.isFinite(row.processing_version) ? row.processing_version : 1;
    if (!bucket || !path) continue;
    out.add(`${supabaseUrl}/storage/v1/object/public/${bucket}/${path}?v=${pv}`);
  }
  return out;
}


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

export async function generateAndStoreSnapshot(): Promise<OfflineSnapshot> {
  const previous = await loadSnapshot();
  const snap = await generateSnapshot();
  const { validateSnapshot } = await import("./offline-snapshot-validate");
  const report = validateSnapshot(snap);
  if (!report.ok) {
    console.warn("[snapshot] refusing to store invalid live snapshot", report.issues);
    throw new Error("Invalid offline snapshot; keeping existing local content");
  }
  // Never let a full online refresh SHRINK the local cache. If a public
  // policy tightened, a network hop returned partial data, or an API page
  // came back short, we still keep every row we already had. We union by
  // `id` with the previous snapshot so the full-fetch path can only ADD
  // or REFRESH rows, never remove them. Explicit removal only happens
  // through the admin "Clear Offline Cache" action.
  if (previous?.collections) {
    for (const def of COLLECTIONS) {
      const prevRows = previous.collections[def.key] ?? [];
      const nextRows = snap.collections[def.key] ?? [];
      const merged = mergeRows(prevRows, nextRows);
      if (nextRows.length < prevRows.length) {
        console.warn(
          `[snapshot] full-fetch of ${def.key} returned ${nextRows.length} rows ` +
          `(< previous ${prevRows.length}). Preserving old rows via id-merge.`,
        );
      }
      snap.collections[def.key] = merged;
      snap.content_counts[def.key] = merged.length;
    }
  }

  await saveSnapshot(snap);
  // Keep the in-memory local-first index in sync with the freshly persisted
  // snapshot so subsequent route reads see the new content immediately.
  try {
    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(snap);
  } catch { /* ignore */ }
  if (import.meta.env.DEV && typeof window === "undefined") {
    try {
      const { writeBundledSnapshotFile } = await import("./offline-snapshot-write.functions");
      await writeBundledSnapshotFile({ data: { json: JSON.stringify(snap, null, 2) } });
    } catch { /* dev-only path; ignore in prod */ }
  }
  // Warm the shared image cache with story media covers/scenes so a
  // freshly-synced install can render them offline.
  void (async () => {
    try {
      const { collectImageUrls, prefetchImages } = await import("./image-cache");
      const urls = collectImageUrls(snap.collections);
      for (const u of collectStoryMediaCacheUrls(snap.collections.story_media ?? [])) urls.add(u);
      await prefetchImages(urls);
    } catch { /* ignore */ }
  })();
  return snap;
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
export async function refreshSnapshotIncremental(): Promise<OfflineSnapshot> {
  const previous = await loadSnapshot();
  if (!previous?.collections) {
    throw new Error("No previous snapshot; run generateAndStoreSnapshot() first");
  }
  const nextCollections: Record<string, any[]> = { ...previous.collections };
  const nextCounts: Record<string, number> = { ...previous.content_counts };
  const manifest: { key: string; count: number; checksum?: string }[] = [];
  let totalDeltas = 0;

  for (const def of COLLECTIONS) {
    const prevRows = previous.collections[def.key] ?? [];
    const since = maxUpdatedAt(prevRows);
    let merged: any[] = prevRows;
    try {
      // True-up: if the live source has more rows than our cache, the
      // since-based delta will miss the rows we simply never fetched
      // (they existed with older `updated_at` before our first sync, or a
      // previous full fetch was silently truncated). Detect that gap and
      // do a full re-fetch for this collection so the cache converges.
      const expected = await fetchCollectionExpectedCount(def);
      const cacheIsShort =
        typeof expected === "number" && expected > prevRows.length;

      if (cacheIsShort) {
        console.info(
          `[snapshot] true-up ${def.table}: cache=${prevRows.length}, live=${expected} → full fetch`,
        );
        const fresh = await fetchCollection(def);
        merged = mergeRows(prevRows, fresh);
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
    } catch (e) {
      console.warn(`[snapshot] delta failed for ${def.table}, keeping cache:`, e);
      merged = prevRows;
    }
    // Guard: never let a delta reduce the cache to nothing.
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

  const { validateSnapshot } = await import("./offline-snapshot-validate");
  const report = validateSnapshot(snap);
  if (!report.ok) {
    console.warn("[snapshot] refusing to store invalid incremental snapshot", report.issues);
    throw new Error("Invalid offline snapshot; keeping existing local content");
  }
  await saveSnapshot(snap);
  try {
    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(snap);
  } catch { /* ignore */ }

  // Warm the image cache in the background with any new URLs.
  void (async () => {
    try {
      const { collectImageUrls, prefetchImages } = await import("./image-cache");
      const urls = collectImageUrls(nextCollections);
      // Story media (P5): stitch bucket+path+processing_version into
      // stable public URLs so the same encyclopedia image cache serves
      // stories offline. Version bumps yield new URLs and thus a fresh
      // fetch — invalidation happens exactly when processing_version moves.
      for (const u of collectStoryMediaCacheUrls(nextCollections.story_media ?? [])) urls.add(u);
      await prefetchImages(urls);
    } catch { /* ignore */ }
  })();

  console.info(`[offline-sync] incremental: ${totalDeltas} row deltas across ${COLLECTIONS.length} collections`);
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

export async function bootstrapOfflineSync(opts: { maxAgeMs?: number } = {}): Promise<void> {
  const maxAge = opts.maxAgeMs ?? 6 * 60 * 60 * 1000; // 6h
  try {
    let local = await loadSnapshot();
    if (!hasRequiredSnapshotContent(local)) {
      const bundled = await loadBundledSnapshot();
      if (hasRequiredSnapshotContent(bundled)) {
        await saveSnapshot(bundled);
        local = bundled;
      }
    }
    // Hydrate the in-memory local-first index immediately so player routes
    // can read content synchronously on first paint, even without network.
    try {
      const { applyLocalSnapshot, ensureLocalSnapshotLoaded } = await import("./local-first-store");
      if (hasRequiredSnapshotContent(local)) applyLocalSnapshot(local);
      else await ensureLocalSnapshotLoaded();
    } catch { /* ignore */ }


    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!online) return;

    const stale =
      !local ||
      local.schema_version !== SNAPSHOT_SCHEMA_VERSION ||
      Date.now() - new Date(local.generated_at).getTime() > maxAge;
    if (!stale) return;

    // Lightweight in-tab debounce so multiple route mounts don't refetch.
    try {
      const last = Number(sessionStorage.getItem(SYNC_LOCK_KEY) ?? "0");
      if (Date.now() - last < 60 * 1000) return;
      sessionStorage.setItem(SYNC_LOCK_KEY, String(Date.now()));
    } catch { /* ignore */ }

    // Fire-and-forget — UI is already rendered from local/bundled.
    // Prefer incremental sync when we already have a baseline snapshot.
    const refresh = local?.collections
      ? refreshSnapshotIncremental()
      : generateAndStoreSnapshot();
    void refresh.catch((e) =>
      console.warn("[offline-sync] background refresh failed:", e),
    );

    // Warm the image cache from whatever content we already have locally
    // so covers/thumbnails survive going offline mid-session.
    void (async () => {
      try {
        const snap = local ?? (await loadSnapshot());
        if (!snap?.collections) return;
        const { collectImageUrls, prefetchImages } = await import("./image-cache");
        const urls = collectImageUrls(snap.collections);
        for (const u of collectStoryMediaCacheUrls(snap.collections.story_media ?? [])) urls.add(u);
        await prefetchImages(urls);
      } catch { /* ignore */ }
    })();
  } catch (e) {
    console.warn("[offline-sync] bootstrap failed:", e);
  }
}

export const REQUIRED_COLLECTION_KEYS: OfflineCollectionKey[] = COLLECTIONS
  .filter((c) => c.required)
  .map((c) => c.key);
