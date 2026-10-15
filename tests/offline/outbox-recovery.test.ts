import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { IDBFactory, IDBDatabase, IDBObjectStore } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { OutboxItem } from "../../src/lib/offline/outbox";

const server = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ upsert: server.upsert }),
  },
}));
vi.mock("@/lib/identity/owner", () => ({ getIdentityEpoch: () => 0 }));

const KEY = "irth.outbox.fallback.v1";
const legacy = (id: string, userId = "u1"): OutboxItem => ({ id, userId, kind: "game_complete", payload: { gameId: id }, createdAt: 1, attempts: 0 });
let values: Map<string, string>;
let storage: Storage;
let factory: IDBFactory;

// Shared lock service, not a module-local mutex. Independent imports share only
// browser-owned storage/locks, as separate tabs/workers do.
function locks() {
  let tail: Promise<unknown> = Promise.resolve();
  return { request: vi.fn((_name: string, _options: unknown, run: () => unknown) => {
    const next = tail.then(run);
    tail = next.catch(() => {});
    return next;
  }) };
}

beforeEach(() => {
  vi.resetModules();
  server.upsert.mockReset().mockResolvedValue({ error: null });
  values = new Map();
  storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0,
  };
  factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", { locks: locks() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function context() {
  vi.resetModules();
  return import("../../src/lib/offline/outbox");
}
const fallback = () => JSON.parse(values.get(KEY) ?? "[]") as OutboxItem[];
const seedFallback = (rows: OutboxItem[]) => values.set(KEY, JSON.stringify(rows));

