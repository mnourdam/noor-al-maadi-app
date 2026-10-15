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
  | "avatar_select"         // sync_my_public_stats RPC (durable Premium Emblem pick)
  | "reflection_save"       // user_reflections upsert (durable Reflective Moment)
  | "reflection_delete"     // user_reflections delete (durable, tombstoned)
  | "campaign_intro"         // record_campaign_intro_v1 RPC (idempotent, monotonic)
  | "streak_activity";      // record_streak_activity_v16 RPC (durable IRTH activity day)



export interface OutboxItem {
  id: string;               // uuid, doubles as idempotency key
  userId: string;           // auth.users.id owner
  kind: OutboxKind;
  payload: Record<string, unknown>;
  createdAt: number;        // ms epoch
  attempts: number;
  lastError?: string | null;
  /** Missing on V17 rows. Tokens identify writes, not wall-clock ordering. */
  revision?: string;
  supersedes?: string;
  /** Last known durable ancestor while coalescing fallback writes during an outage. */
  recoveryBase?: string;
}

const DB_NAME = "irth-offline-outbox";
const DB_VERSION = 1;
const STORE = "items";
const LS_FALLBACK = "irth.outbox.fallback.v1";
const FALLBACK_CAPACITY = 2000;

export class OutboxStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OutboxStorageError";
  }
}

/** A partial read must never be used to prove the queue is empty. */
export class OutboxReadError extends OutboxStorageError {
  constructor(public readonly partialItems: OutboxItem[], options?: ErrorOptions) {
    super("Outbox read incomplete", options);
    this.name = "OutboxReadError";
  }
}

class DatabaseError extends Error {}
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onblocked = () => { blocked = true; reject(new Error("idb-open-blocked")); };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/** IDB serializes read/compare/write across tabs even without Web Locks. */
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, rows: OutboxItem[]) => T): Promise<T> {
  try {
    const db = await openDB();
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(STORE, mode); }
      catch (cause) {
        // A closed/invalid handle must be reopened on the next operation.
        dbPromise = null;
        reject(new DatabaseError("Outbox IDB transaction unavailable", { cause }));
        return;
      }
      let value: T;
      let actionError: unknown;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(actionError ?? new DatabaseError("Outbox IDB transaction failed", { cause: tx.error }));
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const rows = validateRows(request.result);
          value = action(store, rows);
        } catch (error) {
          actionError = error;
          tx.abort();
        }
      };
    });
  } catch (error) {
    if (error instanceof OutboxStorageError || error instanceof DatabaseError) throw error;
    throw new DatabaseError("Outbox IDB unavailable", { cause: error });
  }
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

function validateRows(value: unknown): OutboxItem[] {
  if (!Array.isArray(value) || !value.every((item) =>
    item && typeof item === "object" &&
    typeof item.id === "string" && typeof item.userId === "string" &&
    typeof item.kind === "string" && Number.isFinite(item.createdAt) &&
    Number.isFinite(item.attempts) && item.payload &&
    typeof item.payload === "object" && !Array.isArray(item.payload) &&
    (item.revision === undefined || typeof item.revision === "string") &&
    (item.supersedes === undefined || typeof item.supersedes === "string") &&
    (item.recoveryBase === undefined || typeof item.recoveryBase === "string")
  )) throw new OutboxStorageError("invalid-outbox-data");
  return value as OutboxItem[];
}

function lsReadAllOrThrow(): OutboxItem[] {
  if (typeof localStorage === "undefined") throw new OutboxStorageError("no-local-storage");
  const raw = localStorage.getItem(LS_FALLBACK);
  return raw === null ? [] : validateRows(JSON.parse(raw));
}

function lsWriteAll(items: OutboxItem[]): void {
  if (items.length > FALLBACK_CAPACITY) throw new OutboxStorageError("outbox-fallback-full");
  localStorage.setItem(LS_FALLBACK, JSON.stringify(items));
}

