import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBDatabase, IDBObjectStore } from "fake-indexeddb";
import type { OutboxItem } from "@/lib/offline/outbox";

const server = vi.hoisted(() => ({ userId: "alice", rpc: vi.fn() }));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: server.userId } } }, error: null }),
    },
    rpc: server.rpc,
  },
}));
const KEY = "irth.outbox.fallback.v1";
const originals = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
let owner: typeof import("@/lib/identity/owner");
let partition: typeof import("@/lib/identity/partition");
let factory: IDBFactory;
let connections: IDBDatabase[];
function restoreStorage() {
  Object.assign(Storage.prototype, originals);
  for (const key of ["__originalGetItem", "__originalSetItem", "__originalRemoveItem"])
    delete (Storage.prototype as unknown as Record<string, unknown>)[key];
}
function locks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, _options: unknown, run: () => unknown) => {
      const next = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
}
function switchTo(userId: string) {
  server.userId = userId;
  owner.setActiveOwnerInternal(`user:${userId}`);
}
async function install(userId = "alice") {
  owner = await import("@/lib/identity/owner");
  switchTo(userId);
  partition = await import("@/lib/identity/partition");
  partition.installIdentityPartition();
}
const api = () => import("@/lib/offline/outbox");
const key = (userId = "alice") => partition.physicalKey(KEY, `user:${userId}`);
const raw = (userId = "alice") => originals.getItem.call(localStorage, key(userId));
const rows = (userId = "alice"): OutboxItem[] => JSON.parse(raw(userId) ?? "[]");
const legacy = (id: string, userId = "alice"): OutboxItem => ({
  id,
  userId,
  kind: "story_progress",
  payload: { scene: 1 },
  createdAt: 1,
  attempts: 0,
});
const seed = (items: OutboxItem[], userId = "alice") =>
  originals.setItem.call(localStorage, key(userId), JSON.stringify(items));
