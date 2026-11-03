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

import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "../identity/owner";
import { physicalKey } from "../identity/partition";

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

interface OutboxScope {
  store: Storage | undefined;
  fallbackKey: string;
  userId: string;
  partitioned: boolean;
  assertCurrent(): void;
}

/** Capture before the first await. Explicit physical keys never follow a new
 * owner; the epoch also rejects Alice -> Bob -> Alice while work was pending.
 * Keep V17's shared-key behavior in runtimes without the partition adapter.
 */
function captureScope(userId: string): OutboxScope {
  const store = typeof localStorage === "undefined" ? undefined : localStorage;
  const prototype = store && Object.getPrototypeOf(store) as { __originalGetItem?: Storage["getItem"] } | null;
  const partitioned = typeof prototype?.__originalGetItem === "function" && store?.getItem !== prototype.__originalGetItem;
  const owner = partitioned ? getActiveOwner() : null;
  const epoch = partitioned ? getIdentityEpoch() : null;
  const scope: OutboxScope = {
    store, userId, partitioned,
    fallbackKey: owner === null ? LS_FALLBACK : physicalKey(LS_FALLBACK, owner),
    assertCurrent() {
      if (owner !== null && (owner !== `user:${userId}` || getActiveOwner() !== owner || getIdentityEpoch() !== epoch)) {
        throw new OutboxStorageError("outbox-owner-changed-or-mismatched");
      }
    },
  };
  scope.assertCurrent();
  return scope;
}

