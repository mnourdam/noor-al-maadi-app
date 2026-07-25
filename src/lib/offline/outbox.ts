// ============================================================
// Offline Outbox — durable, per-user, IndexedDB-backed queue
// ------------------------------------------------------------
// Every offline mutation (game complete, chapter complete,
// investigation complete, discovery unlock, reward delta) is
// enqueued here before it is sent to Supabase. On reconnect a
// flush driver drains the queue. Items are removed ONLY after
// the server confirms success or confirms already-applied.
//
// Storage: IndexedDB primary, localStorage emergency fallback.
// Scope:   Every item carries `userId`; queries are scoped by it
//          so signed-out state or a different signed-in user can
//          never touch another account's queue.
// ============================================================

export type OutboxKind =
  | "collection_add"        // user_collection upsert (ownership/awards)
  | "entity_discovery"      // user_entity_discoveries upsert (encyclopedia reads)
  | "game_complete"         // game_progress upsert
  | "chapter_progress"      // record_campaign_progress_v2 RPC (Priority-Zero authoritative path)
  | "profile_delta"         // apply_profile_delta RPC (idempotent XP/dinars/hearts)
  | "investigation_complete" // complete_investigation_v2 RPC (server-authoritative)
  | "investigation_backfill" // backfill_investigation_completion RPC (single-key legacy)
  | "investigation_backfill_batch" // backfill_investigation_completions RPC (batched legacy)
  | "campaign_completion"   // record_campaign_completion RPC (sticky, versioned)
  | "tutorial_completion"   // record_tutorial_completion RPC (durable onboarding mirror)
  | "story_progress"        // record_story_progress_v2 RPC (monotonic per-scene)
  | "story_completion"      // complete_story_v2 RPC (sticky, version-independent reward)
  | "avatar_select";        // sync_my_public_stats RPC (durable Premium Emblem pick)

export interface OutboxItem {
  id: string;               // uuid, doubles as idempotency key
  userId: string;           // auth.users.id owner
  kind: OutboxKind;
  payload: Record<string, unknown>;
  createdAt: number;        // ms epoch
  attempts: number;
  lastError?: string | null;
}

const DB_NAME = "irth-offline-outbox";
const DB_VERSION = 1;
const STORE = "items";
const LS_FALLBACK = "irth.outbox.fallback.v1";

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  try { return typeof indexedDB !== "undefined"; } catch { return false; }
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIndexedDB()) { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
  });
  return dbPromise;
}

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- localStorage fallback (emergency only) ----------

function lsReadAll(): OutboxItem[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_FALLBACK) : null;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as OutboxItem[]) : [];
  } catch { return []; }
}

function lsWriteAll(items: OutboxItem[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_FALLBACK, JSON.stringify(items.slice(0, 2000)));
  } catch { /* quota */ }
}

// ---------- Public API ----------

export async function enqueue(
  userId: string,
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  return enqueueInternal(userId, kind, payload, uuid());
}

/**
 * Enqueue a mutation with a caller-supplied stable id. The id doubles as
 * the server-side idempotency key (e.g. `apply_profile_delta.p_delta_id`).
 * Repeated calls with the same id are a no-op: the existing queued row is
 * overwritten with the same payload, so a duplicate flush cannot double-
 * grant. This is the offline path for canonical, atomic reward grants
 * (Daily Quest, streak milestones, etc.).
 */
export async function enqueueWithId(
  userId: string,
  id: string,
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  return enqueueInternal(userId, kind, payload, id);
}

async function enqueueInternal(
  userId: string,
  kind: OutboxKind,
  payload: Record<string, unknown>,
  id: string,
): Promise<OutboxItem> {
  const item: OutboxItem = {
    id,
    userId,
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      // `put` upserts by keyPath (id). Re-enqueueing with the same stable id
      // is idempotent — the second write overwrites the first with the same
      // payload; it does NOT create a duplicate row.
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-put-failed"));
    });
  } catch {
    const all = lsReadAll().filter((i) => i.id !== item.id);
    all.push(item);
    lsWriteAll(all);
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:outbox:changed"));
    }
  } catch { /* ignore */ }
  return item;
}

export async function peekAll(userId: string): Promise<OutboxItem[]> {
  try {
    const db = await openDB();
    return await new Promise<OutboxItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("userId");
      const req = idx.getAll(IDBKeyRange.only(userId));
      req.onsuccess = () => resolve((req.result as OutboxItem[]).sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error ?? new Error("idb-get-failed"));
    });
  } catch {
    return lsReadAll().filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  }
}

export async function countAll(userId: string): Promise<number> {
  const items = await peekAll(userId);
  return items.length;
}

export async function remove(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-del-failed"));
    });
  } catch {
    lsWriteAll(lsReadAll().filter((i) => i.id !== id));
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:outbox:changed"));
    }
  } catch { /* ignore */ }
}

export async function bumpAttempt(id: string, error: string | null): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const cur = req.result as OutboxItem | undefined;
        if (!cur) { resolve(); return; }
        cur.attempts += 1;
        cur.lastError = error;
        store.put(cur);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb-bump-failed"));
    });
  } catch {
    const all = lsReadAll();
    const cur = all.find((i) => i.id === id);
    if (cur) { cur.attempts += 1; cur.lastError = error; lsWriteAll(all); }
  }
}

export async function stats(userId: string): Promise<{ pending: number; failed: number }> {
  const items = await peekAll(userId);
  return { pending: items.length, failed: items.filter((i) => i.attempts >= 3).length };
}
