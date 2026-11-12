import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const server = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: server.auth }, rpc: server.rpc },
}));
beforeEach(async () => {
  vi.resetModules();
  server.auth.mockReset();
  server.rpc.mockReset().mockResolvedValue({ data: { ok: true, applied: true }, error: null });
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
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
async function setup() {
  const outbox = await import("@/lib/offline/outbox");
  const { flushOutbox } = await import("@/lib/offline/flush");
  const identity = await import("@/lib/identity/owner");
  const payload = { xp: 7, dinars: 2, source: "synthetic-auth-boundary" };
  const alice = await outbox.enqueueWithId("alice", "alice-delta", "profile_delta", payload);
  const bob = await outbox.enqueueWithId("bob", "bob-delta", "profile_delta", payload);
  let start!: () => void, finish!: (value: unknown) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  server.auth.mockImplementation(() => {
    start();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  return {
    outbox,
    flushOutbox,
    identity,
    alice,
    bob,
    started,
    finish: (uid: string | null) =>
      finish({ data: { session: uid ? { user: { id: uid } } : null }, error: null }),
  };
}
it.each([false, true])(
  "never dispatches stale Alice auth after owner switch (ABA=%s)",
  async (aba) => {
    const a = await setup();
    const pending = a.flushOutbox("alice");
    await a.started;
    a.identity.setActiveOwnerInternal("user:bob");
    if (aba) a.identity.setActiveOwnerInternal("user:alice");
    a.finish("alice");
    expect(await pending).toEqual({ flushed: 0, failed: 0 });
    expect(server.rpc).not.toHaveBeenCalled();
    expect(await a.outbox.peekAll("alice")).toEqual([a.alice]);
    expect(await a.outbox.peekAll("bob")).toEqual([a.bob]);
  },
);
it("unchanged owner may dispatch after delayed auth and acknowledge only its own record", async () => {
  const a = await setup();
  const pending = a.flushOutbox("alice");
  await a.started;
  a.finish("alice");
  expect(await pending).toEqual({ flushed: 1, failed: 0 });
  expect(server.rpc).toHaveBeenCalledExactlyOnceWith("apply_profile_delta", {
    p_delta_id: "alice-delta",
    p_xp: 7,
    p_dinars: 2,
    p_hearts: 0,
    p_source: "synthetic-auth-boundary",
  });
  expect(await a.outbox.peekAll("alice")).toEqual([]);
  expect(await a.outbox.peekAll("bob")).toEqual([a.bob]);
});
it.each([null, "bob"])("retains prior missing/mismatched-session behavior (%s)", async (uid) => {
  const a = await setup();
  const pending = a.flushOutbox("alice");
  await a.started;
  a.finish(uid);
  expect(await pending).toEqual({ flushed: 0, failed: 1 });
  expect(server.rpc).not.toHaveBeenCalled();
  const rows = await a.outbox.peekAll("alice");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: a.alice.id,
    payload: a.alice.payload,
    attempts: 1,
    lastError: "session-mismatch",
  });
  expect(await a.outbox.peekAll("bob")).toEqual([a.bob]);
});
