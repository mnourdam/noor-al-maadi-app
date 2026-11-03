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
function switchOnRead() {
  const get = Storage.prototype.getItem;
  let armed = true;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, k) {
    const value = get.call(this, k);
    if (armed && k === key()) {
      armed = false;
      switchTo("bob");
    }
    return value;
  });
}
function switchOnTransaction(mode: IDBTransactionMode, phase: "read" | "complete", skip = 0) {
  const transact = IDBDatabase.prototype.transaction;
  let armed = true;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
    this: IDBDatabase,
    ...args: Parameters<typeof transact>
  ) {
    const tx = transact.apply(this, args);
    if (armed && args[1] === mode && skip-- <= 0) {
      armed = false;
      if (phase === "complete") tx.addEventListener("complete", () => switchTo("bob"));
      else {
        const getAll = IDBObjectStore.prototype.getAll;
        const spy = vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (
          this: IDBObjectStore,
          ...params: Parameters<typeof getAll>
        ) {
          const request = getAll.apply(this, params);
          spy.mockRestore();
          request.addEventListener("success", () => switchTo("bob"));
          return request;
        });
      }
    }
    return tx;
  });
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
  connections.forEach((db) => db.close());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreStorage();
});

describe("E-FIX-02 acceptance: Outbox identity namespace fencing", () => {
  it.each(["enqueue", "enqueueWithId"] as const)(
    "rejects %s waiting for a lock across an account switch and IDB outage",
    async (method) => {
      const outbox = await api();
      const release = pauseLock();
      vi.stubGlobal("indexedDB", undefined);
      const writing =
        method === "enqueue"
          ? outbox.enqueue("alice", "story_progress", {})
          : outbox.enqueueWithId("alice", "new", "story_progress", {});
      const rejected = expect(writing).rejects.toThrow("owner");
      switchTo("bob");
      release();
      await rejected;
      expect(raw()).toBeNull();
      expect(raw("bob")).toBeNull();
      switchTo("alice");
      vi.stubGlobal("indexedDB", factory);
      expect(await outbox.peekAll("alice")).toEqual([]);
    },
  );
  it("rejects Alice -> Bob -> Alice while waiting, even though the final owner matches", async () => {
    const outbox = await api();
    const release = pauseLock();
    const pending = outbox.enqueueWithId("alice", "x", "story_progress", {});
    const rejected = expect(pending).rejects.toThrow("owner");
    switchTo("bob");
    switchTo("alice");
    release();
    await rejected;
    expect(await outbox.peekAll("alice")).toEqual([]);
  });
  it("rejects during asynchronous IDB open before creating a write", async () => {
    const outbox = await api();
    const open = IDBFactory.prototype.open.bind(factory);
    vi.spyOn(factory, "open").mockImplementation((...args) => {
      const req = open(...args);
      req.addEventListener(
        "success",
        () => {
          connections.push(req.result);
          switchTo("bob");
        },
        { once: true },
      );
      return req;
    });
    await expect(outbox.enqueueWithId("alice", "x", "story_progress", {})).rejects.toThrow();
    expect(await persisted()).toEqual([]);
    expect(raw("bob")).toBeNull();
  });
  it("rejects a fallback update after reading when the identity changes", async () => {
    const outbox = await api();
    seed([legacy("old")]);
    seed([legacy("bob", "bob")], "bob");
    const before = raw();
    const bob = raw("bob");
    vi.stubGlobal("indexedDB", undefined);
    switchOnRead();
    await expect(outbox.enqueueWithId("alice", "new", "story_progress", {})).rejects.toThrow();
    expect(raw()).toBe(before);
    expect(raw("bob")).toBe(bob);
  });
  it("aborts recovery before writes if identity changes while IDB reads are pending", async () => {
    const outbox = await api();
    const old = legacy("old");
    seed([old]);
    switchOnTransaction("readwrite", "read");
    await expect(outbox.peekAll("alice")).rejects.toThrow("owner");
    expect(rows()).toEqual([old]);
    expect(await persisted()).toEqual([]);
    expect(raw("bob")).toBeNull();
    switchTo("alice");
    expect(await outbox.peekAll("alice")).toEqual([old]);
  });
  it("preserves committed recovery and fallback if owner changes after copy but before cleanup", async () => {
    const outbox = await api();
    const old = legacy("old");
    seed([old]);
    seed([legacy("bob", "bob")], "bob");
    const bob = raw("bob");
    switchOnTransaction("readwrite", "complete");
    await expect(outbox.peekAll("alice")).rejects.toThrow("owner");
    expect(await persisted()).toEqual([old]);
    expect(rows()).toEqual([old]);
    expect(raw("bob")).toBe(bob);
    const after = await restart();
    expect(await after.peekAll("alice")).toEqual([old]);
    expect(rows()).toEqual([]);
    switchTo("bob");
    expect(await after.peekAll("bob")).toEqual([legacy("bob", "bob")]);
  });
  it("retains a committed enqueue without issuing a receipt after the owner switches", async () => {
    const outbox = await api();
    switchOnTransaction("readwrite", "complete");
    await expect(
      outbox.enqueueWithId("alice", "saved", "story_progress", { scene: 3 }),
    ).rejects.toThrow();
    expect(await outbox.peekAll("bob")).toEqual([]);
    const after = await restart();
    expect(await after.peekAll("alice")).toEqual([
      expect.objectContaining({ id: "saved", payload: { scene: 3 } }),
    ]);
  });
  it.each(["remove", "bumpAttempt", "peekAll"] as const)(
    "fences %s across lock wait without touching either account",
    async (method) => {
      const outbox = await api();
      const a = await outbox.enqueueWithId("alice", "a", "story_progress", {});
      switchTo("bob");
      const b = await outbox.enqueueWithId("bob", "b", "story_progress", {});
      switchTo("alice");
      const release = pauseLock();
      const pending =
        method === "remove"
          ? outbox.remove(a.id, a)
          : method === "bumpAttempt"
            ? outbox.bumpAttempt(a.id, "retry", a)
            : outbox.peekAll("alice");
      const rejected = expect(pending).rejects.toThrow("owner");
      switchTo("bob");
      release();
      await rejected;
      expect(await outbox.peekAll("bob")).toEqual([b]);
      switchTo("alice");
      expect(await outbox.peekAll("alice")).toEqual([a]);
    },
  );
  it.each(["remove", "bumpAttempt"] as const)(
    "fences %s before its conditional IDB write",
    async (method) => {
      const outbox = await api();
      const a = await outbox.enqueueWithId("alice", "a", "story_progress", {});
      switchOnTransaction("readwrite", "read");
      await expect(
        method === "remove" ? outbox.remove(a.id, a) : outbox.bumpAttempt(a.id, "retry", a),
      ).rejects.toThrow("owner");
      switchTo("alice");
      expect(await outbox.peekAll("alice")).toEqual([a]);
    },
  );
  it.each(["peekAll", "enqueue", "remove", "bumpAttempt"] as const)(
    "rejects foreign-owner %s at entry",
    async (method) => {
      const outbox = await api();
      const a = await outbox.enqueueWithId("alice", "a", "story_progress", {});
      switchTo("bob");
      const pending =
        method === "peekAll"
          ? outbox.peekAll("alice")
          : method === "enqueue"
            ? outbox.enqueueWithId("alice", "x", "story_progress", {})
            : method === "remove"
              ? outbox.remove(a.id, a)
              : outbox.bumpAttempt(a.id, "retry", a);
      await expect(pending).rejects.toThrow("owner");
      expect(await outbox.peekAll("bob")).toEqual([]);
      switchTo("alice");
      expect(await outbox.peekAll("alice")).toEqual([a]);
    },
  );
  it("supports both accounts and colliding V17 ids across restart without moving foreign legacy rows", async () => {
    const outbox = await api();
    const a = legacy("same");
    const foreign = legacy("foreign", "bob");
    seed([a, foreign]);
    expect(await outbox.peekAll("alice")).toEqual([a]);
    expect(rows()).toEqual([foreign]);
    switchTo("bob");
    vi.stubGlobal("indexedDB", undefined);
    // Cached DB remains available: id collision falls back under Bob's physical key.
    const b = await outbox.enqueueWithId("bob", "same", "story_progress", { scene: 9 });
    expect(rows("bob")).toEqual([b]);
    vi.stubGlobal("indexedDB", factory);
    const after = await restart("bob");
    expect(await after.peekAll("bob")).toEqual([b]);
    switchTo("alice");
    expect(await after.peekAll("alice")).toEqual([a]);
    expect(rows()).toEqual([foreign]);
    expect(await after.remove(a.id, a)).toBe(true);
    switchTo("bob");
    expect(await after.peekAll("bob")).toEqual([b]);
  });
  it("keeps V17 fallback read-only without Web Locks and fences IDB reads", async () => {
    const outbox = await api();
    const a = legacy("old");
    seed([a]);
    vi.stubGlobal("navigator", {});
    expect(await outbox.peekAll("alice")).toEqual([a]);
    expect(rows()).toEqual([a]);
    switchOnTransaction("readonly", "read");
    await expect(outbox.peekAll("alice")).rejects.toThrow("owner");
    expect(rows()).toEqual([a]);
    expect(raw("bob")).toBeNull();
  });
  it("does not fall back after IDB failure coincides with an identity switch", async () => {
    const outbox = await api();
    const transact = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      ...args: Parameters<typeof transact>
    ) {
      const tx = transact.apply(this, args);
      queueMicrotask(() => {
        switchTo("bob");
        tx.abort();
      });
      return tx;
    });
    await expect(outbox.enqueueWithId("alice", "x", "story_progress", {})).rejects.toThrow();
    expect(raw()).toBeNull();
    expect(raw("bob")).toBeNull();
  });
  it("does not return partial Alice data from readBoth after an identity change and IDB failure", async () => {
    const outbox = await api();
    seed([legacy("old")]);
    vi.stubGlobal("indexedDB", undefined);
    switchOnRead();
    const error = await outbox.peekAll("alice").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(outbox.OutboxStorageError);
    expect(error).not.toBeInstanceOf(outbox.OutboxReadError);
    expect(rows()).toEqual([legacy("old")]);
  });
  it("preserves a newer revision against old remove and bump after switching back", async () => {
    const outbox = await api();
    const old = await outbox.enqueueWithId("alice", "same", "story_progress", { scene: 1 });
    switchTo("bob");
    await outbox.enqueueWithId("bob", "b", "story_progress", {});
    switchTo("alice");
    const latest = await outbox.enqueueWithId("alice", "same", "story_progress", { scene: 9 });
    expect(await outbox.remove(old.id, old)).toBe(false);
    expect(await outbox.bumpAttempt(old.id, "late", old)).toBe(false);
    expect(await outbox.peekAll("alice")).toEqual([latest]);
  });
  it("keeps E-FIX-01 archival working for both accounts and revisionless V17 rows", async () => {
    const outbox = await api();
    const dead = await import("@/lib/offline/dead-letter");
    const a = legacy("old");
    seed([a]);
    expect(await dead.archiveRejected(a, "story_not_found")).toBe(true);
    switchTo("bob");
    const b = await outbox.enqueueWithId("bob", "b", "story_progress", {});
    expect(await dead.archiveRejected(b, "story_not_found")).toBe(true);
    expect(dead.listDeadLetters("bob")).toHaveLength(1);
    switchTo("alice");
    expect(dead.listDeadLetters("alice")).toHaveLength(1);
    expect(await outbox.peekAll("alice")).toEqual([]);
  });
  it("does not report gameplay success or send Alice RPC when enqueue is fenced", async () => {
    const gameplay = await import("@/lib/offline/gameplay-write");
    const release = pauseLock();
    const saving = gameplay.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: {},
      rpc: server.rpc,
    });
    switchTo("bob");
    release();
    const result = await saving;
    expect(gameplay.saveAccepted(result)).toBe(false);
    expect(result).toMatchObject({
      acknowledged: false,
      queued: false,
      reason: "identity_changed",
    });
    expect(server.rpc).not.toHaveBeenCalled();
    expect(raw("bob")).toBeNull();
  });
  it("keeps a fallback write committed before switching and never issues a success receipt", async () => {
    const outbox = await api();
    vi.stubGlobal("indexedDB", undefined);
    const set = Storage.prototype.setItem;
    let armed = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, value) {
      set.call(this, k, value);
      if (armed && k === key()) {
        armed = false;
        switchTo("bob");
      }
    });
    await expect(
      outbox.enqueueWithId("alice", "saved", "story_progress", { scene: 4 }),
    ).rejects.toThrow();
    expect(rows()).toEqual([
      expect.objectContaining({ id: "saved", userId: "alice", payload: { scene: 4 } }),
    ]);
    expect(raw("bob")).toBeNull();
    vi.stubGlobal("indexedDB", factory);
    const after = await restart();
    expect(await after.peekAll("alice")).toEqual([expect.objectContaining({ id: "saved" })]);
  });
  it("retains the copied fallback when identity changes during its cleanup read", async () => {
    const outbox = await api();
    const a = legacy("old");
    seed([a]);
    seed([legacy("b", "bob")], "bob");
    const bob = raw("bob");
    const get = Storage.prototype.getItem;
    let reads = 0;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, k) {
      const value = get.call(this, k);
      if (k === key() && ++reads === 2) switchTo("bob");
      return value;
    });
    await expect(outbox.peekAll("alice")).rejects.toThrow("owner");
    expect(await persisted()).toEqual([a]);
    expect(rows()).toEqual([a]);
    expect(raw("bob")).toBe(bob);
    switchTo("alice");
    expect(await outbox.peekAll("alice")).toEqual([a]);
    expect(rows()).toEqual([]);
  });
  it("aborts queued writes if identity changes after put succeeds but before transaction commit", async () => {
    const outbox = await api();
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => switchTo("bob"), { once: true });
      return request;
    });
    await expect(
      outbox.enqueueWithId("alice", "uncommitted", "story_progress", {}),
    ).rejects.toThrow();
    expect(await persisted()).toEqual([]);
    expect(raw()).toBeNull();
    expect(raw("bob")).toBeNull();
  });
  it("fences enqueue during IDB reads without Web Locks", async () => {
    const outbox = await api();
    vi.stubGlobal("navigator", {});
    switchOnTransaction("readonly", "read");
    await expect(outbox.enqueueWithId("alice", "x", "story_progress", {})).rejects.toThrow();
    expect(await persisted()).toEqual([]);
    expect(raw("bob")).toBeNull();
  });
  it("retains the confirmed archive when identity changes while conditional dequeue waits", async () => {
    const outbox = await api();
    const dead = await import("@/lib/offline/dead-letter");
    const a = await outbox.enqueueWithId("alice", "a", "story_progress", {});
    let reached!: () => void;
    const waiting = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("navigator", {
      locks: {
        request: (name: string, _options: unknown, run: () => unknown) => {
          if (name === KEY) {
            reached();
            return gate.then(run);
          }
          return Promise.resolve().then(run);
        },
      },
    });
    const pending = dead.archiveRejected(a, "story_not_found");
    const rejected = expect(pending).rejects.toThrow("owner");
    await waiting;
    switchTo("bob");
    release();
    await rejected;
    vi.stubGlobal("navigator", { locks: locks() });
    expect(await outbox.peekAll("bob")).toEqual([]);
    switchTo("alice");
    expect(await outbox.peekAll("alice")).toEqual([a]);
    expect(dead.listDeadLetters("alice")).toHaveLength(1);
    expect(await dead.archiveRejected(a, "story_not_found")).toBe(true);
  });
});
