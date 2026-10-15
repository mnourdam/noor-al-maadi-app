import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "irth.outbox.fallback.v1";
const row = (id: string) => ({ id, userId: "u1", kind: "game_complete", payload: { gameId: id }, createdAt: 1, attempts: 0 });
let saved: Map<string, string>;
let storage: Storage;

beforeEach(() => {
  vi.resetModules();
  saved = new Map();
  storage = {
    getItem: vi.fn((key: string) => saved.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }),
    removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0,
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("indexedDB", undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const api = () => import("../../src/lib/offline/outbox");

// Controlled IDB transactions: request success alone must never acknowledge a write.
function database() {
  const tx = { objectStore: () => ({ put: vi.fn() }), oncomplete: null, onerror: null, onabort: null, error: null } as unknown as IDBTransaction;
  const request = {} as IDBOpenDBRequest;
  const open = vi.fn(() => {
    queueMicrotask(() => {
      Object.defineProperty(request, "result", { value: { transaction: () => tx } });
      request.onsuccess?.({} as Event);
    });
    return request;
  });
  vi.stubGlobal("indexedDB", { open });
  return { tx, open };
}

async function waitForPut() { await new Promise((resolve) => setTimeout(resolve, 0)); }

describe("Outbox storage durability (phase A)", () => {
  it("persists the returned item before reporting fallback success", async () => {
    const item = await (await api()).enqueue("u1", "game_complete", { gameId: "g1" });
    expect(JSON.parse(saved.get(KEY)!)).toEqual([item]);
  });

  it.each(["missing", "quota", "serialization"])("rejects %s storage failure without a success notification", async (failure) => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    if (failure === "missing") vi.stubGlobal("localStorage", undefined);
    if (failure === "quota") vi.mocked(storage.setItem).mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    const payload: Record<string, unknown> = {};
    if (failure === "serialization") payload.self = payload;
    const { enqueue, OutboxStorageError } = await api();
    await expect(enqueue("u1", "game_complete", payload)).rejects.toBeInstanceOf(OutboxStorageError);
    expect(dispatch).not.toHaveBeenCalled();
    expect(saved.has(KEY)).toBe(false);
  });

  it.each(["read-error", "invalid-json", "invalid-shape", "invalid-row"])("preserves existing data on %s", async (failure) => {
    const original = failure === "invalid-json" ? "{" : failure === "invalid-shape" ? "{}" : failure === "invalid-row" ? "[{}]" : JSON.stringify([row("old")]);
    saved.set(KEY, original);
    if (failure === "read-error") vi.mocked(storage.getItem).mockImplementation(() => { throw new Error("read denied"); });
    await expect((await api()).enqueue("u1", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    expect(saved.get(KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves existing operations when writing the fallback exceeds quota", async () => {
    const original = JSON.stringify([row("pending")]);
    saved.set(KEY, original);
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error("quota"); });
    await expect((await api()).enqueue("u1", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    expect(saved.get(KEY)).toBe(original);
  });

  it("recovers from an asynchronous IDB open error on the next enqueue", async () => {
    const request = {} as IDBOpenDBRequest;
    vi.stubGlobal("indexedDB", { open: () => {
      queueMicrotask(() => request.onerror?.({} as Event));
      return request;
    } });
    const { enqueue } = await api();
    const first = await enqueue("u1", "game_complete", {});
    expect(JSON.parse(saved.get(KEY)!)).toEqual([first]);
    const { tx, open } = database();
    const pending = enqueue("u1", "game_complete", {});
    await waitForPut();
    expect(open).toHaveBeenCalledOnce();
    tx.oncomplete?.call(tx, {} as Event);
    await pending;
  });

  it("accepts the last free slot without losing old operations", async () => {
    const old = Array.from({ length: 1999 }, (_, i) => row(String(i)));
    saved.set(KEY, JSON.stringify(old));
    await (await api()).enqueueWithId("u1", "last", "game_complete", {});
    const all = JSON.parse(saved.get(KEY)!);
    expect(all).toHaveLength(2000);
    expect(all.slice(0, 1999)).toEqual(old);
    expect(all[1999].id).toBe("last");
  });

  it("rejects capacity overflow and preserves every pending operation", async () => {
    const original = JSON.stringify(Array.from({ length: 2000 }, (_, i) => row(String(i))));
    saved.set(KEY, original);
    await expect((await api()).enqueueWithId("u1", "overflow", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    expect(saved.get(KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("allows same-id updates at capacity", async () => {
    saved.set(KEY, JSON.stringify(Array.from({ length: 2000 }, (_, i) => row(String(i)))));
    await (await api()).enqueueWithId("u1", "0", "game_complete", { updated: true });
    const all = JSON.parse(saved.get(KEY)!);
    expect(all).toHaveLength(2000);
    expect(all.find((r: { id: string }) => r.id === "0").payload).toEqual({ updated: true });
  });

  it("waits for IDB transaction completion before reporting success", async () => {
    const { tx } = database();
    let done = false;
    const pending = (await api()).enqueue("u1", "game_complete", {}).then(() => { done = true; });
    await waitForPut();
    expect(done).toBe(false);
    tx.oncomplete?.call(tx, {} as Event);
    await pending;
    expect(done).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["onabort", "onerror"] as const)("uses durable fallback after IDB %s", async (event) => {
    const { tx } = database();
    const pending = (await api()).enqueue("u1", "game_complete", {});
    await waitForPut();
    tx[event]?.call(tx, {} as Event);
    const item = await pending;
    expect(JSON.parse(saved.get(KEY)!)).toEqual([item]);
  });

  it("rejects when an aborted transaction cannot be saved to fallback", async () => {
    const { tx } = database();
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error("quota"); });
    const { enqueue } = await api();
    const result = expect(enqueue("u1", "game_complete", {})).rejects.toThrow("Outbox persistence failed");
    await waitForPut();
    tx.onabort?.call(tx, {} as Event);
    await result;
  });

  it("retries opening IDB after a temporary failure", async () => {
    const { enqueue } = await api();
    await enqueue("u1", "game_complete", {});
    const { tx, open } = database();
    const pending = enqueue("u1", "game_complete", {});
    await waitForPut();
    expect(open).toHaveBeenCalledOnce();
    tx.oncomplete?.call(tx, {} as Event);
    await pending;
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