// Canonical comparison also supports V17 rows that have no revision token.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).filter((key) => row[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(a: OutboxItem, b: OutboxItem): boolean { return canonical(a) === canonical(b); }
function token(item: OutboxItem): string { return item.revision ?? `v17:${canonical(item)}`; }
function identity(item: OutboxItem): string { return JSON.stringify([item.userId, item.id]); }

function merge(rows: OutboxItem[]): OutboxItem[] {
  const result = new Map<string, OutboxItem>();
  for (const row of rows) {
    const key = identity(row);
    const previous = result.get(key);
    if (!previous || same(previous, row)) result.set(key, row);
    else if (row.supersedes === token(previous) || row.recoveryBase === token(previous)) result.set(key, row);
    else if (previous.supersedes !== token(row) && previous.recoveryBase !== token(row)) {
      // Concurrent/unknown ancestry is not ordered by unreliable wall clocks.
      throw new OutboxStorageError("outbox-revision-conflict");
    }
  }
  return [...result.values()];
}

async function coordinated<T>(action: (locked: boolean) => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(LS_FALLBACK, { mode: "exclusive" }, () => action(true)) : action(false);
}

function requireLock(locked: boolean): void {
  if (!locked) throw new OutboxStorageError("outbox-fallback-requires-web-locks");
}

function changed(): void {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irth:outbox:changed")); } catch { /* observer only */ }
}

/** Copy -> commit -> remove only unchanged fallback rows. Caller holds the lock. */
async function recover(fallback: OutboxItem[], locked: boolean): Promise<OutboxItem[]> {
  // Without a cross-context lock, do not mutate the shared localStorage array.
  if (fallback.length) requireLock(locked);
  const rows = await transaction(fallback.length ? "readwrite" : "readonly", (store, stored) => {
    const merged = merge([...stored, ...fallback]);
    for (const row of fallback) {
      const collision = stored.find((item) => item.id === row.id && item.userId !== row.userId);
      const otherFallback = fallback.find((item) => item.id === row.id && item.userId !== row.userId);
      // v1 IDB is keyed by id alone. Preserve both accounts instead of overwriting.
      if (collision || otherFallback) throw new OutboxStorageError("outbox-account-id-collision");
    }
    if (fallback.length) for (const row of merged) store.put(row);
    return merged;
  });
  if (fallback.length) {
    const current = lsReadAllOrThrow();
    const remaining = current.filter((row) => !fallback.some((copied) => same(copied, row)));
    lsWriteAll(remaining);
    if (remaining.length) throw new OutboxStorageError("outbox-fallback-changed-during-recovery");
  }
  return rows;
}

/** Both stores are required for a complete observation, even after one fails. */
async function readBoth(userId: string): Promise<{ fallback: OutboxItem[]; stored: OutboxItem[] }> {
  const [ls, idb] = await Promise.allSettled([
    Promise.resolve().then(lsReadAllOrThrow),
    transaction("readonly", (_store, rows) => rows),
  ]);
  if (ls.status === "rejected" || idb.status === "rejected") {
    throw new OutboxReadError([
      ...(idb.status === "fulfilled" ? idb.value.filter((row) => row.userId === userId) : []),
      ...(ls.status === "fulfilled" ? ls.value.filter((row) => row.userId === userId) : []),
    ], { cause: new AggregateError([ls, idb].filter((r) => r.status === "rejected").map((r) => r.reason)) });
  }
  return { fallback: ls.value, stored: idb.value };
}

export async function enqueue(userId: string, kind: OutboxKind, payload: Record<string, unknown>): Promise<OutboxItem> {
  return enqueueWithId(userId, uuid(), kind, payload);
}

