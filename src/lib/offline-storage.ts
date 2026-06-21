/**
 * Offline storage layer — Phase 1 infrastructure.
 *
 * Persists a single content snapshot using IndexedDB when available,
 * with a localStorage fallback. No app code consumes this yet.
 */

export interface OfflineSnapshot {
  version: number;
  generated_at: string;
  encyclopedia: any[];
  campaigns: any[];
  investigations: any[];
  today_in_history: any[];
  daily_facts: any[];
}

const DB_NAME = "irth-offline";
const DB_VERSION = 1;
const STORE = "snapshots";
const KEY = "content";
const LS_KEY = "irth.offline.snapshot.v1";

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

export async function saveSnapshot(snap: OfflineSnapshot): Promise<void> {
  if (hasIDB()) {
    try {
      await idbPut(snap);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch (e) {
    console.warn("[offline-storage] saveSnapshot failed", e);
  }
}

export async function loadSnapshot(): Promise<OfflineSnapshot | null> {
  if (hasIDB()) {
    try {
      const v = await idbGet();
      if (v) return v;
    } catch {
      // fall through
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as OfflineSnapshot) : null;
  } catch {
    return null;
  }
}

export async function getSnapshotVersion(): Promise<{ version: number; generated_at: string } | null> {
  const snap = await loadSnapshot();
  if (!snap) return null;
  return { version: snap.version, generated_at: snap.generated_at };
}

export async function clearSnapshot(): Promise<void> {
  if (hasIDB()) {
    try {
      await idbDelete();
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
