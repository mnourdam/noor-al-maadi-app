import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const server = vi.hoisted(() => ({ uid: "alice", rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: server.uid } } } }) },
    rpc: server.rpc,
  },
}));
let values: Map<string, string>;
beforeEach(async () => {
  vi.resetModules();
  values = new Map();
  server.uid = "alice";
  server.rpc.mockReset();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
    clear: () => values.clear(),
  });
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request: (name: string, _options: unknown, work: () => unknown) => {
        const next = (tails.get(name) ?? Promise.resolve()).then(work);
        tails.set(
          name,
          next.catch(() => {}),
        );
        return next;
      },
    },
  });
  (await import("@/lib/identity/owner")).setActiveOwnerInternal("user:alice");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function api() {
  return {
    outbox: await import("@/lib/offline/outbox"),
    flush: (await import("@/lib/offline/flush")).flushOutbox,
    dead: await import("@/lib/offline/dead-letter"),
  };
}
const payload = { xp: 7, dinars: 2, hearts: 0, source: "synthetic" };
const invalid: [string, unknown][] = [
  ["null", null],
  ["empty", {}],
  ["truthy ok", { ok: "yes", applied: true }],
  ["missing applied", { ok: true }],
  ["truthy applied", { ok: true, applied: "yes" }],
  ["falsey applied", { ok: true, applied: 0 }],
  ["array", []],
  ["contradictory grant", { ok: true, applied: true, reason: "already_applied" }],
  ["contradictory duplicate", { ok: true, applied: false, reason: "not_published" }],
  ["remote permanent reason", { ok: false, reason: "not_published" }],
  ["unauthenticated", { ok: false, reason: "unauthenticated" }],
];
it.each(invalid)(
  "retains durable operation for %s after reload without deadletter",
  async (_label, data) => {
    const a = await api();
    const row = await a.outbox.enqueueWithId("alice", "delta", "profile_delta", payload);
    server.rpc.mockResolvedValue({ data, error: null });
    expect(await a.flush("alice")).toEqual({ flushed: 0, failed: 1 });
    expect(a.dead.listDeadLetters("alice")).toEqual([]);
    vi.resetModules();
    const b = await api();
    const rows = await b.outbox.peekAll("alice");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: row.id,
      userId: row.userId,
      payload,
      attempts: 1,
      lastError: "profile-delta-receipt-unresolved",
    });
  },
);
it.each([
  { ok: true, applied: true },
  { ok: true, applied: false },
  { ok: true, applied: false, reason: "already_applied" },
])("acknowledges valid %j", async (data) => {
  const a = await api();
  await a.outbox.enqueueWithId("alice", "delta", "profile_delta", payload);
  server.rpc.mockResolvedValue({ data, error: null });
  expect(await a.flush("alice")).toEqual({ flushed: 1, failed: 0 });
  expect(await a.outbox.peekAll("alice")).toEqual([]);
});
it("retries same durable id and payload after malformed response", async () => {
  const a = await api();
  await a.outbox.enqueueWithId("alice", "delta", "profile_delta", payload);
  server.rpc
    .mockResolvedValueOnce({ data: { ok: true }, error: null })
    .mockResolvedValueOnce({
      data: { ok: true, applied: false, reason: "already_applied" },
      error: null,
    });
  expect(await a.flush("alice")).toEqual({ flushed: 0, failed: 1 });
  expect(await a.flush("alice")).toEqual({ flushed: 1, failed: 0 });
  expect(server.rpc.mock.calls[0]).toEqual(server.rpc.mock.calls[1]);
  expect(await a.outbox.peekAll("alice")).toEqual([]);
});
function deferredRpc() {
  let started!: () => void, finish!: (value: unknown) => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.rpc.mockImplementation(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  return { ready, finish: () => finish({ data: { ok: true, applied: true }, error: null }) };
}
it("older successful receipt cannot acknowledge same-id replacement", async () => {
  const a = await api();
  await a.outbox.enqueueWithId("alice", "delta", "profile_delta", payload);
  const d = deferredRpc(),
    pending = a.flush("alice");
  await d.ready;
  const newer = await a.outbox.enqueueWithId("alice", "delta", "profile_delta", {
    ...payload,
    xp: 9,
  });
  d.finish();
  expect(await pending).toEqual({ flushed: 0, failed: 1 });
  expect(await a.outbox.peekAll("alice")).toEqual([newer]);
});
it("account switch during response never acknowledges either owner's work", async () => {
  const a = await api();
  const alice = await a.outbox.enqueueWithId("alice", "alice-delta", "profile_delta", payload);
  const bob = await a.outbox.enqueueWithId("bob", "bob-delta", "profile_delta", payload);
  const d = deferredRpc(),
    pending = a.flush("alice");
  await d.ready;
  server.uid = "bob";
  (await import("@/lib/identity/owner")).setActiveOwnerInternal("user:bob");
  d.finish();
  expect(await pending).toEqual({ flushed: 0, failed: 0 });
  expect(await a.outbox.peekAll("alice")).toEqual([alice]);
  expect(await a.outbox.peekAll("bob")).toEqual([bob]);
});