async function restart(userId = "alice") {
  connections.forEach((db) => db.close());
  connections = [];
  restoreStorage();
  vi.resetModules();
  await install(userId);
  return api();
}
function pauseLock() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("navigator", {
    locks: { request: (_name: string, _options: unknown, run: () => unknown) => gate.then(run) },
    onLine: true,
  });
  return () => {
    vi.stubGlobal("navigator", { locks: locks(), onLine: true });
    release();
  };
}
async function persisted(): Promise<OutboxItem[]> {
  const request = factory.open("irth-offline-outbox", 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const read = tx.objectStore("items").getAll();
      tx.oncomplete = () => resolve(read.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
beforeEach(async () => {
  vi.resetModules();
  restoreStorage();
  localStorage.clear();
  connections = [];
  factory = new IDBFactory();
  const open = factory.open.bind(factory);
  vi.spyOn(factory, "open").mockImplementation((...args) => {
    const req = open(...args);
    req.addEventListener("success", () => connections.push(req.result));
    return req;
  });
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("navigator", { locks: locks(), onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network forbidden");
    }),
  );
  server.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  await install();
});
afterEach(() => {
  vi.useRealTimers();
  connections.forEach((db) => db.close());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreStorage();
});

function realm() {
  const compiled = transpileModule(readFileSync("src/lib/offline/outbox.ts", "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    indexedDB: factory,
    localStorage,
    navigator,
    crypto: webcrypto,
    require: (name: string) => {
      if (name === "../identity/owner") return owner;
      if (name === "../identity/partition") return partition;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports as typeof import("@/lib/offline/outbox");
}
function pauseCompletion(mode: IDBTransactionMode, skip = 0) {
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const original = IDBDatabase.prototype.transaction;
  let intercepted = false;
  const spy = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<typeof original>
  ) {
    const tx = original.apply(this, args);
    if (!intercepted && args[1] === mode && skip-- <= 0) {
      intercepted = true;
      let callback: ((this: IDBTransaction, ev: Event) => unknown) | null;
      Object.defineProperty(tx, "oncomplete", {
        configurable: true,
        get: () => null,
        set: (fn) => {
          callback = fn;
        },
      });
      tx.addEventListener("complete", (event) => {
        release = () => callback?.call(tx, event);
        reached();
      });
    }
    return tx;
  });
  return { paused, resume: () => release(), restore: () => spy.mockRestore() };
}
function errorMessage(error: unknown): string {
  const e = error as { message?: string; cause?: unknown } | undefined;
  return e ? `${e.message} ${e.cause ? errorMessage(e.cause) : ""}` : "";
}
const gameplay = () => import("@/lib/offline/gameplay-write");

describe("E-FIX-03 acceptance: stale enqueue and unresolved deadlines", () => {
  it("keeps scene:9 after the real eight-second R4 timeout and resuming scene:1", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const outbox = await api();
    await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    const pause = pauseCompletion("readonly");
    const g = await gameplay();
    const saving = g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 1 },
      rpc: server.rpc,
    });
    await pause.paused;
    pause.restore();
    const outcome = await saving;
    expect(outcome).toMatchObject({
      acknowledged: false,
      queued: false,
      reason: "storage_pending",
      storageState: "unresolved",
    });
    expect(g.saveAccepted(outcome)).toBe(false);
    const other = realm();
    const fresh = await other.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    pause.resume();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await outbox.peekAll("alice")).toEqual([fresh]);
    expect(server.rpc).not.toHaveBeenCalled();
  }, 15000);

  it.each(["story_progress", "chapter_progress"] as const)(
    "CAS rejects delayed %s across two actual JS realms without Web Locks",
    async (kind) => {
      vi.stubGlobal("navigator", {});
      const a = realm();
      const b = realm();
      expect(a.OutboxStorageError).not.toBe(b.OutboxStorageError);
      await a.enqueueWithId("alice", "x", kind, { scene: 0 });
      const pause = pauseCompletion("readonly");
      const old = a.enqueueWithId("alice", "x", kind, { scene: 1 });
      const rejected = expect(old).rejects.toSatisfy((error: unknown) =>
        errorMessage(error).includes("outbox-stale-enqueue"),
      );
      await pause.paused;
      pause.restore();
      const latest = await b.enqueueWithId("alice", "x", kind, { scene: 9 });
      pause.resume();
      await rejected;
      expect(await a.peekAll("alice")).toEqual([latest]);
    },
  );

  it("serializes distinct same-id requests with Web Locks across separate realms", async () => {
    const a = realm();
    const b = realm();
    const [first, second] = await Promise.all([
      a.enqueueWithId("alice", "x", "story_progress", { scene: 1 }),
      b.enqueueWithId("alice", "x", "story_progress", { scene: 9 }),
    ]);
    expect(second.supersedes).toBe(first.revision);
    expect(await a.peekAll("alice")).toEqual([second]);
  });

  it("rejects one unknown-order simultaneous first insert without adopting its revision", async () => {
    vi.stubGlobal("navigator", {});
    const a = realm();
    const b = realm();
    const results = await Promise.allSettled([
      a.enqueueWithId("alice", "x", "story_progress", { scene: 1 }),
      b.enqueueWithId("alice", "x", "story_progress", { scene: 9 }),
    ]);
    const wins = results.filter((result) => result.status === "fulfilled");
    expect(wins).toHaveLength(1);
    const lose = results.find((result) => result.status === "rejected");
    expect(errorMessage(lose?.reason)).toContain("outbox-stale-enqueue");
    expect(await a.peekAll("alice")).toEqual([wins[0].value]);
  });

  it("keeps same-id retries fenced after timeout until the raw write settles", async () => {
    const g = await gameplay();
    const outbox = await api();
    const release = pauseLock();
    vi.useFakeTimers();
    const first = g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 1 },
      rpc: server.rpc,
    });
    await vi.advanceTimersByTimeAsync(8001);
    expect(await first).toMatchObject({ storageState: "unresolved" });
    const retry = await g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 9 },
      rpc: server.rpc,
    });
    expect(retry).toMatchObject({ queued: false, acknowledged: false, reason: "storage_pending" });
    expect(server.rpc).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(await outbox.peekAll("alice")).toEqual([]);
    const safe = await g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 9 },
      rpc: server.rpc,
    });
    expect(safe.acknowledged).toBe(true);
    expect(server.rpc).toHaveBeenCalledTimes(1);
  });

  it("reports unresolved after commit while preserving the committed row, then allows safe retry", async () => {
    const outbox = await api();
    const g = await gameplay();
    const pause = pauseCompletion("readwrite");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const saving = g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 1 },
      rpc: server.rpc,
    });
    await pause.paused;
    pause.restore();
    const committed = (await persisted())[0];
    expect(committed.payload).toEqual({ scene: 1 });
    await vi.advanceTimersByTimeAsync(8001);
    const result = await saving;
    expect(result).toMatchObject({
      acknowledged: false,
      queued: false,
      storageState: "unresolved",
    });
    expect(await persisted()).toEqual([committed]);
    pause.resume();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(await outbox.peekAll("alice")).toEqual([committed]);
    expect(server.rpc).not.toHaveBeenCalled();
  }, 15000);

  it("preserves fallback ancestry through IDB outage and recovery", async () => {
    const outbox = await api();
    vi.stubGlobal("indexedDB", undefined);
    const first = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
    const second = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    expect(second.supersedes).toBe(first.revision);
    expect(rows()).toEqual([second]);
    vi.stubGlobal("indexedDB", factory);
    expect(await outbox.peekAll("alice")).toEqual([second]);
    expect(rows()).toEqual([]);
  });

  it("rejects a changed fallback snapshot after waiting on failed IDB", async () => {
    const outbox = await api();
    const initial = legacy("x");
    seed([initial]);
    const original = IDBFactory.prototype.open.bind(factory);
    let fail!: () => void;
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    vi.spyOn(factory, "open").mockImplementation(() => {
      const request = { onerror: null as (() => void) | null, error: new Error("idb-failed") };
      fail = () => request.onerror?.();
      reached();
      return request as unknown as IDBOpenDBRequest;
    });
    const writing = outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
    const rejected = expect(writing).rejects.toSatisfy((error: unknown) =>
      errorMessage(error).includes("outbox-stale-enqueue"),
    );
    await paused;
    const newer = { ...initial, payload: { scene: 9 }, revision: "independent" };
    seed([newer]);
    fail();
    await rejected;
    expect(rows()).toEqual([newer]);
    vi.spyOn(factory, "open").mockImplementation(original);
  });

  it("does not overwrite an unrelated IDB/fallback conflict during recovery", async () => {
    const outbox = await api();
    const first = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    seed([{ ...first, payload: { scene: 1 }, revision: "unknown", supersedes: undefined }]);
    const before = raw();
    await expect(
      outbox.enqueueWithId("alice", "x", "story_progress", { scene: 2 }),
    ).rejects.toThrow();
    expect(await persisted()).toEqual([first]);
    expect(raw()).toBe(before);
  });

  it("CAS compares revisionless V17 snapshots and permits an unchanged-base retry", async () => {
    const outbox = await api();
    const initial = legacy("x");
    seed([initial]);
    expect(await outbox.peekAll("alice")).toEqual([initial]);
    vi.stubGlobal("navigator", {});
    const pause = pauseCompletion("readonly");
    const old = outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
    await pause.paused;
    pause.restore();
    pause.resume();
    const saved = await old;
    expect(saved.supersedes).toMatch(/^v17:/);
    expect(await outbox.peekAll("alice")).toEqual([saved]);
  });

  it.each(["ack", "rejection"])(
    "keeps newer revision on late %s after context restart",
    async (kind) => {
      const outbox = await api();
      const old = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
      const latest = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
      const after = await restart();
      const removed =
        kind === "ack"
          ? await after.remove(old.id, old)
          : await (
              await import("@/lib/offline/dead-letter")
            ).archiveRejected(old, "story_not_found");
      expect(removed).toBe(false);
      expect(await after.peekAll("alice")).toEqual([latest]);
    },
  );

  it("retains owner and epoch fencing during a stale-write race", async () => {
    const outbox = await api();
    vi.stubGlobal("navigator", {});
    const old = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    const pause = pauseCompletion("readonly");
    const writing = outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
    const rejected = expect(writing).rejects.toThrow();
    await pause.paused;
    pause.restore();
    switchTo("bob");
    const bob = await outbox.enqueueWithId("bob", "b", "story_progress", { scene: 9 });
    pause.resume();
    await rejected;
    expect(await outbox.peekAll("bob")).toEqual([bob]);
    switchTo("alice");
    expect(await outbox.peekAll("alice")).toEqual([old]);
  });

  it("does not send a stale RPC or expose rewards after CAS persistence fails", async () => {
    const outbox = await api();
    const g = await gameplay();
    vi.stubGlobal("navigator", { onLine: true });
    await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    const pause = pauseCompletion("readonly");
    const saving = g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 1 },
      rpc: server.rpc,
    });
    await pause.paused;
    pause.restore();
    const fresh = await realm().enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    pause.resume();
    const result = await saving;
    expect(result).toMatchObject({
      acknowledged: false,
      queued: false,
      reason: "storage_conflict",
    });
    expect(g.saveAccepted(result)).toBe(false);
    expect(server.rpc).not.toHaveBeenCalled();
    expect(await outbox.peekAll("alice")).toEqual([fresh]);
  });

  it("deduplicates identical inflight saves and uses the unchanged server operation id", async () => {
    const g = await gameplay();
    const release = pauseLock();
    const request = {
      userId: "alice",
      id: "stable-id",
      kind: "story_progress" as const,
      payload: { scene: 1 },
      rpc: server.rpc,
    };
    const one = g.saveGameplay(request);
    const two = g.saveGameplay(request);
    expect(one).toBe(two);
    release();
    expect((await one).acknowledged).toBe(true);
    expect((await two).acknowledged).toBe(true);
    expect(server.rpc).toHaveBeenCalledTimes(1);
  });
  it("aborts uncommitted enqueue on cancellation without falling back or replacing the base", async () => {
    const outbox = await api();
    const base = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    const cancellation = new AbortController();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => cancellation.abort(), { once: true });
      return request;
    });
    await expect(
      outbox.enqueueWithId(
        "alice",
        "x",
        "story_progress",
        { scene: 1 },
        { signal: cancellation.signal },
      ),
    ).rejects.toThrow();
    expect(await outbox.peekAll("alice")).toEqual([base]);
    expect(raw()).toBeNull();
  });
  it("does not resurrect a base removed by another context while the old read was paused", async () => {
    vi.stubGlobal("navigator", {});
    const a = realm();
    const b = realm();
    const base = await a.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    const pause = pauseCompletion("readonly");
    const old = a.enqueueWithId("alice", "x", "story_progress", { scene: 1 });
    const rejected = expect(old).rejects.toThrow();
    await pause.paused;
    pause.restore();
    expect(await b.remove(base.id, base)).toBe(true);
    pause.resume();
    await rejected;
    expect(await a.peekAll("alice")).toEqual([]);
  });
  it("fails closed on fallback mutation without a Web Lock", async () => {
    const outbox = await api();
    const base = legacy("old");
    seed([base]);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      outbox.enqueueWithId("alice", "x", "story_progress", { scene: 1 }),
    ).rejects.toThrow();
    expect(rows()).toEqual([base]);
  });
  it("does not send RPC on unknown ancestry even when the fake server would accept it", async () => {
    const outbox = await api();
    const g = await gameplay();
    const latest = await outbox.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    seed([{ ...latest, payload: { scene: 1 }, revision: "unrelated", supersedes: undefined }]);
    const result = await g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 2 },
      rpc: server.rpc,
    });
    expect(result).toMatchObject({
      acknowledged: false,
      queued: false,
      reason: "storage_conflict",
    });
    expect(server.rpc).not.toHaveBeenCalled();
    expect(await persisted()).toEqual([latest]);
    expect(rows()[0].revision).toBe("unrelated");
  });
});