/** A receipt describes this exact committed JSON snapshot, not the caller's live object. */
export async function enqueueWithId(userId: string, id: string, kind: OutboxKind, payload: Record<string, unknown>): Promise<OutboxItem> {
  let frozenPayload: Record<string, unknown>;
  try {
    frozenPayload = JSON.parse(JSON.stringify(payload));
    if (!frozenPayload || typeof frozenPayload !== "object" || Array.isArray(frozenPayload)) throw new Error("invalid-payload");
  } catch (cause) { throw new OutboxStorageError("Outbox persistence failed", { cause }); }
  return coordinated(async (locked) => {
    try {
      const fallback = lsReadAllOrThrow();
      let base: OutboxItem | undefined;
      try {
        const recovered = await recover(fallback, locked);
        base = recovered.find((row) => row.id === id && row.userId === userId);
        const saved = await transaction("readwrite", (store, rows) => {
          if (rows.some((row) => row.id === id && row.userId !== userId)) throw new OutboxStorageError("outbox-account-id-collision");
          const previous = rows.find((row) => row.id === id);
          const item = makeItem(previous);
          store.put(item);
          return item;
        });
        changed();
        return saved;
      } catch (error) {
        if (!(error instanceof DatabaseError)) throw error;
        requireLock(locked);
        const current = lsReadAllOrThrow();
        if (current.some((row) => row.id === id && row.userId !== userId)) throw new OutboxStorageError("outbox-account-id-collision");
        const pending = current.find((row) => row.id === id);
        const previous = pending ?? base;
        const anchor = pending?.recoveryBase ?? (previous ? token(previous) : undefined);
        const item = makeItem(previous, anchor);
        lsWriteAll([...current.filter((row) => row.id !== id), item]);
        changed();
        return item;
      }
      function makeItem(previous?: OutboxItem, recoveryBase?: string): OutboxItem {
        return {
          id, userId, kind, payload: frozenPayload, createdAt: Date.now(), attempts: 0, lastError: null,
          revision: uuid(), ...(previous ? { supersedes: token(previous) } : {}),
          ...(recoveryBase ? { recoveryBase } : {}),
        };
      }
    } catch (cause) { throw new OutboxStorageError("Outbox persistence failed", { cause }); }
  });
}

export async function peekAll(userId: string): Promise<OutboxItem[]> {
  return coordinated(async (locked) => {
    const { fallback, stored } = await readBoth(userId);
    const items = locked ? await recover(fallback, true) : merge([...stored, ...fallback]);
    return items.filter((row) => row.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  });
}

export async function countAll(userId: string): Promise<number> { return (await peekAll(userId)).length; }

/** Legacy id-only acknowledgements fail closed; a stale caller cannot delete a new write. */
export async function remove(id: string, expected?: OutboxItem): Promise<boolean> {
  return mutate(id, expected, (store, current) => { store.delete(current.id); });
}

export async function bumpAttempt(id: string, error: string | null, expected?: OutboxItem): Promise<boolean> {
  return mutate(id, expected, (store, current) => {
    store.put({ ...current, attempts: current.attempts + 1, lastError: error, revision: uuid(), supersedes: token(current) });
  });
}

async function mutate(id: string, expected: OutboxItem | undefined, change: (store: IDBObjectStore, current: OutboxItem) => void): Promise<boolean> {
  if (!expected || expected.id !== id) throw new OutboxStorageError("outbox-revision-required");
  // The caller may reuse/mutate its object while waiting for the lock.
  expected = JSON.parse(JSON.stringify(expected)) as OutboxItem;
  const snapshot = expected;
  return coordinated(async (locked) => {
    const { fallback } = await readBoth(snapshot.userId);
    await recover(fallback, locked);
    const updated = await transaction("readwrite", (store, rows) => {
      const current = rows.find((row) => row.id === id && row.userId === snapshot.userId);
      if (!current || !same(current, snapshot)) return false;
      change(store, current);
      return true;
    });
    if (updated) changed();
    return updated;
  });
}

export async function stats(userId: string): Promise<{ pending: number; failed: number }> {
  const items = await peekAll(userId);
  return { pending: items.length, failed: items.filter((i) => i.attempts >= 3).length };
}
