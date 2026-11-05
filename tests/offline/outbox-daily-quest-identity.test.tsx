import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
const env = vi.hoisted(() => ({
  users: { alice: { id: "alice" }, bob: { id: "bob" } } as Record<string, { id: string }>,
  uid: "alice",
  sessionId: "alice",
  rpc: vi.fn(),
  row: vi.fn(),
  auth: vi.fn(),
  enqueue: vi.fn(),
  flush: vi.fn(),
  stats: vi.fn(),
  points: vi.fn(),
  dinars: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => env.auth(...a) },
    rpc: (...a: unknown[]) => env.rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => env.row() }) }) }),
  },
}));
vi.mock("@/lib/offline/outbox", () => ({ enqueueWithId: (...a: unknown[]) => env.enqueue(...a) }));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: (...a: unknown[]) => env.flush(...a) }));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: {},
    applyServerStats: env.stats,
    addPoints: env.points,
    addDinars: env.dinars,
  }),
}));
vi.mock("@/lib/account", () => ({
  useAccount: () => ({
    user: env.users[env.uid] ?? null,
    loadingSession: false,
    syncing: false,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/motion/MotionPrimitives", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localEncyclopediaAll: () =>
    ["e1", "e2"].map((id) => ({ id, slug: id, title: id, entity_type: "figure" })),
}));
vi.mock("@/lib/encyclopedia-source", () => ({ isDisplayableEntity: () => true }));
import {
  __resetIdentityForTests,
  setActiveOwnerInternal,
  getIdentityEpoch,
} from "@/lib/identity/owner";
import * as quest from "@/lib/daily-quest";
import * as reward from "@/lib/daily-quest-reward";
import { DailyQuestCard } from "@/components/home/DailyQuestCard";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const ok = { data: { ok: true, applied: true }, error: null };
const profile = { data: { xp: 100, dinars: 30, hearts: 4, streak: 2 }, error: null };
const params = () => ({
  userId: "alice",
  localDate: quest.localDateKey(),
  entityId: "e1",
  xp: 10,
  dinars: 3,
});
function seed(
  uid = env.uid,
  completed = true,
  rewarded = false,
  entityId = "e1",
  date = quest.localDateKey(),
) {
  const q: quest.QuestState = {
    version: 2,
    date,
    kind: "read_encyclopedia_entity",
    target: { entityId, entitySlug: entityId, entityTitle: entityId, entityType: "figure" },
    goal: 1,
    progress: completed ? 1 : 0,
    completed,
    rewarded,
    xp: 10,
    dinars: 3,
  };
  localStorage.setItem(`irth.daily-quest.${uid}.v2`, JSON.stringify(q));
  return q;
}
function swap(uid = "bob") {
  env.uid = uid;
  env.sessionId = uid;
  setActiveOwnerInternal(`user:${uid}`);
}
const deltaCalls = () => env.rpc.mock.calls.filter(([name]) => name === "apply_profile_delta");
async function drain() {
  await act(async () => {
    for (let i = 0; i < 70; i++) await Promise.resolve();
  });
}
function complete(q = quest.getTodayQuest(env.uid)!) {
  window.dispatchEvent(new CustomEvent(quest.QUEST_COMPLETED_EVENT, { detail: q }));
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  __resetIdentityForTests();
  env.uid = env.sessionId = "alice";
  setActiveOwnerInternal("user:alice");
  vi.stubGlobal("crypto", {
    subtle: {
      digest: async (_algorithm: string, data: Uint8Array) =>
        Uint8Array.from(createHash("sha256").update(data).digest()).buffer,
    },
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn() });
  env.auth.mockImplementation(async () => ({
    data: { session: { user: { id: env.sessionId } } },
    error: null,
  }));
  env.rpc.mockImplementation(async (name: string) => (name === "get_my_profile" ? profile : ok));
  env.row.mockResolvedValue({ data: null, error: null });
  env.enqueue.mockResolvedValue({ id: "receipt" });
  env.flush.mockResolvedValue({ flushed: 1 });
  env.stats.mockReset();
  env.points.mockReset();
  env.dinars.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("P1-07 canonical grant sensitive waits (real identity + real reward path)", () => {
  it("Alice→Bob before delta derivation completes prevents every RPC/enqueue", async () => {
    const digest = deferred<ArrayBuffer>();
    vi.stubGlobal("crypto", { subtle: { digest: () => digest.promise } });
    const pending = reward.grantDailyQuestReward(params());
    swap();
    digest.resolve(new ArrayBuffer(32));
    expect(await pending).toMatchObject({ outcome: "stale_context", rpcMayHaveApplied: false });
    expect(env.rpc).not.toHaveBeenCalled();
    expect(env.enqueue).not.toHaveBeenCalled();
  });
  it("Alice→Bob→Alice during hashing rejects the older epoch", async () => {
    const digest = deferred<ArrayBuffer>();
    vi.stubGlobal("crypto", { subtle: { digest: () => digest.promise } });
    const epoch = getIdentityEpoch(),
      pending = reward.grantDailyQuestReward(params());
    swap();
    swap("alice");
    expect(getIdentityEpoch()).toBeGreaterThan(epoch);
    digest.resolve(new ArrayBuffer(32));
    expect((await pending).outcome).toBe("stale_context");
    expect(env.rpc).not.toHaveBeenCalled();
  });
  it("switch after profile read prevents the apply RPC", async () => {
    const gate = deferred<typeof profile>(),
      started = deferred<void>();
    env.rpc.mockImplementation((name) => {
      if (name === "get_my_profile") {
        started.resolve();
        return gate.promise;
      }
      return ok;
    });
    const pending = reward.grantDailyQuestReward(params());
    await started.promise;
    swap();
    gate.resolve(profile);
    expect((await pending).outcome).toBe("stale_context");
    expect(deltaCalls()).toHaveLength(0);
    expect(env.rpc).toHaveBeenCalledTimes(1);
  });
  it("actual Supabase session mismatch with unchanged owner prevents new RPC", async () => {
    env.sessionId = "bob";
    expect((await reward.grantDailyQuestReward(params())).outcome).toBe("stale_context");
    expect(env.rpc).not.toHaveBeenCalled();
    expect(env.enqueue).not.toHaveBeenCalled();
  });
  it("session changes during auth await prevent use of stale getSession result", async () => {
    const gate = deferred<any>();
    env.auth.mockReturnValueOnce(gate.promise);
    const pending = reward.grantDailyQuestReward(params());
    await drain();
    swap();
    gate.resolve({ data: { session: { user: { id: "alice" } } }, error: null });
    expect((await pending).outcome).toBe("stale_context");
    expect(env.rpc).not.toHaveBeenCalled();
  });
  it.each(["success", "transport-error"] as const)(
    "switch during RPC (%s) leaves server outcome uncertain, no subsequent RPC or queue",
    async (mode) => {
      const gate = deferred<any>(),
        started = deferred<void>();
      env.rpc.mockImplementation((name) => {
        if (name === "apply_profile_delta") {
          started.resolve();
          return gate.promise;
        }
        return profile;
      });
      const pending = reward.grantDailyQuestReward(params());
      await started.promise;
      swap();
      gate.resolve(mode === "success" ? ok : { data: null, error: { message: "transport" } });
      const result = await pending;
      expect(result).toMatchObject({
        outcome: "stale_context",
        rpcMayHaveApplied: true,
        rpcStatus: "unresolved",
      });
      expect(result.serverStats).toBeUndefined();
      expect(env.rpc).toHaveBeenCalledTimes(2);
      expect(env.enqueue).not.toHaveBeenCalled();
      expect(env.flush).not.toHaveBeenCalled();
    },
  );
  it("switch after RPC before stats request prevents rehydrate RPC", async () => {
    let authCalls = 0;
    env.auth.mockImplementation(async () => {
      if (++authCalls === 4) swap(); // post apply response auth, before any post-grant read
      return { data: { session: { user: { id: env.sessionId } } }, error: null };
    });
    const result = await reward.grantDailyQuestReward(params());
    expect(result.outcome).toBe("stale_context");
    expect(result.rpcMayHaveApplied).toBe(true);
    expect(env.rpc).toHaveBeenCalledTimes(2);
  });
  it("switch during post-RPC stats blocks row probe and all returned stats", async () => {
    const gate = deferred<typeof profile>(),
      started = deferred<void>();
    let reads = 0;
    env.rpc.mockImplementation((name) => {
      if (name === "get_my_profile" && ++reads === 2) {
        started.resolve();
        return gate.promise;
      }
      return name === "get_my_profile" ? profile : ok;
    });
    const pending = reward.grantDailyQuestReward(params());
    await started.promise;
    swap();
    gate.resolve(profile);
    const result = await pending;
    expect(result.outcome).toBe("stale_context");
    expect(result.serverStats).toBeUndefined();
    expect(env.row).not.toHaveBeenCalled();
  });
  it("switch while delta row awaits blocks confirmed result publication", async () => {
    const gate = deferred<any>(),
      started = deferred<void>();
    env.row.mockImplementation(() => {
      started.resolve();
      return gate.promise;
    });
    const pending = reward.grantDailyQuestReward(params());
    await started.promise;
    swap();
    gate.resolve({ data: { delta_id: "old" }, error: null });
    expect((await pending).outcome).toBe("stale_context");
    expect(env.enqueue).not.toHaveBeenCalled();
  });
  it("pending queue is owner-cancelled and cannot trigger old flush", async () => {
    Object.defineProperty(navigator, "onLine", { value: false });
    const gate = deferred<any>(),
      started = deferred<void>();
    env.enqueue.mockImplementation(() => {
      started.resolve();
      return gate.promise;
    });
    const pending = reward.grantDailyQuestReward(params());
    await started.promise;
    const signal = env.enqueue.mock.calls[0][4].signal as AbortSignal;
    swap();
    expect(signal.aborted).toBe(true);
    gate.resolve({ id: "old-committed-or-cancelled" });
    expect((await pending).outcome).toBe("stale_context");
    expect(env.flush).not.toHaveBeenCalled();
  });
  it("stable SHA-256 delta ID and queued/online retries preserve the existing key and payload", async () => {
    const p = params(),
      key = reward.buildDailyQuestRewardKey(p);
    const expectedBytes = new Uint8Array(
      await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
    ).slice(0, 16);
    expectedBytes[6] = (expectedBytes[6] & 15) | 80;
    expectedBytes[8] = (expectedBytes[8] & 63) | 128;
    const hex = [...expectedBytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    const expected = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    expect(await reward.deriveStableDeltaId(key)).toBe(expected);
    Object.defineProperty(navigator, "onLine", { value: false });
    const queued = await reward.grantDailyQuestReward(p);
    expect(queued.outcome).toBe("queued");
    expect(queued.deltaId).toBe(expected);
    expect(env.enqueue.mock.calls[0].slice(0, 4)).toEqual([
      "alice",
      expected,
      "profile_delta",
      { xp: 10, dinars: 3, hearts: 0, source: "daily_quest" },
    ]);
    Object.defineProperty(navigator, "onLine", { value: true });
    const online = await reward.grantDailyQuestReward(p);
    expect(online.outcome).toBe("granted");
    expect(deltaCalls()[0][1].p_delta_id).toBe(expected);
  });
});

describe("P1-07 real DailyQuestCard + real grant/probe controlled races", () => {
  it.each([true, false])(
    "unmount suppresses stats/additive fallback, marks and celebration (stats=%s)",
    async (stats) => {
      seed();
      const gate = deferred<any>(),
        started = deferred<void>();
      env.rpc.mockImplementation((name) => {
        if (name === "apply_profile_delta") {
          started.resolve();
          return gate.promise;
        }
        return stats ? profile : { data: null, error: null };
      });
      const ui = render(<DailyQuestCard />);
      await started.promise;
      ui.unmount();
      gate.resolve(ok);
      await drain();
      expect(env.stats).not.toHaveBeenCalled();
      expect(env.points).not.toHaveBeenCalled();
      expect(env.dinars).not.toHaveBeenCalled();
      expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
      expect(navigator.vibrate).not.toHaveBeenCalled();
    },
  );
  it("Alice late result never mutates Bob profile, marks, or celebration", async () => {
    seed();
    seed("bob", false);
    const gate = deferred<any>(),
      started = deferred<void>();
    env.rpc.mockImplementation((name) => {
      if (name === "apply_profile_delta") {
        started.resolve();
        return gate.promise;
      }
      return profile;
    });
    const ui = render(<DailyQuestCard />);
    await started.promise;
    await act(async () => {
      swap();
      ui.rerender(<DailyQuestCard />);
    });
    gate.resolve(ok);
    await drain();
    expect(env.stats).not.toHaveBeenCalled();
    expect(env.points).not.toHaveBeenCalled();
    expect(env.dinars).not.toHaveBeenCalled();
    expect(quest.getTodayQuest("bob")?.rewarded).toBe(false);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it("old Alice finally cannot release Bob single-flight; two Bob events stay coalesced", async () => {
    seed();
    seed("bob");
    const a = deferred<any>(),
      b = deferred<any>(),
      aStarted = deferred<void>(),
      bStarted = deferred<void>();
    env.rpc.mockImplementation((name) => {
      if (name !== "apply_profile_delta") return profile;
      if (env.sessionId === "alice") {
        aStarted.resolve();
        return a.promise;
      }
      bStarted.resolve();
      return b.promise;
    });
    const ui = render(<DailyQuestCard />);
    await aStarted.promise;
    await act(async () => {
      swap();
      ui.rerender(<DailyQuestCard />);
    });
    await bStarted.promise;
    a.resolve(ok);
    await drain();
    await act(async () => {
      complete();
      complete();
    });
    await drain();
    expect(deltaCalls()).toHaveLength(2);
    b.resolve(ok);
    await drain();
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(quest.getTodayQuest("bob")?.rewarded).toBe(true);
  });
  it("a late Alice completion event cannot initiate Bob's uncompleted identical target", async () => {
    const oldDetail = seed();
    seed("bob", false);
    swap();
    render(<DailyQuestCard />);
    await drain();
    await act(async () => {
      complete(oldDetail);
    });
    await drain();
    expect(deltaCalls()).toHaveLength(0);
    expect(env.stats).not.toHaveBeenCalled();
    expect(quest.getTodayQuest("bob")?.completed).toBe(false);
  });
  it("simultaneous completion/update events grant only once, including stale repeated detail", async () => {
    seed("alice", false);
    render(<DailyQuestCard />);
    await drain();
    const q = seed();
    await act(async () => {
      complete(q);
      complete(q);
      window.dispatchEvent(new Event(quest.QUEST_UPDATED_EVENT));
    });
    await drain();
    expect(deltaCalls()).toHaveLength(1);
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(true);
    await act(async () => {
      complete(q);
    });
    await drain();
    expect(deltaCalls()).toHaveLength(1);
  });
  it.each(["target", "day"] as const)(
    "changed %s while RPC waits cannot mark the new quest or celebrate",
    async (change) => {
      seed();
      const gate = deferred<any>(),
        started = deferred<void>();
      env.rpc.mockImplementation((name) => {
        if (name === "apply_profile_delta") {
          started.resolve();
          return gate.promise;
        }
        return profile;
      });
      render(<DailyQuestCard />);
      await started.promise;
      if (change === "day")
        vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(Date.now() + 86400000));
      seed("alice", false, false, "e2");
      gate.resolve(ok);
      await drain();
      expect(env.stats).not.toHaveBeenCalled();
      expect(env.points).not.toHaveBeenCalled();
      expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
      expect(navigator.vibrate).not.toHaveBeenCalled();
      vi.useRealTimers();
    },
  );
  it("identity change between stats application and marker blocks mark and celebration", async () => {
    seed();
    seed("bob", false);
    env.stats.mockImplementation(() => swap());
    render(<DailyQuestCard />);
    await drain();
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    expect(quest.getTodayQuest("bob")?.rewarded).toBe(false);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it("confirmation hydrator cannot mark a new identity or new target", async () => {
    seed("alice", false);
    seed("bob", false);
    const gate = deferred<any>(),
      started = deferred<void>();
    env.row.mockImplementation(() => {
      if (env.sessionId === "alice") {
        started.resolve();
        return gate.promise;
      }
      return { data: null, error: null };
    });
    const ui = render(<DailyQuestCard />);
    await started.promise;
    await act(async () => {
      swap();
      ui.rerender(<DailyQuestCard />);
    });
    gate.resolve({ data: { delta_id: "old" }, error: null });
    await drain();
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    expect(quest.getTodayQuest("bob")?.rewarded).toBe(false);
    expect(env.stats).not.toHaveBeenCalled();
    expect(deltaCalls()).toHaveLength(0);
  });
  it.each(["target", "day", "unmount"] as const)(
    "delayed hydrator cannot complete changed %s context",
    async (change) => {
      seed("alice", false);
      const gate = deferred<any>(),
        started = deferred<void>();
      env.row.mockImplementation(() => {
        started.resolve();
        return gate.promise;
      });
      const ui = render(<DailyQuestCard />);
      await started.promise;
      if (change === "unmount") ui.unmount();
      else {
        if (change === "day")
          vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date(Date.now() + 86400000));
        seed("alice", false, false, "e2");
      }
      gate.resolve({ data: { delta_id: "old" }, error: null });
      await drain();
      expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
      expect(deltaCalls()).toHaveLength(0);
      expect(env.stats).not.toHaveBeenCalled();
    },
  );
  it("Alice→Bob→Alice creates a new card epoch and only the fresh reconcile publishes", async () => {
    seed();
    seed("bob", false);
    const old = deferred<any>(),
      fresh = deferred<any>(),
      oldStarted = deferred<void>(),
      freshStarted = deferred<void>();
    let applies = 0;
    env.rpc.mockImplementation((name) => {
      if (name !== "apply_profile_delta") return profile;
      if (++applies === 1) {
        oldStarted.resolve();
        return old.promise;
      }
      freshStarted.resolve();
      return fresh.promise;
    });
    const ui = render(<DailyQuestCard />);
    await oldStarted.promise;
    await act(async () => {
      swap();
      ui.rerender(<DailyQuestCard />);
    });
    await act(async () => {
      swap("alice");
      ui.rerender(<DailyQuestCard />);
    });
    await freshStarted.promise;
    old.resolve(ok);
    await drain();
    expect(env.stats).not.toHaveBeenCalled();
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    fresh.resolve({ data: { ok: true, applied: false }, error: null });
    await drain();
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(true);
    expect(deltaCalls()[0][1].p_delta_id).toBe(deltaCalls()[1][1].p_delta_id);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it("same-account confirmed grant still uses the existing local fallback amounts", async () => {
    seed();
    env.rpc.mockImplementation(async (name) =>
      name === "get_my_profile" ? { data: null, error: null } : ok,
    );
    render(<DailyQuestCard />);
    await drain();
    expect(env.stats).not.toHaveBeenCalled();
    expect(env.points).toHaveBeenCalledExactlyOnceWith(10);
    expect(env.dinars).toHaveBeenCalledExactlyOnceWith(3);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(true);
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
  });
  it("a racing hydrator flag does not suppress fresh authoritative profile stats or duplicate celebration", async () => {
    seed();
    const grant = deferred<any>(),
      probe = deferred<any>(),
      started = deferred<void>();
    env.rpc.mockImplementation((name) => {
      if (name === "apply_profile_delta") {
        started.resolve();
        return grant.promise;
      }
      return profile;
    });
    env.row
      .mockReturnValueOnce(probe.promise)
      .mockResolvedValue({ data: { delta_id: "same" }, error: null });
    render(<DailyQuestCard />);
    await started.promise;
    probe.resolve({ data: { delta_id: "same" }, error: null });
    await drain();
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(true);
    grant.resolve(ok);
    await drain();
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(env.points).not.toHaveBeenCalled();
    expect(env.dinars).not.toHaveBeenCalled();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it("current hydrator restores completed/rewarded without granting again", async () => {
    seed("alice", false);
    env.row.mockResolvedValue({ data: { delta_id: "confirmed" }, error: null });
    render(<DailyQuestCard />);
    await drain();
    expect(quest.getTodayQuest("alice")).toMatchObject({ completed: true, rewarded: true });
    expect(deltaCalls()).toHaveLength(0);
    expect(env.points).not.toHaveBeenCalled();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it("queued keeps rewarded=false; online retry uses same delta and silently reconciles", async () => {
    Object.defineProperty(navigator, "onLine", { value: false });
    seed();
    render(<DailyQuestCard />);
    await drain();
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    expect(env.stats).not.toHaveBeenCalled();
    const id = env.enqueue.mock.calls[0][1];
    env.rpc.mockImplementation(async (name) =>
      name === "get_my_profile" ? profile : { data: { ok: true, applied: false }, error: null },
    );
    Object.defineProperty(navigator, "onLine", { value: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await drain();
    expect(deltaCalls()[0][1].p_delta_id).toBe(id);
    expect(env.stats).toHaveBeenCalledTimes(1);
    expect(quest.getTodayQuest("alice")?.rewarded).toBe(true);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it.each(["grant", "hydrate"] as const)(
    "%s marker validates the exact task and owner at its own write boundary",
    (mode) => {
      const original = seed();
      seed("alice", false, false, "e2");
      const mark =
        mode === "grant" ? quest.markQuestRewarded : quest.markQuestCompletedAndRewardedFromServer;
      expect(
        mark("alice", { date: original.date, entityId: "e1", isCurrent: () => true }),
      ).toBeNull();
      expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
      expect(
        mark("alice", { date: original.date, entityId: "e2", isCurrent: () => false }),
      ).toBeNull();
      expect(quest.getTodayQuest("alice")?.rewarded).toBe(false);
    },
  );
  it("remount rewarded=true does not grant or celebrate", async () => {
    seed("alice", true, true);
    const ui = render(<DailyQuestCard />);
    await drain();
    ui.unmount();
    render(<DailyQuestCard />);
    await drain();
    expect(deltaCalls()).toHaveLength(0);
    expect(env.stats).not.toHaveBeenCalled();
    expect(env.points).not.toHaveBeenCalled();
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(screen.getByText("e1")).toBeTruthy();
  });
});
