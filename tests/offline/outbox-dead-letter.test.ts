import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { OutboxItem } from "../../src/lib/offline/outbox";
import type { DeadLetter } from "../../src/lib/offline/dead-letter";

const server = vi.hoisted(() => ({ userId: "u1", upsert: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: server.userId } } } }) },
  from: () => ({ upsert: server.upsert }),
  rpc: server.rpc,
} }));
vi.mock("@/lib/identity/owner", () => ({ getIdentityEpoch: () => 0 }));

const KEY = "irth.outbox.dead-letter.v1";
const PREFIX = `${KEY}:entry:`;
const FALLBACK = "irth.outbox.fallback.v1";
const item = (id: string, userId = "u1", revision?: string): OutboxItem => ({
  id, userId, kind: "game_complete", payload: { gameId: id, score: 1 },
  createdAt: 1, attempts: 0, ...(revision ? { revision } : {}),
});
const letter = (id: string, userId = "u1"): DeadLetter => ({
  id, userId, kind: "game_complete", payload: { gameId: id }, reason: "not_published",
  createdAt: 10, originalCreatedAt: 1, attempts: 0,
});
let values: Map<string, string>;
let storage: Storage;
let factory: IDBFactory;
function locks() {
  let tail: Promise<unknown> = Promise.resolve();
  return { request: (_name: string, _options: unknown, run: () => unknown) => {
    const next = tail.then(run); tail = next.catch(() => {}); return next;
  } };
}
// Separate queues per lock name: archive -> outbox lock nesting is intentional.
function lockService() {
  const services = new Map<string, ReturnType<typeof locks>>();
  return { request: (name: string, options: unknown, run: () => unknown) => {
    if (!services.has(name)) services.set(name, locks());
    return services.get(name)!.request(name, options, run);
  } };
}
beforeEach(() => {
  vi.resetModules();
  values = new Map(); factory = new IDBFactory();
  storage = {
    get length() { return values.size; },
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => values.clear()),
  };
  vi.stubGlobal("indexedDB", factory); vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", { locks: lockService() });
  server.userId = "u1";
  server.rpc.mockReset().mockResolvedValue({ data: { ok: false, reason: "investigation_not_found" }, error: null });
  server.upsert.mockReset().mockResolvedValue({ error: { message: "not_published" } });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const archiveKeys = () => [...values.keys()].filter((key) => key.startsWith(PREFIX));
async function api() {
  return {
    outbox: await import("../../src/lib/offline/outbox"),
    dead: await import("../../src/lib/offline/dead-letter"),
    flush: (await import("../../src/lib/offline/flush")).flushOutbox,
  };
}
function realm() {
  const cache = new Map<string, unknown>();
  function load(name: string): unknown {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(`src/lib/offline/${name}.ts`, "utf8");
    const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
    const exports = {}; cache.set(name, exports);
    runInNewContext(compiled, {
      exports, require: (path: string) => { if (path !== "./outbox") throw new Error("Unexpected dependency"); return load("outbox"); },
      indexedDB: factory, localStorage: storage, navigator, crypto: webcrypto,
    });
    return exports;
  }
  return load("dead-letter") as typeof import("../../src/lib/offline/dead-letter");
}
function abortNextWrite() {
  const original = IDBDatabase.prototype.transaction; let aborted = false;
  return vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args: Parameters<typeof original>) {
    const tx = original.apply(this, args);
    if (args[1] === "readwrite" && !aborted) { aborted = true; queueMicrotask(() => tx.abort()); }
    return tx;
  });
}

