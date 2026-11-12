import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const env = vi.hoisted(() => ({
  pause: async (_name: string): Promise<void> => {},
  rpc: vi.fn(),
  streak: vi.fn(),
  upsert: vi.fn(),
  deletion: vi.fn(),
  avatar: vi.fn(),
  tombstone: vi.fn(),
  read: vi.fn(),
  derive: vi.fn(),
  union: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "alice" } } } }) },
    rpc: env.rpc,
    from: () => ({
      upsert: env.upsert,
      delete: () => {
        const query = {
          eq: () => query,
          then: (yes: any, no: any) => env.deletion().then(yes, no),
        };
        return query;
      },
    }),
  },
}));
beforeEach(async () => {
  vi.doMock("@/lib/streak-activity", async () => {
    await env.pause("streak-import");
    return { callRecordStreakActivityV16: env.streak };
  });
  vi.doMock("@/lib/profile", async () => {
    await env.pause("avatar-import");
    return { readPersistedProfileState: env.read };
  });
  vi.doMock("@/lib/social", () => ({ derivePublicStats: env.derive }));
  vi.doMock("@/lib/campaigns/completions", () => ({ unionCompletedIds: env.union }));
  vi.doMock("@/lib/emblems/avatar-persistence", async () => {
    await env.pause("avatar-cleanup-import");
    return { clearPendingAvatar: env.avatar };
  });
  vi.doMock("@/lib/reflections", async () => {
    await env.pause("reflection-import");
    return {
      reflectionUpsertRow: (...args: unknown[]) => ({ args }),
      clearReflectionTombstone: env.tombstone,
    };
  });
  vi.resetModules();
  env.pause = async () => {};
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    locks: {
      request: (name: string, _o: unknown, work: () => unknown) => {
        const next = (tails.get(name) ?? Promise.resolve()).then(work);
        tails.set(
          name,
          next.catch(() => {}),
        );
        return next;
      },
    },
  });
  for (const fn of [
    env.rpc,
    env.streak,
    env.upsert,
    env.deletion,
    env.avatar,
    env.tombstone,
    env.read,
    env.derive,
    env.union,
  ])
    fn.mockReset();
  env.rpc.mockImplementation(async () => {
    await env.pause("rpc");
    return { data: { ok: true }, error: null };
  });
  env.streak.mockImplementation(async () => {
    await env.pause("streak-network");
    return { ok: true, data: {} };
  });
  env.upsert.mockImplementation(async () => {
    await env.pause("reflection-network");
    return { error: null };
  });
  env.deletion.mockResolvedValue({ error: null });
  env.read.mockReturnValue({ campaignsCompleted: [] });
  env.derive.mockReturnValue({ xp: 0 });
  env.union.mockImplementation(async () => {
    await env.pause("union");
    return new Set(["c1"]);
  });
  (await import("@/lib/identity/owner")).setActiveOwnerInternal("user:alice");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const scenarios = [
  ["streak-import", "streak_activity", { activityDay: "2026-11-12", source: "story" }, false],
  ["avatar-import", "avatar_select", { avatarId: "x" }, false],
  ["union", "avatar_select", { avatarId: "x" }, false],
  ["union-reject", "avatar_select", { avatarId: "x" }, false],
  ["reflection-import", "reflection_save", { campaignId: "c", activityId: "a", rec: {} }, false],
  ["avatar-cleanup-import", "avatar_select", { avatarId: "x" }, true],
  ["reflection-import", "reflection_delete", { campaignId: "c", activityId: "a" }, true],
  ["streak-network", "streak_activity", { activityDay: "2026-11-12", source: "story" }, true],
  ["reflection-network", "reflection_save", { campaignId: "c", activityId: "a", rec: {} }, true],
  ["rpc", "avatar_select", { avatarId: "x" }, true],
] as const;
for (const aba of [false, true]) {
  it.each(scenarios)(`fences %s for %s (ABA=${aba})`, async (stage, kind, payload, dispatched) => {
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>((r) => {
        started = r;
      }),
      wait = new Promise<void>((r) => {
        release = r;
      });
    env.pause = async (name) => {
      if (name === (stage === "union-reject" ? "union" : stage)) {
        started();
        await wait;
        if (stage === "union-reject") throw new Error("union-failed");
      }
    };
    const outbox = await import("@/lib/offline/outbox"),
      identity = await import("@/lib/identity/owner");
    const row = await outbox.enqueueWithId("alice", "queued", kind, payload);
    const bob = await outbox.enqueueWithId("bob", "bob", "profile_delta", { xp: 1 });
    const events = vi.spyOn(window, "dispatchEvent");
    const pending = (await import("@/lib/offline/flush")).flushOutbox("alice");
    await ready;
    identity.setActiveOwnerInternal("user:bob");
    if (aba) identity.setActiveOwnerInternal("user:alice");
    events.mockClear();
    release();
    await pending;
    if (!dispatched) {
      expect(env.rpc).not.toHaveBeenCalled();
      expect(env.streak).not.toHaveBeenCalled();
      expect(env.upsert).not.toHaveBeenCalled();
    }
    expect(env.avatar).not.toHaveBeenCalled();
    expect(env.tombstone).not.toHaveBeenCalled();
    expect(events.mock.calls.map(([event]) => event.type)).not.toContain("irth:outbox:flushed");
    expect(
      events.mock.calls.filter(([event]) => /irth:(avatar|streak|reflections)/.test(event.type)),
    ).toHaveLength(0);
    expect(await outbox.peekAll("alice")).toEqual([row]);
    expect(await outbox.peekAll("bob")).toEqual([bob]);
  });
}
it.each([
  ["streak_activity", { activityDay: "2026-11-12", source: "story" }, "irth:streak:changed"],
  ["avatar_select", { avatarId: "x" }, "irth:avatar:synced"],
  ["reflection_save", { campaignId: "c", activityId: "a", rec: {} }, "irth:reflections-changed"],
  ["reflection_delete", { campaignId: "c", activityId: "a" }, "irth:reflections-changed"],
] as const)("preserves current %s completion and events", async (kind, payload, eventName) => {
  const outbox = await import("@/lib/offline/outbox");
  await outbox.enqueueWithId("alice", "queued", kind, payload);
  const events = vi.spyOn(window, "dispatchEvent");
  expect(await (await import("@/lib/offline/flush")).flushOutbox("alice")).toEqual({
    flushed: 1,
    failed: 0,
  });
  expect(await outbox.peekAll("alice")).toEqual([]);
  expect(events.mock.calls.map(([event]) => event.type)).toContain(eventName);
  if (kind === "avatar_select") expect(env.avatar).toHaveBeenCalledWith("alice");
  if (kind === "reflection_delete") expect(env.tombstone).toHaveBeenCalledWith("c", "a");
});
it("rechecks identity between synchronous chapter publications", async () => {
  const outbox = await import("@/lib/offline/outbox"),
    identity = await import("@/lib/identity/owner");
  const row = await outbox.enqueueWithId("alice", "chapter", "chapter_progress", {
    campaignId: "c",
    chapterId: "a",
    completed: true,
  });
  const listener = () => identity.setActiveOwnerInternal("user:bob");
  window.addEventListener("irth:campaign-progress:changed", listener);
  const events = vi.spyOn(window, "dispatchEvent");
  try {
    await (await import("@/lib/offline/flush")).flushOutbox("alice");
    const names = events.mock.calls.map(([event]) => event.type);
    expect(names).toContain("irth:campaign-progress:changed");
    expect(names).not.toContain("irth:campaign-completions:changed");
    expect(names).not.toContain("irth:outbox:flushed");
    expect(await outbox.peekAll("alice")).toEqual([row]);
  } finally {
    window.removeEventListener("irth:campaign-progress:changed", listener);
  }
});
it.each(["avatar_select", "reflection_delete"] as const)(
  "does not publish if %s cleanup synchronously changes identity",
  async (kind) => {
    const outbox = await import("@/lib/offline/outbox"),
      identity = await import("@/lib/identity/owner");
    const payload =
      kind === "avatar_select" ? { avatarId: "x" } : { campaignId: "c", activityId: "a" };
    const row = await outbox.enqueueWithId("alice", "queued", kind, payload);
    (kind === "avatar_select" ? env.avatar : env.tombstone).mockImplementation(() =>
      identity.setActiveOwnerInternal("user:bob"),
    );
    const events = vi.spyOn(window, "dispatchEvent");
    await (await import("@/lib/offline/flush")).flushOutbox("alice");
    const names = events.mock.calls.map(([event]) => event.type);
    expect(names).not.toContain(
      kind === "avatar_select" ? "irth:avatar:synced" : "irth:reflections-changed",
    );
    expect(names).not.toContain("irth:outbox:flushed");
    expect(await outbox.peekAll("alice")).toEqual([row]);
  },
);