async function dbRows() {
  const open = factory.open("irth-offline-outbox");
  const db = await new Promise<globalThis.IDBDatabase>((resolve, reject) => {
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<OutboxItem[]>((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const read = tx.objectStore("items").getAll();
      tx.oncomplete = () => resolve(read.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function abortNextWrite() {
  const original = IDBDatabase.prototype.transaction;
  let aborted = false;
  return vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof original>) {
    const tx = original.apply(this, args);
    if (args[1] === "readwrite" && !aborted) {
      aborted = true;
      queueMicrotask(() => tx.abort());
    }
    return tx;
  });
}

// Actual separate JS globals (including distinct Error/Object constructors).
// Only browser-owned services are shared. This catches module-local mutexes.
function realm(withLocks: boolean, withIDB: boolean) {
  const source = readFileSync("src/lib/offline/outbox.ts", "utf8");
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, indexedDB: withIDB ? factory : undefined, localStorage: storage,
    navigator: withLocks ? navigator : {}, crypto: webcrypto,
  });
  return exports as typeof import("../../src/lib/offline/outbox");
}

async function initialize() {
  const api = await context();
  const receipt = await api.enqueueWithId("u1", "initial", "game_complete", {});
  await api.remove(receipt.id, receipt);
  return api;
}

describe("Outbox recovery and independent contexts (phase B)", () => {
  it("merges V17 fallback and IDB rows when IDB recovers", async () => {
    const api = await initialize();
    const primary = await api.enqueueWithId("u1", "primary", "game_complete", {});
    const old = legacy("fallback");
    seedFallback([old]);
    expect(await api.peekAll("u1")).toEqual([old, primary]);
    expect(await dbRows()).toEqual(expect.arrayContaining([old, primary]));
    expect(fallback()).toEqual([]);
  });

  it("keeps a read-only union without Web Locks and leaves fallback untouched", async () => {
    const api = await initialize();
    const primary = await api.enqueueWithId("u1", "primary", "game_complete", {});
    seedFallback([legacy("backup")]);
    vi.stubGlobal("navigator", {});
    expect(await api.peekAll("u1")).toEqual([legacy("backup"), primary]);
    expect(fallback()).toEqual([legacy("backup")]);
  });

  it("never treats a failed IDB read as an empty queue", async () => {
    seedFallback([legacy("backup"), legacy("other-account", "u2")]);
    vi.stubGlobal("indexedDB", undefined);
    const api = await context();
    const error = await api.peekAll("u1").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(api.OutboxReadError);
    expect((error as InstanceType<typeof api.OutboxReadError>).partialItems).toEqual([legacy("backup")]);
    await expect(api.countAll("u1")).rejects.toThrow("Outbox read incomplete");
    expect(fallback()).toHaveLength(2);
    vi.stubGlobal("indexedDB", factory);
    expect(await api.peekAll("u1")).toEqual([legacy("backup")]);
  });

  it.each(["denied", "corrupt"])("exposes IDB partial data after a %s fallback read, without mutating either source", async (failure) => {
    const api = await initialize();
    const item = await api.enqueue("u1", "game_complete", {});
    if (failure === "denied") vi.mocked(storage.getItem).mockImplementation(() => { throw new Error("denied"); });
    else values.set(KEY, "{");
    const error = await api.peekAll("u1").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(api.OutboxReadError);
    expect((error as InstanceType<typeof api.OutboxReadError>).partialItems).toEqual([item]);
    await expect(api.remove(item.id, item)).rejects.toThrow("Outbox read incomplete");
    await expect(api.bumpAttempt(item.id, "retry", item)).rejects.toThrow("Outbox read incomplete");
    expect(await dbRows()).toEqual([item]);
  });

  it("preserves fallback when the migration transaction aborts, then recovers after restart", async () => {
    const api = await initialize();
    const row = legacy("survivor");
    seedFallback([row]);
    const spy = abortNextWrite();
    await expect(api.peekAll("u1")).rejects.toThrow();
    expect(fallback()).toEqual([row]);
    expect(await dbRows()).toEqual([]);
    spy.mockRestore();
    const restarted = await context();
    expect(await restarted.peekAll("u1")).toEqual([row]);
    expect(fallback()).toEqual([]);
  });

  it("retains both copies if execution stops after commit but before cleanup, and deduplicates after restart", async () => {
    const api = await initialize();
    const row = legacy("survivor");
    seedFallback([row]);
    vi.mocked(storage.setItem).mockImplementationOnce(() => { throw new Error("interrupted cleanup"); });
    await expect(api.peekAll("u1")).rejects.toThrow("interrupted cleanup");
    expect(fallback()).toEqual([row]);
    expect(await dbRows()).toEqual([row]);
    const restarted = await context();
    expect(await restarted.peekAll("u1")).toEqual([row]);
    expect(await dbRows()).toEqual([row]);
    expect(fallback()).toEqual([]);
  });

  it("cleans matching snapshots only, preserving a changed fallback row and new insert", async () => {
    const api = await initialize();
    const old = legacy("changed");
    const unchanged = legacy("unchanged");
    const newer = { ...old, payload: { newer: true }, revision: "new" };
    seedFallback([old, unchanged]);
    let reads = 0;
    vi.mocked(storage.getItem).mockImplementation((key) => {
      if (++reads === 2) seedFallback([newer, unchanged, legacy("inserted")]);
      return values.get(key) ?? null;
    });
    await expect(api.peekAll("u1")).rejects.toThrow("outbox-fallback-changed-during-recovery");
    expect(fallback()).toEqual([newer, legacy("inserted")]);
    expect(await dbRows()).toEqual(expect.arrayContaining([old, unchanged]));
  });

  it("does not discard either revision when ancestry is unknown", async () => {
    const api = await initialize();
    const old = await api.enqueueWithId("u1", "shared", "game_complete", { value: 1 });
    const conflicting = { ...old, revision: "independent", payload: { value: 2 } };
    seedFallback([conflicting]);
    await expect(api.peekAll("u1")).rejects.toThrow("outbox-revision-conflict");
    expect(fallback()).toEqual([conflicting]);
    expect(await dbRows()).toEqual([old]);
  });

  it("recognizes a known successor when a failed IDB write was stored in fallback", async () => {
    const api = await initialize();
    const old = await api.enqueueWithId("u1", "shared", "game_complete", { value: 1 });
    const spy = abortNextWrite();
    const newer = await api.enqueueWithId("u1", "shared", "game_complete", { value: 2 });
    expect(newer.supersedes).toBe(old.revision);
    expect(fallback()).toEqual([newer]);
    spy.mockRestore();
    expect(await api.peekAll("u1")).toEqual([newer]);
    expect(await dbRows()).toEqual([newer]);
    expect(fallback()).toEqual([]);
  });

  it("rejects id-only acknowledgements and ignores stale revisions from another context", async () => {
    const first = await initialize();
    const second = await context();
    const old = await first.enqueueWithId("u1", "shared", "game_complete", { value: 1 });
    const latest = await second.enqueueWithId("u1", "shared", "game_complete", { value: 2 });
    await expect(first.remove(old.id)).rejects.toThrow("outbox-revision-required");
    expect(await first.remove(old.id, old)).toBe(false);
    expect(await first.bumpAttempt(old.id, "old error", old)).toBe(false);
    expect(await first.peekAll("u1")).toEqual([latest]);
    expect(await second.remove(latest.id, latest)).toBe(true);
    expect(await first.peekAll("u1")).toEqual([]);
  });

  it("updates attempts only for the expected revision, and commits before resolving", async () => {
    const api = await initialize();
    const item = await api.enqueue("u1", "game_complete", {});
    expect(await api.bumpAttempt(item.id, "offline", item)).toBe(true);
    const [updated] = await api.peekAll("u1");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toBe("offline");
    expect(updated.revision).not.toBe(item.revision);
    expect(await api.remove(item.id, item)).toBe(false);
    expect(await dbRows()).toEqual([updated]);
  });

  it("conditionally acknowledges legacy rows without changing their storage keys", async () => {
    const api = await initialize();
    const row = legacy("v17");
    seedFallback([row]);
    expect(await api.remove(row.id, row)).toBe(true);
    expect(await dbRows()).toEqual([]);
    expect(fallback()).toEqual([]);
  });

  it("snapshots the payload before awaiting locks, and returns exactly what was stored", async () => {
    const api = await initialize();
    const payload = { nested: { value: 1 }, absent: undefined };
    const promise = api.enqueueWithId("u1", "frozen", "game_complete", payload);
    payload.nested.value = 99;
    const receipt = await promise;
    expect(receipt.payload).toEqual({ nested: { value: 1 } });
    expect(await dbRows()).toEqual([receipt]);
    (receipt.payload.nested as { value: number }).value = 42;
    expect((await dbRows())[0].payload).toEqual({ nested: { value: 1 } });
  });

  it("serializes fallback read/modify/write in two independent contexts", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const first = await context();
    const second = await context();
    expect(first).not.toBe(second);
    const receipts = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? first : second).enqueueWithId("u1", `row-${i}`, "game_complete", { i })
    ));
    expect(fallback()).toEqual(expect.arrayContaining(receipts));
    expect(fallback()).toHaveLength(20);
    expect(new Set(receipts.map((row) => row.revision)).size).toBe(20);
  });

  it("returns distinct exact receipts for serialized same-id writes in independent contexts", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const first = await context();
    const second = await context();
    const [one, two] = await Promise.all([
      first.enqueueWithId("u1", "shared", "game_complete", { v: 1 }),
      second.enqueueWithId("u1", "shared", "game_complete", { v: 2 }),
    ]);
    expect(one.revision).not.toBe(two.revision);
    expect(one.payload).toEqual({ v: 1 });
    expect(two.payload).toEqual({ v: 2 });
    expect(two.supersedes).toBe(one.revision);
    expect(fallback()).toEqual([two]);
  });

  it("fails both fallback writers safely when Web Locks and IDB are unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("navigator", {});
    seedFallback([legacy("untouched")]);
    const first = await context();
    const second = await context();
    const results = await Promise.allSettled([
      first.enqueueWithId("u1", "one", "game_complete", {}),
      second.enqueueWithId("u1", "two", "game_complete", {}),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(fallback()).toEqual([legacy("untouched")]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("uses atomic IDB revisions without Web Locks across independent contexts", async () => {
    const first = await initialize();
    const second = await context();
    vi.stubGlobal("navigator", {});
    const [one, two] = await Promise.all([
      first.enqueueWithId("u1", "shared", "game_complete", { v: 1 }),
      second.enqueueWithId("u1", "shared", "game_complete", { v: 2 }),
    ]);
    expect(one.revision).not.toBe(two.revision);
    expect(await dbRows()).toEqual([two]);
    expect(await first.remove(one.id, one)).toBe(false);
    expect(await second.bumpAttempt(two.id, "retry", two)).toBe(true);
    expect((await dbRows())[0].payload).toEqual(two.payload);
  });

  it("refuses unsafe fallback cleanup/acknowledgement without Web Locks", async () => {
    const api = await initialize();
    const row = legacy("backup");
    seedFallback([row]);
    vi.stubGlobal("navigator", {});
    await expect(api.remove(row.id, row)).rejects.toThrow("requires-web-locks");
    await expect(api.bumpAttempt(row.id, "retry", row)).rejects.toThrow("requires-web-locks");
    await expect(api.enqueue("u1", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    expect(fallback()).toEqual([row]);
    expect(await dbRows()).toEqual([]);
  });

  it("rejects legacy cross-account id collisions instead of overwriting either user", async () => {
    const api = await initialize();
    const first = await api.enqueueWithId("u1", "shared", "game_complete", {});
    seedFallback([legacy("shared", "u2")]);
    await expect(api.peekAll("u2")).rejects.toThrow("outbox-account-id-collision");
    await expect(api.enqueueWithId("u2", "shared", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    expect(await dbRows()).toEqual([first]);
    expect(fallback()).toEqual([legacy("shared", "u2")]);
    await expect(api.remove(first.id, { ...first, userId: "u2" })).rejects.toThrow("outbox-account-id-collision");
    expect(await dbRows()).toEqual([first]);
  });
  it("flush acknowledges the exact persisted revision using a mock server only", async () => {
    const api = await initialize();
    await api.enqueue("u1", "game_complete", { gameId: "g1", score: 1 });
    const { flushOutbox } = await import("../../src/lib/offline/flush");
    expect(await flushOutbox("u1")).toEqual({ flushed: 1, failed: 0 });
    expect(server.upsert).toHaveBeenCalledOnce();
    expect(await api.peekAll("u1")).toEqual([]);
  });

  it.each(["success", "retry"])("ignores a stale mock-server %s while a second context replaces the revision", async (outcome) => {
    const api = await initialize();
    const second = await context();
    await api.enqueueWithId("u1", "shared", "game_complete", { gameId: "g1", score: 1 });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    let finish!: (result: { error: { message: string } | null }) => void;
    server.upsert.mockImplementation(() => {
      signalStarted();
      return new Promise((resolve) => { finish = resolve; });
    });
    const { flushOutbox } = await import("../../src/lib/offline/flush");
    const pending = flushOutbox("u1");
    await started;
    const latest = await second.enqueueWithId("u1", "shared", "game_complete", { gameId: "g1", score: 9 });
    finish({ error: outcome === "retry" ? { message: "offline" } : null });
    expect(await pending).toEqual({ flushed: 0, failed: 1 });
    expect(await api.peekAll("u1")).toEqual([latest]);
  });

  it("does not flush a partial read or report a false empty success", async () => {
    const api = await initialize();
    await api.enqueue("u1", "game_complete", {});
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error("denied"); });
    const { flushOutbox } = await import("../../src/lib/offline/flush");
    await expect(flushOutbox("u1")).rejects.toThrow("Outbox read incomplete");
    expect(server.upsert).not.toHaveBeenCalled();
    expect(await dbRows()).toHaveLength(1);
  });

  it("coordinates fallback writes from two separate JavaScript realms", async () => {
    const first = realm(true, false);
    const second = realm(true, false);
    expect(first.OutboxStorageError).not.toBe(second.OutboxStorageError);
    const receipts = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? first : second).enqueueWithId("u1", `realm-${i}`, "game_complete", { i })
    ));
    expect(fallback()).toHaveLength(20);
    expect(fallback()).toEqual(expect.arrayContaining(receipts));
  });

  it("fails closed in both separate realms without Web Locks or IDB", async () => {
    const first = realm(false, false);
    const second = realm(false, false);
    seedFallback([legacy("preserved")]);
    const results = await Promise.allSettled([
      first.enqueue("u1", "game_complete", {}), second.enqueue("u1", "game_complete", {}),
    ]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(fallback()).toEqual([legacy("preserved")]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("serializes IDB compare/write across separate realms without Web Locks", async () => {
    await initialize();
    const first = realm(false, true);
    const second = realm(false, true);
    const [one, two] = await Promise.all([
      first.enqueueWithId("u1", "shared", "game_complete", { v: 1 }),
      second.enqueueWithId("u1", "shared", "game_complete", { v: 2 }),
    ]);
    expect(two.supersedes).toBe(one.revision);
    expect(await first.remove(one.id, one)).toBe(false);
    expect(await dbRows()).toEqual([two]);
    expect(await second.remove(two.id, two)).toBe(true);
  });

  it("waits for the read transaction to commit, not just getAll success", async () => {
    const api = await initialize();
    const primary = await api.enqueue("u1", "game_complete", {});
    seedFallback([legacy("backup")]);
    const original = IDBObjectStore.prototype.getAll;
    const spy = vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (this: IDBObjectStore) {
      const request = original.call(this);
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
      return request;
    });
    const error = await api.peekAll("u1").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(api.OutboxReadError);
    expect((error as InstanceType<typeof api.OutboxReadError>).partialItems).toEqual([legacy("backup")]);
    spy.mockRestore();
    expect(await dbRows()).toEqual([primary]);
    expect(fallback()).toEqual([legacy("backup")]);
  });

  it.each(["remove", "bumpAttempt"] as const)("does not acknowledge an aborted %s transaction", async (operation) => {
    const api = await initialize();
    const item = await api.enqueue("u1", "game_complete", {});
    const spy = abortNextWrite();
    const pending = operation === "remove" ? api.remove(item.id, item) : api.bumpAttempt(item.id, "retry", item);
    await expect(pending).rejects.toThrow("Outbox IDB transaction failed");
    spy.mockRestore();
    expect(await dbRows()).toEqual([item]);
    expect(fallback()).toEqual([]);
  });

  it("reopens a closed IDB handle instead of caching a permanent failure", async () => {
    const api = await initialize();
    const original = IDBDatabase.prototype.transaction;
    let closeNext = true;
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof original>) {
      if (closeNext) { closeNext = false; this.close(); }
      return original.apply(this, args);
    });
    const item = await api.enqueue("u1", "game_complete", {});
    expect(fallback()).toEqual([item]);
    spy.mockRestore();
    expect(await api.peekAll("u1")).toEqual([item]);
    expect(await dbRows()).toEqual([item]);
    expect(fallback()).toEqual([]);
  });

  it("recovers the latest of repeated fallback replacements during a prolonged outage", async () => {
    const api = await initialize();
    const original = await api.enqueueWithId("u1", "shared", "game_complete", { v: 0 });
    let spy = abortNextWrite();
    let latest = await api.enqueueWithId("u1", "shared", "game_complete", { v: 1 });
    spy.mockRestore();
    expect(latest.recoveryBase).toBe(original.revision);
    for (let v = 2; v <= 5; v++) {
      // Abort recovery as well as the next write, as during a sustained IDB failure.
      spy = abortNextWrite();
      latest = await api.enqueueWithId("u1", "shared", "game_complete", { v });
      spy.mockRestore();
      expect(latest.recoveryBase).toBe(original.revision);
    }
    expect(fallback()).toEqual([latest]);
    expect(await dbRows()).toEqual([original]);
    const restarted = await context();
    expect(await restarted.peekAll("u1")).toEqual([latest]);
    expect(await dbRows()).toEqual([latest]);
    expect(fallback()).toEqual([]);
    expect(await restarted.remove(original.id, original)).toBe(false);
  });

  it("captures an acknowledgement snapshot before awaiting a lock", async () => {
    const api = await initialize();
    const old = await api.enqueueWithId("u1", "shared", "game_complete", { v: 1 });
    const latest = await api.enqueueWithId("u1", "shared", "game_complete", { v: 2 });
    const pending = api.remove(old.id, old);
    Object.assign(old, latest);
    expect(await pending).toBe(false);
    expect(await dbRows()).toEqual([latest]);
  });

});
