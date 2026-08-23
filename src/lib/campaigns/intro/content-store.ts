// ============================================================
// Campaign Intros — synced content store (delta sync layer)
// ------------------------------------------------------------
// The bundled offline snapshot is a SEED, not the final truth.
// Anything published after the APK was built lands here:
//
//   * bundles  → IndexedDB (`irth-campaign-intros` / `bundles`),
//     one record per intro story so a write is atomic per story
//     and a failed download can never corrupt a working intro.
//   * links + meta → localStorage mirror, small enough to read
//     SYNCHRONOUSLY inside the intro gate (which must decide on
//     first render, without awaiting anything).
//
// This store is campaign-intro only. It never feeds /stories,
// story statistics, or story search.
// ============================================================

export interface SyncedIntroLink {
  campaignId: string;
  slug: string | null;
  storyId: string;
  version: number;
}

export interface SyncedIntroBundle {
  storyId: string;
  contentVersion: number;
  updatedAt: string | null;
  story: Record<string, unknown>;
  scenes: Record<string, unknown>[];
  media: Record<string, unknown>[];
  syncedAt: string;
}

export interface IntroSyncMeta {
  last_successful_sync: string | null;
  /** Server clock of the last successful sync — the delta cursor. */
  sync_cursor: string | null;
  sync_version: number;
  added: number;
  updated: number;
  removed: number;
  last_error: string | null;
  last_attempt: string | null;
}

const DB_NAME = "irth-campaign-intros";
const DB_VERSION = 1;
const STORE_BUNDLES = "bundles";

const LS_LINKS = "irth.introSync.links.v1";
const LS_META = "irth.introSync.meta.v1";

export const EMPTY_INTRO_SYNC_META: IntroSyncMeta = {
  last_successful_sync: null,
  sync_cursor: null,
  sync_version: 0,
  added: 0,
  updated: 0,
  removed: 0,
  last_error: null,
  last_attempt: null,
};

function hasIDB(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BUNDLES)) {
        db.createObjectStore(STORE_BUNDLES, { keyPath: "storyId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------
// Links (synchronous) — campaign → intro story
// ---------------------------------------------------------------

let linkCache: Map<string, SyncedIntroLink> | null = null;

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return t ? t : null;
}

function hydrateLinks(): Map<string, SyncedIntroLink> {
  if (linkCache) return linkCache;
  const map = new Map<string, SyncedIntroLink>();
  try {
    const raw = ls()?.getItem(LS_LINKS);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        const storyId = typeof row?.storyId === "string" ? row.storyId.trim() : "";
        const campaignId = typeof row?.campaignId === "string" ? row.campaignId.trim() : "";
        if (!storyId || !campaignId) continue;
        const link: SyncedIntroLink = {
          campaignId,
          slug: typeof row?.slug === "string" ? row.slug : null,
          storyId,
          version: Number.isFinite(row?.version) && row.version >= 1 ? Math.trunc(row.version) : 1,
        };
        const byId = normalizeKey(campaignId);
        if (byId) map.set(byId, link);
        const bySlug = normalizeKey(link.slug);
        if (bySlug) map.set(bySlug, link);
      }
    }
  } catch {
    /* corrupt mirror → treat as empty */
  }
  linkCache = map;
  return map;
}

/** Synchronous lookup used by the intro gate on first render. */
export function getSyncedIntroLink(idOrSlug: unknown): SyncedIntroLink | null {
  const key = normalizeKey(idOrSlug);
  if (!key) return null;
  return hydrateLinks().get(key) ?? null;
}

export function listSyncedIntroLinks(): SyncedIntroLink[] {
  const seen = new Set<string>();
  const out: SyncedIntroLink[] = [];
  for (const link of hydrateLinks().values()) {
    const k = `${link.campaignId}::${link.storyId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(link);
  }
  return out;
}

export function writeSyncedIntroLinks(links: SyncedIntroLink[]): void {
  linkCache = null;
  try {
    ls()?.setItem(LS_LINKS, JSON.stringify(links));
  } catch {
    /* storage full / private mode — links simply stay un-mirrored */
  }
  hydrateLinks();
}

/** 
 * OWNER TRANSITION FIX: Clear the in-memory cache when identity changes.
 * The partition layer handles the underlying localStorage, but this 
 * module-level Map would otherwise stay stale.
 */
export function clearIntroLinkCache(): void {
  linkCache = null;
}

// ---------------------------------------------------------------
// Meta
// ---------------------------------------------------------------

export function readIntroSyncMeta(): IntroSyncMeta {
  try {
    const raw = ls()?.getItem(LS_META);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      return { ...EMPTY_INTRO_SYNC_META, ...parsed } as IntroSyncMeta;
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY_INTRO_SYNC_META };
}

export function writeIntroSyncMeta(patch: Partial<IntroSyncMeta>): IntroSyncMeta {
  const next = { ...readIntroSyncMeta(), ...patch };
  try {
    ls()?.setItem(LS_META, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

// ---------------------------------------------------------------
// Bundles (IndexedDB)
// ---------------------------------------------------------------

export async function readSyncedIntroBundle(
  storyId: string,
): Promise<SyncedIntroBundle | null> {
  if (!storyId || !hasIDB()) return null;
  try {
    const db = await openDB();
    const row = await new Promise<SyncedIntroBundle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_BUNDLES, "readonly");
      const req = tx.objectStore(STORE_BUNDLES).get(storyId);
      req.onsuccess = () => resolve((req.result as SyncedIntroBundle) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row;
  } catch {
    return null;
  }
}

export async function listSyncedIntroBundles(): Promise<SyncedIntroBundle[]> {
  if (!hasIDB()) return [];
  try {
    const db = await openDB();
    const rows = await new Promise<SyncedIntroBundle[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BUNDLES, "readonly");
      const req = tx.objectStore(STORE_BUNDLES).getAll();
      req.onsuccess = () => resolve((req.result as SyncedIntroBundle[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

/** Atomic per-story replace: the old bundle only disappears once the new one commits. */
export async function writeSyncedIntroBundle(bundle: SyncedIntroBundle): Promise<boolean> {
  if (!bundle?.storyId || !hasIDB()) return false;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BUNDLES, "readwrite");
      tx.objectStore(STORE_BUNDLES).put(bundle);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function deleteSyncedIntroBundle(storyId: string): Promise<void> {
  if (!storyId || !hasIDB()) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BUNDLES, "readwrite");
      tx.objectStore(STORE_BUNDLES).delete(storyId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
