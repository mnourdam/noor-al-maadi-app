import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Mocks --------------------------------------------------------------
const enqueued: Array<{ id: string; kind: string; payload: Record<string, unknown> }> = [];
const removed: string[] = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcImpl: (args: Record<string, unknown>) => Promise<unknown> = async () => ({
  data: { ok: true, current_streak: 1, longest_streak: 1, newly_recorded_day: true },
  error: null,
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpcImpl(args);
    },
  },
}));

vi.mock("@/lib/offline/outbox", () => ({
  enqueueWithId: async (_uid: string, id: string, kind: string, payload: Record<string, unknown>) => {
    enqueued.push({ id, kind, payload });
    return { id, kind, payload };
  },
  remove: async (id: string) => { removed.push(id); },
}));

vi.mock("@/lib/offline/flush", () => ({ flushOutbox: async () => ({ flushed: 0, failed: 0 }) }));

import { recordStreakActivity, streakOutboxId, STREAK_RPC_TIMEOUT_MS } from "@/lib/streak-activity";
import { irthDayKey } from "@/lib/irth-day";

beforeEach(() => {
  enqueued.length = 0; removed.length = 0; rpcCalls.length = 0;
  rpcImpl = async () => ({
    data: { ok: true, current_streak: 3, longest_streak: 5, newly_recorded_day: true,
            last_active_day: irthDayKey(), activity_day: irthDayKey(), grants: [],
            xp_total: 10, dinar_balance: 4 },
    error: null,
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("V16 durable streak outbox", () => {
  it("enqueues durably BEFORE the network call, with the IRTH activity day", async () => {
    await recordStreakActivity("game", "g1");
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.kind).toBe("streak_activity");
    expect(enqueued[0]!.id).toBe(streakOutboxId("u1", irthDayKey()));
    expect(enqueued[0]!.payload["activityDay"]).toBe(irthDayKey());
    expect(enqueued[0]!.payload["source"]).toBe("game");
    expect(enqueued[0]!.payload["sourceId"]).toBe("g1");
  });

  it("calls the additive V16 RPC with the original day and client key", async () => {
    await recordStreakActivity("story", "s9");
    expect(rpcCalls[0]!.name).toBe("record_streak_activity_v16");
    expect(rpcCalls[0]!.args["p_activity_day"]).toBe(irthDayKey());
    expect(rpcCalls[0]!.args["p_client_key"]).toBe(streakOutboxId("u1", irthDayKey()));
    expect(rpcCalls[0]!.args["p_source"]).toBe("story");
  });

  it("acknowledges (removes) the queued item only on success", async () => {
    const out = await recordStreakActivity("investigation", "i1");
    expect(out.ok).toBe(true);
    expect(removed).toEqual([streakOutboxId("u1", irthDayKey())]);
  });

  it("leaves the outbox item intact when the RPC rejects", async () => {
    rpcImpl = async () => ({ data: null, error: { message: "boom" } });
    const out = await recordStreakActivity("game", "g2");
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toBe("queued");
    expect(removed).toHaveLength(0);
    expect(enqueued).toHaveLength(1);
  });

  it("leaves the outbox item intact when the RPC times out", async () => {
    vi.useFakeTimers();
    rpcImpl = () => new Promise(() => { /* never settles */ });
    const p = recordStreakActivity("game", "g3");
    await vi.advanceTimersByTimeAsync(STREAK_RPC_TIMEOUT_MS + 10);
    const out = await p;
    expect(out.ok).toBe(false);
    expect((out as { queued?: boolean }).queued).toBe(true);
    expect(removed).toHaveLength(0);
  });

  it("does not discard the mutation while offline", async () => {
    const nav = globalThis.navigator as { onLine?: boolean } | undefined;
    const prev = nav?.onLine;
    if (nav) Object.defineProperty(nav, "onLine", { value: false, configurable: true });
    rpcImpl = async () => ({ data: null, error: { message: "network" } });
    const out = await recordStreakActivity("game", "g4");
    expect(enqueued).toHaveLength(1);
    expect(out.ok).toBe(false);
    expect(removed).toHaveLength(0);
    if (nav && prev !== undefined) Object.defineProperty(nav, "onLine", { value: prev, configurable: true });
  });

  it("uses one stable id per (user, day) so replays cannot double-count", async () => {
    await recordStreakActivity("game", "a");
    await recordStreakActivity("investigation", "b");
    expect(enqueued[0]!.id).toBe(enqueued[1]!.id);
  });

  it("guests never enqueue or call the server", async () => {
    const mod = await import("@/integrations/supabase/client");
    const orig = mod.supabase.auth.getUser;
    (mod.supabase.auth as { getUser: unknown }).getUser = async () => ({ data: { user: null } });
    const out = await recordStreakActivity("game", "g5");
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toBe("unauthenticated");
    expect(enqueued).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    (mod.supabase.auth as { getUser: unknown }).getUser = orig;
  });
});
