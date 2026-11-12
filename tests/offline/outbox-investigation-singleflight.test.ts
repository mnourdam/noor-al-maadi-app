import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({
  uid: "alice",
  epoch: 0,
  rpc: vi.fn(),
  auth: vi.fn(),
  activeUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: state.auth }, rpc: state.rpc },
}));
vi.mock("@/lib/identity/owner", () => ({
  getActiveOwner: () => `user:${state.uid}`,
  getActiveUserId: state.activeUser,
  getIdentityEpoch: () => state.epoch,
  onOwnerChange: () => () => {},
}));
vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localInvestigations: () => [],
}));
vi.mock("@/lib/profile", () => ({ useProfile: () => ({ profile: {} }) }));
const session = () => ({ data: { session: { user: { id: state.uid } } } });
const success = { data: { ok: true, applied: true, xp_earned: 5 }, error: null };
const input = { investigationId: "inv", score: 2, correctCount: 1 };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.resetModules();
  state.uid = "alice";
  state.epoch = 0;
  state.activeUser.mockReset().mockImplementation(() => state.uid);
  state.rpc.mockReset().mockResolvedValue(success);
  state.auth.mockReset().mockImplementation(async () => session());
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    onLine: true,
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
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function recorder() {
  return (await import("@/lib/investigations/progress")).recordInvestigationCompletion;
}
it("coalesces before independent hash latency can outlive the first RPC", async () => {
  const hashes: ReturnType<typeof deferred<ArrayBuffer>>[] = [];
  vi.stubGlobal("crypto", {
    randomUUID: () => `id-${Math.random()}`,
    subtle: {
      digest: vi.fn(() => {
        const d = deferred<ArrayBuffer>();
        hashes.push(d);
        return d.promise;
      }),
    },
  });
  const run = await recorder();
  const first = run(input);
  await tick();
  expect(hashes).toHaveLength(1);
  const second = run(input);
  await tick();
  hashes[0].resolve(new Uint8Array(32).buffer);
  expect((await first).acknowledged).toBe(true);
  if (hashes[1]) hashes[1].resolve(new Uint8Array(32).buffer);
  expect((await second).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("coalesces before delayed second authentication can outlive the first request", async () => {
  let gate = true;
  const waits: ReturnType<typeof deferred<ReturnType<typeof session>>>[] = [];
  state.auth.mockImplementation(() => {
    if (!gate) return Promise.resolve(session());
    const d = deferred<ReturnType<typeof session>>();
    waits.push(d);
    return d.promise;
  });
  const run = await recorder();
  const first = run(input),
    second = run(input);
  await tick();
  gate = false;
  waits[0].resolve(session());
  expect((await first).acknowledged).toBe(true);
  if (waits[1]) waits[1].resolve(session());
  expect((await second).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("does not cache completed operations or failures", async () => {
  const run = await recorder();
  state.rpc.mockRejectedValueOnce(new Error("offline"));
  expect((await run(input)).acknowledged).toBe(false);
  expect((await run(input)).acknowledged).toBe(true);
  expect((await run(input)).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(3);
});
it("does not coalesce distinct normalized payloads", async () => {
  const wait = deferred<ReturnType<typeof session>>();
  let firstAuth = true;
  state.auth.mockImplementation(() => {
    if (firstAuth) {
      firstAuth = false;
      return wait.promise;
    }
    return Promise.resolve(session());
  });
  const run = await recorder();
  const first = run(input);
  const second = await run({ ...input, score: 9 });
  expect(second.acknowledged).toBe(true);
  wait.resolve(session());
  expect((await first).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(2);
  expect(state.rpc.mock.calls.map((call) => call[1].p_score).sort()).toEqual([2, 9]);
});
it("old ABA request cannot join or clear a newer epoch request", async () => {
  const oldAuth = deferred<ReturnType<typeof session>>(),
    newAuth = deferred<ReturnType<typeof session>>();
  state.auth
    .mockImplementationOnce(() => oldAuth.promise)
    .mockImplementationOnce(() => newAuth.promise);
  const run = await recorder();
  const old = run(input);
  await tick();
  state.uid = "bob";
  state.epoch++;
  state.uid = "alice";
  state.epoch++;
  const fresh = run(input);
  await tick();
  oldAuth.resolve(session());
  expect((await old).acknowledged).toBe(false);
  const duplicate = run(input);
  await tick();
  newAuth.resolve(session());
  expect((await fresh).acknowledged).toBe(true);
  expect((await duplicate).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("equivalent normalized inputs share work and captured values cannot mutate", async () => {
  const wait = deferred<ReturnType<typeof session>>();
  state.auth.mockImplementationOnce(() => wait.promise);
  const run = await recorder();
  const mutable = { ...input, score: -1, correctCount: -3 };
  const first = run(mutable),
    second = run({ ...input, score: 0, correctCount: 0 });
  mutable.score = 99;
  mutable.investigationId = "other";
  wait.resolve(session());
  await Promise.all([first, second]);
  expect(state.rpc).toHaveBeenCalledTimes(1);
  expect(state.rpc).toHaveBeenCalledWith(
    "complete_investigation_v2",
    expect.objectContaining({ p_investigation_id: "inv", p_score: 0, p_correct_count: 0 }),
  );
});
it("publishes the slot before synchronous auth-hook reentry", async () => {
  const run = await recorder();
  let reentered: ReturnType<typeof run> | undefined;
  state.auth.mockImplementationOnce(() => {
    reentered = run(input);
    return Promise.resolve(session());
  });
  const first = run(input);
  expect(reentered).toBe(first);
  await first;
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("does not share an old owner's pending preparation with a new account", async () => {
  const wait = deferred<ReturnType<typeof session>>();
  state.auth.mockImplementationOnce(() => wait.promise);
  const run = await recorder();
  const old = run(input);
  state.uid = "bob";
  state.epoch++;
  expect((await run(input)).acknowledged).toBe(true);
  wait.resolve({ data: { session: { user: { id: "alice" } } } });
  expect((await old).acknowledged).toBe(false);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
it("reads input getters once and preserves promise rejection for throwing input", async () => {
  const run = await recorder();
  let reads = 0;
  const value = {
    investigationId: "inv",
    get score() {
      reads++;
      return 2;
    },
  };
  expect((await run(value)).acknowledged).toBe(true);
  expect(reads).toBe(1);
  const bad = {
    investigationId: "inv",
    get score(): number {
      throw new Error("input-access");
    },
  };
  let result!: ReturnType<typeof run>;
  expect(() => {
    result = run(bad);
  }).not.toThrow();
  await expect(result).rejects.toThrow("input-access");
  expect((await run(input)).acknowledged).toBe(true);
});

it("clears a published slot when the underlying recorder rejects", async () => {
  const run = await recorder();
  state.activeUser.mockImplementationOnce(() => {
    throw new Error("identity-read-fault");
  });
  const first = run(input),
    duplicate = run(input);
  expect(duplicate).toBe(first);
  const outcomes = await Promise.allSettled([first, duplicate]);
  expect(outcomes).toHaveLength(2);
  for (const outcome of outcomes) {
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") expect(outcome.reason.message).toBe("identity-read-fault");
  }
  expect(state.rpc).not.toHaveBeenCalled();
  expect((await run(input)).acknowledged).toBe(true);
  expect(state.rpc).toHaveBeenCalledTimes(1);
});