describe("Phase C: durable archive and account isolation", () => {
  it("writes one immutable entry per revision and treats retries as idempotent", async () => {
    const { dead } = await api();
    const receipt = await dead.recordDeadLetter(item("same", "u1", "r1"), "not_published");
    const retry = await dead.recordDeadLetter(item("same", "u1", "r1"), "not_published");
    expect(retry).toEqual(receipt);
    await dead.recordDeadLetter(item("same", "u1", "r2"), "not_published");
    expect(archiveKeys()).toHaveLength(2);
    expect(dead.listDeadLetters("u1").map((row) => row.revision).sort()).toEqual(["r1", "r2"]);
  });

  it("archives concurrent writes from two independent JavaScript realms without lost records", async () => {
    const one = realm(); const two = realm();
    expect(one.DeadLetterStorageError).not.toBe(two.DeadLetterStorageError);
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? one : two).recordDeadLetter(item(String(i)), "not_published")
    ));
    expect(archiveKeys()).toHaveLength(20);
    expect(one.listDeadLetters("u1")).toHaveLength(20);
    expect(two.listDeadLetters("u1")).toHaveLength(20);
  });

  it("deduplicates concurrent archival of the same snapshot from independent realms", async () => {
    const one = realm(); const two = realm();
    const receipts = await Promise.all([one.recordDeadLetter(item("same"), "not_published"), two.recordDeadLetter(item("same"), "not_published")]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(archiveKeys()).toHaveLength(1);
  });

  it("does not overwrite equal ids belonging to different accounts", async () => {
    const { dead } = await api();
    await Promise.all([dead.recordDeadLetter(item("shared", "u1"), "not_published"), dead.recordDeadLetter(item("shared", "u2"), "not_published")]);
    expect(archiveKeys()).toHaveLength(2);
    expect(dead.listDeadLetters("u1").map((row) => row.userId)).toEqual(["u1"]);
    expect(dead.listDeadLetters("u2").map((row) => row.userId)).toEqual(["u2"]);
    await dead.clearDeadLetters("u1");
    expect(dead.listDeadLetters("u1")).toEqual([]);
    expect(dead.listDeadLetters("u2")).toHaveLength(1);
  });

  it.each(["quota", "write-error"])("retains rejected outbox operations when archival fails with %s", async (failure) => {
    const { dead, outbox, flush } = await api();
    const queued = await outbox.enqueue("u1", "game_complete", { gameId: "g1" });
    vi.mocked(storage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX)) throw failure === "quota" ? new DOMException("full", "QuotaExceededError") : new Error("denied");
      values.set(key, value);
    });
    await expect(dead.recordDeadLetter(queued, "not_published")).rejects.toThrow();
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([queued]);
    expect(dead.listDeadLetters("u1")).toEqual([]);
  });

  it("refuses the 501st archive entry without trimming any existing record or dequeuing", async () => {
    const { dead, outbox, flush } = await api();
    values.set(KEY, JSON.stringify(Array.from({ length: 500 }, (_, i) => letter(String(i)))));
    const queued = await outbox.enqueue("u1", "game_complete", {});
    await expect(dead.recordDeadLetter(queued, "not_published")).rejects.toThrow("dead-letter-full");
    expect(dead.listDeadLetters("u1")).toHaveLength(500);
    expect(archiveKeys()).toHaveLength(500);
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([queued]);
    expect(new Set(dead.listDeadLetters("u1").map((row) => row.id)).size).toBe(500);
  });

  it("preserves oversized historical archives while refusing new additions", async () => {
    const { dead } = await api();
    values.set(KEY, JSON.stringify(Array.from({ length: 501 }, (_, i) => letter(String(i)))));
    await dead.migrateDeadLetters();
    expect(dead.listDeadLetters("u1")).toHaveLength(501);
    await expect(dead.recordDeadLetter(item("new"), "not_published")).rejects.toThrow("dead-letter-full");
    expect(dead.listDeadLetters("u1")).toHaveLength(501);
  });

  it("reads and migrates both owners' V17 records without requiring revisions", async () => {
    const { dead } = await api();
    const rows = [letter("shared"), letter("shared", "u2")];
    values.set(KEY, JSON.stringify(rows));
    expect(dead.listDeadLetters("u1")).toEqual([rows[0]]);
    expect(dead.listDeadLetters("u2")).toEqual([rows[1]]);
    await dead.migrateDeadLetters();
    expect(values.get(KEY)).toBe("[]");
    expect(archiveKeys()).toHaveLength(2);
    expect(dead.listDeadLetters("u1")).toEqual([rows[0]]);
    expect(dead.listDeadLetters("u2")).toEqual([rows[1]]);
  });

  it("recovers after a restart midway through legacy migration", async () => {
    const { dead } = await api();
    const rows = [letter("one"), letter("two")]; const original = JSON.stringify(rows);
    values.set(KEY, original); let writes = 0;
    vi.mocked(storage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX) && ++writes === 2) throw new Error("interrupted");
      values.set(key, value);
    });
    await expect(dead.migrateDeadLetters()).rejects.toThrow("interrupted");
    expect(values.get(KEY)).toBe(original);
    expect(archiveKeys()).toHaveLength(1);
    expect(dead.listDeadLetters("u1")).toHaveLength(2);
    vi.mocked(storage.setItem).mockImplementation((key, value) => { values.set(key, value); });
    vi.resetModules(); const restarted = (await api()).dead;
    await restarted.migrateDeadLetters();
    expect(archiveKeys()).toHaveLength(2);
    expect(values.get(KEY)).toBe("[]");
    expect(restarted.listDeadLetters("u1")).toEqual(rows);
  });

  it("keeps legacy data when cleanup fails after confirmed copies, without duplicate listing", async () => {
    const { dead } = await api(); const rows = [letter("one")];
    values.set(KEY, JSON.stringify(rows));
    vi.mocked(storage.setItem).mockImplementation((key, value) => {
      if (key === KEY) throw new Error("cleanup denied"); values.set(key, value);
    });
    await expect(dead.migrateDeadLetters()).rejects.toThrow("cleanup denied");
    expect(archiveKeys()).toHaveLength(1);
    expect(dead.listDeadLetters("u1")).toEqual(rows);
    expect(JSON.parse(values.get(KEY)!)).toEqual(rows);
  });

  it("does not remove a newly observed legacy snapshot during migration cleanup", async () => {
    const { dead } = await api(); const old = letter("old"); const inserted = letter("new", "u2");
    values.set(KEY, JSON.stringify([old])); let injected = false;
    vi.mocked(storage.setItem).mockImplementation((key, value) => {
      values.set(key, value);
      if (key.startsWith(PREFIX) && !injected) { injected = true; values.set(KEY, JSON.stringify([old, inserted])); }
    });
    await dead.migrateDeadLetters();
    expect(JSON.parse(values.get(KEY)!)).toEqual([inserted]);
    expect(dead.listDeadLetters("u1")).toEqual([old]);
    expect(dead.listDeadLetters("u2")).toEqual([inserted]);
  });

  it.each(["invalid-json", "invalid-row", "denied"])("never treats a %s archive read as empty or replaces it", async (failure) => {
    const { dead } = await api(); const original = failure === "invalid-json" ? "{" : failure === "invalid-row" ? "[{}]" : JSON.stringify([letter("old")]);
    values.set(KEY, original);
    if (failure === "denied") vi.mocked(storage.getItem).mockImplementation(() => { throw new Error("read denied"); });
    expect(() => dead.listDeadLetters("u1")).toThrow();
    await expect(dead.clearDeadLetters("u1")).rejects.toThrow();
    await expect(dead.recordDeadLetter(item("new"), "not_published")).rejects.toThrow();
    expect(values.get(KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("does not delete any archive entries after an incomplete per-entry read", async () => {
    const { dead } = await api();
    await dead.recordDeadLetter(item("one"), "not_published"); await dead.recordDeadLetter(item("two", "u2"), "not_published");
    const snapshot = [...values]; const bad = archiveKeys()[1];
    vi.mocked(storage.getItem).mockImplementation((key) => { if (key === bad) throw new Error("read denied"); return values.get(key) ?? null; });
    await expect(dead.clearDeadLetters("u1")).rejects.toThrow("read denied");
    expect([...values]).toEqual(snapshot); expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("reports a failed clear instead of claiming success, preserving the other owner", async () => {
    const { dead } = await api();
    await dead.recordDeadLetter(item("one"), "not_published"); await dead.recordDeadLetter(item("two", "u2"), "not_published");
    vi.mocked(storage.removeItem).mockImplementation(() => { throw new Error("clear denied"); });
    await expect(dead.clearDeadLetters("u1")).rejects.toThrow("clear denied");
    expect(dead.listDeadLetters("u1")).toHaveLength(1); expect(dead.listDeadLetters("u2")).toHaveLength(1);
  });

  it("fails safely without Web Locks, retaining the permanently rejected revision", async () => {
    const { dead, outbox, flush } = await api(); const queued = await outbox.enqueue("u1", "game_complete", {});
    vi.stubGlobal("navigator", {});
    await expect(dead.recordDeadLetter(queued, "not_published")).rejects.toThrow("requires-web-locks");
    await expect(dead.clearDeadLetters("u1")).rejects.toThrow("requires-web-locks");
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([queued]); expect(archiveKeys()).toEqual([]);
  });

  it("survives interruption after archival but before dequeue, then resumes idempotently after restart", async () => {
    const first = await api(); const queued = await first.outbox.enqueue("u1", "game_complete", {});
    const spy = abortNextWrite();
    expect(await first.flush("u1")).toEqual({ flushed: 0, failed: 1 }); spy.mockRestore();
    expect(first.dead.listDeadLetters("u1")).toHaveLength(1);
    expect(await first.outbox.peekAll("u1")).toEqual([queued]);
    vi.resetModules(); const second = await api();
    expect(await second.flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await second.outbox.peekAll("u1")).toEqual([]);
    expect(second.dead.listDeadLetters("u1")).toHaveLength(1); expect(archiveKeys()).toHaveLength(1);
  });

  it("does not remove a newer revision when a permanent rejection arrives late", async () => {
    const { outbox, dead, flush } = await api();
    const old = await outbox.enqueueWithId("u1", "shared", "game_complete", { score: 1 });
    let start!: () => void; const started = new Promise<void>((resolve) => { start = resolve; });
    let finish!: (value: { error: { message: string } }) => void;
    server.upsert.mockImplementationOnce(() => { start(); return new Promise((resolve) => { finish = resolve; }); });
    const pending = flush("u1"); await started;
    const latest = await outbox.enqueueWithId("u1", "shared", "game_complete", { score: 2 });
    finish({ error: { message: "not_published" } });
    expect(await pending).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([latest]);
    expect(dead.listDeadLetters("u1").map((row) => row.revision)).toEqual([old.revision]);
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([]);
    expect(dead.listDeadLetters("u1")).toHaveLength(2);
  });

  it("holds the archive lock until conditional dequeue completes, excluding clear", async () => {
    const { dead, outbox } = await api(); const queued = await outbox.enqueue("u1", "game_complete", {});
    let start!: () => void; const started = new Promise<void>((resolve) => { start = resolve; });
    let finish!: (value: boolean) => void;
    vi.spyOn(outbox, "remove").mockImplementationOnce(() => { start(); return new Promise((resolve) => { finish = resolve; }); });
    const pending = dead.archiveRejected(queued, "not_published"); await started;
    const other = realm(); let cleared = false;
    const clearing = other.clearDeadLetters("u1").then(() => { cleared = true; });
    await Promise.resolve(); expect(cleared).toBe(false); expect(dead.listDeadLetters("u1")).toHaveLength(1);
    finish(true); await pending; await clearing;
    expect(cleared).toBe(true); expect(dead.listDeadLetters("u1")).toEqual([]);
  });

  it("does not stop unrelated queue operations when two accounts share a legacy id", async () => {
    const { outbox } = await api();
    const first = await outbox.enqueueWithId("u1", "shared", "game_complete", {});
    const other = await outbox.enqueueWithId("u2", "shared", "game_complete", { account: 2 });
    const unrelated = await outbox.enqueueWithId("u2", "unrelated", "game_complete", {});
    expect(await outbox.peekAll("u1")).toEqual([first]);
    expect(await outbox.peekAll("u2")).toEqual(expect.arrayContaining([other, unrelated]));
    expect(await outbox.bumpAttempt(other.id, "retry", other)).toBe(true);
    const current = (await outbox.peekAll("u2")).find((row) => row.id === other.id)!;
    expect(current.attempts).toBe(1); expect(await outbox.remove(other.id, other)).toBe(false);
    expect(await outbox.remove(unrelated.id, unrelated)).toBe(true);
    expect(await outbox.remove(current.id, current)).toBe(true);
    expect(await outbox.peekAll("u1")).toEqual([first]); expect(await outbox.peekAll("u2")).toEqual([]);
    expect(await outbox.remove(first.id, first)).toBe(true);
  });

  it("processes IDB operations without Web Locks even if another owner's colliding fallback is pending", async () => {
    const { outbox } = await api();
    const primary = await outbox.enqueueWithId("u1", "shared", "game_complete", {});
    const backup = await outbox.enqueueWithId("u2", "shared", "game_complete", {});
    vi.stubGlobal("navigator", {});
    expect(await outbox.remove(primary.id, primary)).toBe(true);
    expect(JSON.parse(values.get(FALLBACK)!)).toEqual([backup]);
    await expect(outbox.remove(backup.id, backup)).rejects.toThrow("requires-web-locks");
  });
  it("recovers two colliding fallback owners without a schema upgrade", async () => {
    const { outbox } = await api(); vi.stubGlobal("indexedDB", undefined);
    const one = await outbox.enqueueWithId("u1", "shared", "game_complete", {});
    const two = await outbox.enqueueWithId("u2", "shared", "game_complete", {});
    expect(JSON.parse(values.get(FALLBACK)!)).toEqual([one, two]);
    vi.stubGlobal("indexedDB", factory);
    expect(await outbox.peekAll("u1")).toEqual([one]);
    expect(await outbox.peekAll("u2")).toEqual([two]);
    expect(await outbox.remove(two.id, two)).toBe(true);
    expect(await outbox.peekAll("u1")).toEqual([one]);
    const open = factory.open("irth-offline-outbox");
    const db = await new Promise<globalThis.IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    expect(db.version).toBe(1);
    const tx = db.transaction("items"); expect(tx.objectStore("items").keyPath).toBe("id"); db.close();
  });

  it("continues other operations after a permanent archival failure", async () => {
    const { outbox, dead, flush } = await api();
    const rejected = await outbox.enqueueWithId("u1", "a", "game_complete", {});
    await outbox.enqueueWithId("u1", "b", "game_complete", {});
    server.upsert.mockResolvedValueOnce({ error: { message: "not_published" } }).mockResolvedValueOnce({ error: null });
    vi.mocked(storage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX)) throw new Error("quota"); values.set(key, value);
    });
    expect(await flush("u1")).toEqual({ flushed: 1, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([rejected]);
    expect(dead.listDeadLetters("u1")).toEqual([]);
    expect(server.upsert).toHaveBeenCalledTimes(2);
  });

  it("continues noncolliding IDB acknowledgements after a fallback acknowledgement fails without locks", async () => {
    const { outbox, flush } = await api();
    const otherOwner = await outbox.enqueueWithId("u1", "shared", "game_complete", {});
    const backup = await outbox.enqueueWithId("u2", "shared", "game_complete", {});
    await outbox.enqueueWithId("u2", "unrelated", "game_complete", {});
    vi.stubGlobal("navigator", {}); server.userId = "u2"; server.upsert.mockResolvedValue({ error: null });
    expect(await flush("u2")).toEqual({ flushed: 1, failed: 1 });
    expect(await outbox.peekAll("u2")).toEqual([backup]);
    expect(await outbox.peekAll("u1")).toEqual([otherOwner]);
  });

  it("serializes clear and archival across independent realms without replacing another account's records", async () => {
    const one = realm(); const two = realm();
    await one.recordDeadLetter(item("shared", "u2"), "not_published");
    await one.recordDeadLetter(item("old", "u1"), "not_published");
    await Promise.all([one.clearDeadLetters("u1"), two.recordDeadLetter(item("new", "u1"), "not_published")]);
    expect(one.listDeadLetters("u1").map((row) => row.id)).toEqual(["new"]);
    expect(two.listDeadLetters("u2").map((row) => row.id)).toEqual(["shared"]);
  });

  it("retains an operation when the archive write cannot be confirmed and recovers without duplicates", async () => {
    const { dead, outbox, flush } = await api(); const queued = await outbox.enqueue("u1", "game_complete", {});
    let justWritten: string | null = null;
    vi.mocked(storage.setItem).mockImplementation((key, value) => { values.set(key, value); if (key.startsWith(PREFIX)) justWritten = key; });
    vi.mocked(storage.getItem).mockImplementation((key) => {
      if (key === justWritten) { justWritten = null; throw new Error("confirmation failed"); }
      return values.get(key) ?? null;
    });
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([queued]); expect(archiveKeys()).toHaveLength(1);
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(await outbox.peekAll("u1")).toEqual([]); expect(dead.listDeadLetters("u1")).toHaveLength(1);
  });

  it("enforces the capacity boundary across independent archival contexts", async () => {
    values.set(KEY, JSON.stringify(Array.from({ length: 499 }, (_, i) => letter(String(i)))));
    const one = realm(); const two = realm();
    const results = await Promise.allSettled([
      one.recordDeadLetter(item("new-one"), "not_published"), two.recordDeadLetter(item("new-two"), "not_published"),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(one.listDeadLetters("u1")).toHaveLength(500);
    expect(one.listDeadLetters("u1").filter((row) => !row.id.startsWith("new-"))).toHaveLength(499);
  });

  it("does not dequeue if a storage backend silently fails to persist an archive write", async () => {
    const { outbox, flush } = await api(); const queued = await outbox.enqueue("u1", "game_complete", {});
    vi.mocked(storage.setItem).mockImplementation((key, value) => { if (!key.startsWith(PREFIX)) values.set(key, value); });
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(archiveKeys()).toEqual([]); expect(await outbox.peekAll("u1")).toEqual([queued]);
  });

  it("archives investigation_not_found before dequeue and never counts it as flushed", async () => {
    const { outbox, dead, flush } = await api();
    const queued = await outbox.enqueue("u1", "investigation_complete", { investigationId: "missing" });
    let confirmed = false;
    vi.mocked(storage.getItem).mockImplementation((key) => {
      const value = values.get(key) ?? null;
      if (key.startsWith(PREFIX) && value !== null) confirmed = true;
      return value;
    });
    const originalRemove = outbox.remove;
    const remove = vi.spyOn(outbox, "remove").mockImplementation((id, expected) => {
      expect(confirmed).toBe(true);
      expect(dead.listDeadLetters("u1")).toEqual([expect.objectContaining({ id: queued.id, revision: queued.revision, reason: "investigation_not_found" })]);
      return originalRemove(id, expected);
    });
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(remove).toHaveBeenCalledWith(queued.id, queued);
    expect(await outbox.peekAll("u1")).toEqual([]);
    expect(server.rpc).toHaveBeenCalledWith("complete_investigation_v2", expect.objectContaining({ p_investigation_id: "missing", p_delta_id: queued.id }));
    expect(dead.listDeadLetters("u1")).toHaveLength(1);
  });

  it.each(["write-failure", "full", "unconfirmed"])("retains investigation_not_found when archival is %s", async (failure) => {
    const { outbox, dead, flush } = await api();
    const queued = await outbox.enqueue("u1", "investigation_complete", { investigationId: "missing" });
    const remove = vi.spyOn(outbox, "remove");
    if (failure === "full") values.set(KEY, JSON.stringify(Array.from({ length: 500 }, (_, i) => letter(String(i)))));
    if (failure === "write-failure") vi.mocked(storage.setItem).mockImplementation((key, value) => {
      if (key.startsWith(PREFIX)) throw new DOMException("full", "QuotaExceededError");
      values.set(key, value);
    });
    if (failure === "unconfirmed") vi.mocked(storage.getItem).mockImplementation((key) => {
      const value = values.get(key) ?? null;
      if (key.startsWith(PREFIX) && value !== null) throw new Error("confirmation unavailable");
      return value;
    });
    expect(await flush("u1")).toEqual({ flushed: 0, failed: 1 });
    expect(remove).not.toHaveBeenCalled();
    expect(await outbox.peekAll("u1")).toEqual([queued]);
    if (failure !== "unconfirmed") expect(dead.listDeadLetters("u1")).toHaveLength(failure === "full" ? 500 : 0);
    else expect(archiveKeys()).toHaveLength(1);
  });

});
