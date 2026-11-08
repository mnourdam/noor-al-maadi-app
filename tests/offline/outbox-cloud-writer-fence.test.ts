import { beforeEach, it, expect, vi } from "vitest";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
const env = vi.hoisted(() => ({
  uid: "alice",
  session: vi.fn(),
  rpc: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(),
  updateUser: vi.fn(),
  union: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => env.session(),
      updateUser: (...args: any[]) => env.updateUser(...args),
    },
    rpc: (...args: any[]) => env.rpc(...args),
    from: () => {
      const query: any = { select: () => query, eq: () => query, maybeSingle: () => env.read() };
      return { ...query, upsert: (...args: any[]) => env.upsert(...args), update: () => query };
    },
  },
}));
vi.mock("@/lib/campaigns/completions", () => ({
  unionCompletedIds: (...args: any[]) => env.union(...args),
}));
import { pushPublicStats } from "@/lib/social";
import { fetchAccountProfile, fetchCloudSave, pushSave, updateDisplayName } from "@/lib/cloud-save";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  env.uid = "alice";
  env.session.mockImplementation(async () => ({ data: { session: { user: { id: env.uid } } } }));
  env.rpc.mockResolvedValue({ data: { id: "alice" }, error: null });
  env.read.mockResolvedValue({ data: null, error: null });
  env.upsert.mockResolvedValue({ error: null });
  env.updateUser.mockResolvedValue({ data: {}, error: null });
});
it("foreign user IDs never start a cloud write", async () => {
  expect(await pushSave("bob", { points: 100 } as any)).toBe(false);
  expect(env.upsert).not.toHaveBeenCalled();
});
it("a failed read throws instead of becoming a missing-cloud seed", async () => {
  env.read.mockResolvedValue({ data: null, error: new Error("read-failed") });
  await expect(fetchCloudSave("alice")).rejects.toThrow("read-failed");
  expect(env.upsert).not.toHaveBeenCalled();
});
for (const lag of [false, true])
  it(
    "profile fetch cannot start email RPC after identity changes" + (lag ? " with owner lag" : ""),
    async () => {
      const gate = deferred<any>();
      env.rpc.mockReturnValueOnce(gate.promise);
      const pending = fetchAccountProfile("alice");
      await vi.waitFor(() => expect(env.rpc).toHaveBeenCalledTimes(1));
      env.uid = "bob";
      if (!lag) setActiveOwnerInternal("user:bob");
      gate.resolve({ data: { id: "alice" }, error: null });
      expect(await pending).toBeNull();
      expect(env.rpc).toHaveBeenCalledTimes(1);
    },
  );
it("push pins its input before the first asynchronous session check", async () => {
  const gate = deferred<any>();
  env.session.mockReturnValueOnce(gate.promise);
  const value: any = { points: 100 };
  const pending = pushSave("alice", value);
  value.points = 999;
  gate.resolve({ data: { session: { user: { id: "alice" } } } });
  expect(await pending).toBe(true);
  expect(env.upsert.mock.calls[0][0].data.points).toBe(100);
});
it("late committed push after ABA is not acknowledged or replayed", async () => {
  const gate = deferred<any>();
  env.upsert.mockReturnValueOnce(gate.promise);
  const pending = pushSave("alice", { points: 100 } as any);
  await vi.waitFor(() => expect(env.upsert).toHaveBeenCalledTimes(1));
  setActiveOwnerInternal("user:bob");
  setActiveOwnerInternal("user:alice");
  gate.resolve({ error: null });
  expect(await pending).toBe(false);
  expect(env.upsert).toHaveBeenCalledTimes(1);
});
it("display-name RPC completion cannot trigger metadata writes for the next session", async () => {
  const gate = deferred<any>();
  env.rpc.mockReturnValueOnce(gate.promise);
  const pending = updateDisplayName("Alice");
  await vi.waitFor(() => expect(env.rpc).toHaveBeenCalledTimes(1));
  env.uid = "bob";
  gate.resolve({ data: "Alice", error: null });
  expect(await pending).toMatchObject({ ok: false, error: "identity_changed" });
  expect(env.updateUser).not.toHaveBeenCalled();
});
it("late cloud read for an obsolete epoch is not accepted as missing", async () => {
  const gate = deferred<any>();
  env.read.mockReturnValueOnce(gate.promise);
  const pending = fetchCloudSave("alice");
  await vi.waitFor(() => expect(env.read).toHaveBeenCalledTimes(1));
  setActiveOwnerInternal("user:bob");
  setActiveOwnerInternal("user:alice");
  gate.resolve({ data: null, error: null });
  await expect(pending).rejects.toThrow("identity_changed");
});
it("owner-reset lag cannot send Alice's snapshot using Bob's SDK session", async () => {
  env.uid = "bob";
  expect(await pushSave("alice", { points: 100 } as any)).toBe(false);
  expect(env.upsert).not.toHaveBeenCalled();
});

function publicFixture(): any {
  return {
    points: 100,
    dinars: 500,
    hearts: 3,
    charactersUnlocked: [],
    artifactsFound: [],
    titlesEarned: [],
    campaignsCompleted: [],
  };
}
it("public stats cannot start its RPC after the canonical-count await crosses identity", async () => {
  const gate = deferred<Set<string>>();
  env.union.mockReturnValueOnce(gate.promise);
  const pending = pushPublicStats("alice", publicFixture());
  await vi.waitFor(() => expect(env.union).toHaveBeenCalled());
  env.uid = "bob";
  setActiveOwnerInternal("user:bob");
  gate.resolve(new Set());
  await pending;
  expect(env.rpc).not.toHaveBeenCalled();
});
it("public stats honors its caller's revision revocation after an internal await", async () => {
  const gate = deferred<Set<string>>();
  env.union.mockReturnValueOnce(gate.promise);
  let current = true;
  const pending = pushPublicStats("alice", publicFixture(), () => current);
  await vi.waitFor(() => expect(env.union).toHaveBeenCalled());
  current = false;
  gate.resolve(new Set());
  await pending;
  expect(env.rpc).not.toHaveBeenCalled();
});
it("public stats derives the exact pinned snapshot without replaying a reward", async () => {
  const gate = deferred<Set<string>>();
  env.union.mockReturnValueOnce(gate.promise);
  const data = publicFixture(),
    pending = pushPublicStats("alice", data);
  data.points = 999;
  await vi.waitFor(() => expect(env.union).toHaveBeenCalled());
  gate.resolve(new Set());
  await pending;
  expect(env.rpc).toHaveBeenCalledExactlyOnceWith(
    "sync_my_public_stats",
    expect.objectContaining({
      p_stats: expect.objectContaining({ xp: 100 }),
    }),
  );
});

it("display name never starts using another SDK owner while identity reset lags", async () => {
  env.uid = "bob";
  expect(await updateDisplayName("Alice")).toMatchObject({ ok: false, error: "identity_changed" });
  expect(env.rpc).not.toHaveBeenCalled();
  expect(env.updateUser).not.toHaveBeenCalled();
});