class DatabaseError extends Error {}
class AccountCollision extends DatabaseError {}
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
async function transaction<T>(
  scope: OutboxScope,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, rows: OutboxItem[]) => T,
): Promise<T> {
  try {
    scope.assertCurrent();
    const db = await openDB();
    scope.assertCurrent();
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(STORE, mode);
      } catch (cause) {
        // A closed/invalid handle must be reopened on the next operation.
        dbPromise = null;
        reject(new DatabaseError("Outbox IDB transaction unavailable", { cause }));
        return;
      }
      let value: T;
      let actionError: unknown;
      const unsubscribe = scope.partitioned
        ? onOwnerChange(() => {
            try {
              scope.assertCurrent();
            } catch (error) {
              actionError = error;
              // Abort only an uncommitted transaction. If it already committed,
              // preserve its bytes and let oncomplete reject the stale receipt.
              try {
                tx.abort();
              } catch {
                /* already committed */
              }
            }
          })
        : () => {};
      tx.oncomplete = () => {
        unsubscribe();
        // A committed write is retained even if the owner changed before delivery
        // of this event. Never fall back or issue a success receipt in that case.
        try {
          scope.assertCurrent();
          resolve(value);
        } catch (error) {
          reject(error);
        }
      };
      tx.onabort = tx.onerror = () => {
        unsubscribe();
        reject(
          actionError ?? new DatabaseError("Outbox IDB transaction failed", { cause: tx.error }),
        );
      };
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          scope.assertCurrent();
          const rows = validateRows(request.result);
          value = action(store, rows);
          scope.assertCurrent();
        } catch (error) {
          actionError = error;
          try { tx.abort(); } catch { /* owner listener may already have aborted */ }
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

function lsReadAllOrThrow(scope: OutboxScope): OutboxItem[] {
  scope.assertCurrent();
  if (!scope.store) throw new OutboxStorageError("no-local-storage");
  const raw = scope.store.getItem(scope.fallbackKey);
  scope.assertCurrent();
  return raw === null ? [] : validateRows(JSON.parse(raw));
}

function lsWriteAll(scope: OutboxScope, items: OutboxItem[]): void {
  scope.assertCurrent();
  if (items.length > FALLBACK_CAPACITY) throw new OutboxStorageError("outbox-fallback-full");
  if (!scope.store) throw new OutboxStorageError("no-local-storage");
  scope.store.setItem(scope.fallbackKey, JSON.stringify(items));
  scope.assertCurrent();
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

async function coordinated<T>(scope: OutboxScope, action: (locked: boolean) => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const run = async (locked: boolean) => {
    scope.assertCurrent();
    const result = await action(locked);
    scope.assertCurrent();
    return result;
  };
  return locks ? locks.request(LS_FALLBACK, { mode: "exclusive" }, () => run(true)) : run(false);
}

function requireLock(locked: boolean): void {
  if (!locked) throw new OutboxStorageError("outbox-fallback-requires-web-locks");
}

function changed(): void {
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irth:outbox:changed")); } catch { /* observer only */ }
}

/** Copy -> commit -> remove only unchanged fallback rows. Caller holds the lock. */
async function recover(scope: OutboxScope, fallback: OutboxItem[], locked: boolean): Promise<OutboxItem[]> {
  scope.assertCurrent();
  // Never copy or clean a foreign V17 snapshot found in an own-account array.
  // Keep its snapshot in the original namespace; do not guess a migration.
  fallback = scope.partitioned ? fallback.filter((row) => row.userId === scope.userId) : fallback;
  // Without a cross-context lock, do not mutate the shared localStorage array.
  if (fallback.length && !locked) return transaction(scope, "readonly", (_store, stored) => merge([...stored, ...fallback]));
  let copied: OutboxItem[] = [];
  const rows = await transaction(scope, fallback.length ? "readwrite" : "readonly", (store, stored) => {
    const merged = merge([...stored, ...fallback]);
    // Keep v1's id key and all original idempotency keys. One owner per IDB key;
    // other owners stay durably in fallback, without blocking unrelated rows.
    const owners = new Map(stored.map((row) => [row.id, row.userId]));
    for (const row of fallback) if (!owners.has(row.id)) owners.set(row.id, row.userId);
    copied = fallback.filter((row) => owners.get(row.id) === row.userId);
    for (const source of copied) {
      const latest = merged.find((row) => identity(row) === identity(source))!;
      store.put(latest);
    }
    return merged;
  });
  if (copied.length) {
    const current = lsReadAllOrThrow(scope);
    const remaining = current.filter((row) => !copied.some((source) => same(source, row)));
    lsWriteAll(scope, remaining);
    const retained = current.filter((row) => scope.partitioned && row.userId !== scope.userId).concat(fallback.filter((row) => !copied.includes(row)));
    if (remaining.some((row) => !retained.some((source) => same(source, row)))) {
      throw new OutboxStorageError("outbox-fallback-changed-during-recovery");
    }
  }
  return rows;
}

/** Both stores are required for a complete observation, even after one fails. */
async function readBoth(scope: OutboxScope): Promise<{ fallback: OutboxItem[]; stored: OutboxItem[] }> {
  const [ls, idb] = await Promise.allSettled([
    Promise.resolve().then(() => lsReadAllOrThrow(scope)),
    transaction(scope, "readonly", (_store, rows) => rows),
  ]);
  scope.assertCurrent();
  const userId = scope.userId;
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
  const scope = captureScope(userId);
  let frozenPayload: Record<string, unknown>;
  try {
    frozenPayload = JSON.parse(JSON.stringify(payload));
    if (!frozenPayload || typeof frozenPayload !== "object" || Array.isArray(frozenPayload)) throw new Error("invalid-payload");
  } catch (cause) { throw new OutboxStorageError("Outbox persistence failed", { cause }); }
  return coordinated(scope, async (locked) => {
    try {
      const fallback = lsReadAllOrThrow(scope);
      if (fallback.length) requireLock(locked);
      let base: OutboxItem | undefined;
      try {
        const recovered = await recover(scope, fallback, locked);
        base = recovered.find((row) => row.id === id && row.userId === userId);
        const saved = await transaction(scope, "readwrite", (store, rows) => {
          if (rows.some((row) => row.id === id && row.userId !== userId)) throw new AccountCollision("outbox-account-id-collision");
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
        const current = lsReadAllOrThrow(scope);
        const pending = current.find((row) => row.id === id && row.userId === userId);
        const previous = pending ?? base;
        const anchor = pending?.recoveryBase ?? (previous ? token(previous) : undefined);
        const item = makeItem(previous, anchor);
        lsWriteAll(scope, [...current.filter((row) => row.id !== id || row.userId !== userId), item]);
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
  const scope = captureScope(userId);
  return coordinated(scope, async (locked) => {
    const { fallback, stored } = await readBoth(scope);
    const items = locked ? await recover(scope, fallback, true) : merge([...stored, ...fallback]);
    scope.assertCurrent();
    return items.filter((row) => row.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
  });
}

export async function countAll(userId: string): Promise<number> { return (await peekAll(userId)).length; }

/** Legacy id-only acknowledgements fail closed; a stale caller cannot delete a new write. */
export async function remove(id: string, expected?: OutboxItem): Promise<boolean> {
  return mutate(id, expected, () => null);
}

export async function bumpAttempt(id: string, error: string | null, expected?: OutboxItem): Promise<boolean> {
  return mutate(id, expected, (current) => ({
    ...current, attempts: current.attempts + 1, lastError: error, revision: uuid(), supersedes: token(current),
  }));
}

async function mutate(id: string, expected: OutboxItem | undefined, change: (current: OutboxItem) => OutboxItem | null): Promise<boolean> {
  if (!expected || expected.id !== id) throw new OutboxStorageError("outbox-revision-required");
  const scope = captureScope(expected.userId);
  const snapshot = JSON.parse(JSON.stringify(expected)) as OutboxItem;
  return coordinated(scope, async (locked) => {
    const { fallback } = await readBoth(scope);
    if (fallback.some((row) => identity(row) === identity(snapshot))) requireLock(locked);
    const recovered = await recover(scope, fallback, locked);
    const latest = recovered.find((row) => identity(row) === identity(snapshot));
    if (!latest || !same(latest, snapshot)) return false;
    const result = await transaction(scope, "readwrite", (store, rows) => {
      const current = rows.find((row) => row.id === id && row.userId === snapshot.userId);
      if (!current) return "fallback";
      if (!same(current, snapshot)) return "stale";
      const next = change(current);
      if (next) store.put(next); else store.delete(current.id);
      return "updated";
    });
    if (result === "stale") return false;
    if (result === "fallback") {
      requireLock(locked);
      const current = lsReadAllOrThrow(scope);
      const row = current.find((row) => identity(row) === identity(snapshot));
      if (!row || !same(row, snapshot)) return false;
      const next = change(row);
      lsWriteAll(scope, current.flatMap((candidate) => candidate === row ? (next ? [next] : []) : [candidate]));
    }
    changed();
    return true;
  });
}

export async function stats(userId: string): Promise<{ pending: number; failed: number }> {
  const items = await peekAll(userId);
  return { pending: items.length, failed: items.filter((i) => i.attempts >= 3).length };
}
