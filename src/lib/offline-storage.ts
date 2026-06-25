/**
 * Offline storage layer.
 *
 * Persists the offline content snapshot in IndexedDB (with localStorage fallback).
 * Schema:
 *   {
 *     snapshot_version: number,          // bumped on schema change
 *     generated_at: string (ISO),
 *     source: "live" | "bundled",
 *     content_counts: Record<collection, number>,
 *     checksum?: string (sha256 hex of canonical JSON of `collections`)
 *     collections: Record<collection, any[]>
 *   }
 */

export const SNAPSHOT_SCHEMA_VERSION = 2;

export type OfflineCollectionKey =
  | "encyclopedia_entities"
  | "admin_campaigns"
  | "investigations"
  | "today_in_history_events"
  | "daily_facts"
  | "atlas_entities"
  | "content_registry";

/** Manifest entry — future-ready, allows incremental delta-sync per collection. */
export interface CollectionManifestEntry {
  key: string;
  count: number;
  checksum?: string;
}

export interface OfflineSnapshot {
  /** Bumped each time a new snapshot is generated (data revision). */
  snapshot_version: number;
  /** Bumped only when the structural schema of this file changes. */
  schema_version: number;
  generated_at: string;
  source?: "live" | "bundled";
  /** Aggregate checksum over all collections. */
  checksum?: string;
  /** Map of collection name → row count. */
  content_counts: Record<string, number>;
  /** Per-collection manifest, ready for delta-sync without breaking runtime. */
  collection_manifest?: CollectionManifestEntry[];
  /** Actual row data. Runtime reads this directly. */
  collections: Record<string, any[]>;
}

const DB_NAME = "irth-offline";
const DB_VERSION = 1;
const STORE = "snapshots";
const KEY = "content";
const LS_KEY = "irth.offline.snapshot.v2";
const LEGACY_LS_KEY = "irth.offline.snapshot.v1";

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: OfflineSnapshot): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet(): Promise<OfflineSnapshot | null> {
  const db = await openDB();
  const result = await new Promise<OfflineSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as OfflineSnapshot) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

async function idbDelete(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Normalize legacy v1 shape (flat keys) into v2. */
function normalize(raw: any): OfflineSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.collections && raw.content_counts) return raw as OfflineSnapshot;
  // Legacy flat v1
  const collections: Record<string, any[]> = {};
  const map: Record<string, string> = {
    encyclopedia: "encyclopedia_entities",
    campaigns: "admin_campaigns",
    investigations: "investigations",
    today_in_history: "today_in_history_events",
    daily_facts: "daily_facts",
  };
  for (const [k, target] of Object.entries(map)) {
    if (Array.isArray(raw[k])) collections[target] = raw[k];
  }
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(collections)) counts[k] = (v as any[]).length;
  return {
    snapshot_version: typeof raw.version === "number" ? raw.version : 1,
    generated_at: raw.generated_at ?? new Date(0).toISOString(),
    content_counts: counts,
    collections,
  };
}

export async function saveSnapshot(snap: OfflineSnapshot): Promise<void> {
  if (hasIDB()) {
    try { await idbPut(snap); return; } catch { /* fall through */ }
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); }
  catch (e) { console.warn("[offline-storage] saveSnapshot failed", e); }
}

export async function loadSnapshot(): Promise<OfflineSnapshot | null> {
  if (hasIDB()) {
    try { const v = await idbGet(); if (v) return normalize(v); }
    catch { /* fall through */ }
  }
  try {
    const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LEGACY_LS_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function getSnapshotInfo(): Promise<{
  snapshot_version: number;
  generated_at: string;
  source?: string;
  content_counts: Record<string, number>;
  checksum?: string;
} | null> {
  const snap = await loadSnapshot();
  if (!snap) return null;
  return {
    snapshot_version: snap.snapshot_version,
    generated_at: snap.generated_at,
    source: snap.source,
    content_counts: snap.content_counts,
    checksum: snap.checksum,
  };
}

/** Back-compat alias used by older callers. */
export async function getSnapshotVersion(): Promise<{ version: number; generated_at: string } | null> {
  const info = await getSnapshotInfo();
  return info ? { version: info.snapshot_version, generated_at: info.generated_at } : null;
}

export async function clearSnapshot(): Promise<void> {
  if (hasIDB()) {
    try { await idbDelete(); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LEGACY_LS_KEY); }
  catch { /* ignore */ }
}
