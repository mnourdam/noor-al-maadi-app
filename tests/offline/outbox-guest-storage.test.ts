import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  getActiveOwner,
  setActiveOwnerInternal,
  __resetIdentityForTests,
} from "@/lib/identity/owner";
import {
  installIdentityPartition,
  __uninstallPartitionForTests,
  physicalKey,
} from "@/lib/identity/partition";
import { guestMarkCompleted, guestCompletionsSnapshot } from "@/lib/stories/guestCompletions";
import { addGuestCompletion, readGuestCompletedIds } from "@/lib/games/guestCompletions";
import {
  GUEST_BUFFER_KEY,
  bufferChapterProgress,
  readGuestBuffer,
  promoteGuestProgress,
} from "@/lib/campaigns/guest-progress-buffer";
const env = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/offline/gameplay-write", () => ({
  saveUserId: (...a: unknown[]) => env.session(...a),
  saveGameplay: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/offline/outbox", () => ({ enqueue: vi.fn(), enqueueWithId: vi.fn() }));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: vi.fn() }));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));
import { recordChapterProgress } from "@/lib/offline/record";
const methods = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
function locks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, _opts: unknown, work: () => unknown) => {
      const next = (tails.get(name) ?? Promise.resolve()).then(work);
      tails.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const storyKey = "irth.guest.storyCompletions.v1",
  gameKey = "irth.game-completions.guest.v1";
const chapter = {
  campaignId: "c",
  chapterId: "ch",
  status: "completed" as const,
  completed: true,
  xpEarned: 10,
};
function address(key: string, owner = getActiveOwner()) {
  return physicalKey(key, owner);
}
function raw(key: string, owner = getActiveOwner()) {
  return methods.getItem.call(localStorage, address(key, owner));
}
function seed(key: string, value: string) {
  methods.setItem.call(localStorage, address(key), value);
}
function failWrite(name = "QuotaExceededError") {
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("unavailable", name);
  });
}
function bufferFixture(boundUid: string | null = null) {
  return { boundUid, entries: { "c::ch": { ...chapter, bufferedAt: "2026-11-05T00:00:00Z" } } };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  localStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("guest:synthetic");
  installIdentityPartition();
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks() });
  env.session.mockReset().mockResolvedValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  vi.unstubAllGlobals();
});
for (const [name, key, save, read] of [
  ["story", storyKey, guestMarkCompleted, guestCompletionsSnapshot],
  ["game", gameKey, addGuestCompletion, readGuestCompletedIds],
] as const)
  describe(`${name} durable storage truth`, () => {
    it.each(["QuotaExceededError", "SecurityError"])(
      "%s write never grants firstTime or emits completion",
      async (error) => {
        const event = vi.fn();
        window.addEventListener(
          name === "story" ? "irth:guest-story-completed" : "irth:guest-completions-changed",
          event,
        );
        const spy = failWrite(error);
        expect(await save("new")).toMatchObject({
          saved: false,
          firstTime: false,
          reason: "write_failed",
        });
        expect(await save("new")).toMatchObject({ saved: false, firstTime: false });
        expect(event).not.toHaveBeenCalled();
        expect(raw(key)).toBeNull();
        spy.mockRestore();
        window.removeEventListener(
          name === "story" ? "irth:guest-story-completed" : "irth:guest-completions-changed",
          event,
        );
      },
    );
    it("SecurityError reading retains old history without replacing it", async () => {
      seed(key, '["old"]');
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
      expect(() => read()).toThrow("read_failed");
      expect(await save("new")).toMatchObject({ saved: false, reason: "read_failed" });
      spy.mockRestore();
      expect(raw(key)).toBe('["old"]');
    });
    it.each(["{broken", "{}", '["old",7]', ""])(
      "corrupt %s is not a trusted empty set",
      async (value) => {
        seed(key, value);
        expect(() => read()).toThrow("corrupt");
        expect(await save("new")).toMatchObject({
          saved: false,
          firstTime: false,
          reason: "corrupt",
        });
        expect(raw(key)).toBe(value);
      },
    );
    it("missing key is distinct; successful save/replay/restart retains all old IDs", async () => {
      expect(read().size).toBe(0);
      seed(key, '["old"]');
      expect(await save("new")).toEqual({ saved: true, firstTime: true });
      expect(await save("new")).toEqual({ saved: true, firstTime: false });
      __uninstallPartitionForTests();
      installIdentityPartition();
      expect([...read()].sort()).toEqual(["new", "old"]);
    });
    it("failed write can be retried after storage recovery", async () => {
      seed(key, '["old"]');
      const spy = failWrite();
      expect((await save("new")).saved).toBe(false);
      spy.mockRestore();
      expect(await save("new")).toEqual({ saved: true, firstTime: true });
      expect([...read()].sort()).toEqual(["new", "old"]);
    });
    it("two independent lock scopes serialize same-ID and preserve distinct-ID writes", async () => {
      const same = await Promise.all([save("a"), save("a")]);
      expect(same.filter((r) => r.firstTime)).toHaveLength(1);
      await Promise.all([save("b"), save("c")]);
      expect([...read()].sort()).toEqual(["a", "b", "c"]);
    });
    it("no coordination means fail closed, not a fake localStorage CAS", async () => {
      Object.defineProperty(navigator, "locks", { value: undefined });
      expect(await save("a")).toMatchObject({ saved: false, reason: "coordination_unavailable" });
      expect(raw(key)).toBeNull();
    });
    it("guest→user while waiting for lock never writes either account", async () => {
      const gate = deferred<void>();
      Object.defineProperty(navigator, "locks", {
        value: { request: (_n: string, _o: unknown, fn: () => unknown) => gate.promise.then(fn) },
      });
      const pending = save("a");
      setActiveOwnerInternal("user:alice");
      gate.resolve();
      expect(await pending).toMatchObject({ saved: false, reason: "identity_changed" });
      expect(raw(key, "guest:synthetic")).toBeNull();
      expect(raw(key, "user:alice")).toBeNull();
    });
    it("user cannot use the guest writer; returning guest retains its own completion", async () => {
      await save("a");
      setActiveOwnerInternal("user:alice");
      expect(await save("b")).toMatchObject({ saved: false, reason: "not_guest" });
      expect(() => read()).toThrow("not_guest");
      setActiveOwnerInternal("guest:synthetic");
      expect([...read()]).toEqual(["a"]);
    });
  });
describe("guest campaign buffer storage and promotion", () => {
  it("buffer success is explicit and merges monotonically", async () => {
    expect(await bufferChapterProgress(chapter)).toEqual({ saved: true });
    await bufferChapterProgress({ ...chapter, status: "unlocked", completed: false, xpEarned: 2 });
    expect(readGuestBuffer().entries["c::ch"]).toMatchObject({
      completed: true,
      status: "completed",
      xpEarned: 10,
    });
  });
  it("existing buffer survives quota on an update", async () => {
    await bufferChapterProgress(chapter);
    const before = raw(GUEST_BUFFER_KEY);
    failWrite();
    expect(await bufferChapterProgress({ ...chapter, chapterId: "next" })).toMatchObject({
      saved: false,
      reason: "write_failed",
    });
    expect(raw(GUEST_BUFFER_KEY)).toBe(before);
  });
  it.each(["{bad", "null", '{"boundUid":null,"entries":[]}'])(
    "buffer corruption %s is never empty or overwritten",
    async (value) => {
      seed(GUEST_BUFFER_KEY, value);
      expect(() => readGuestBuffer()).toThrow("corrupt");
      expect((await bufferChapterProgress(chapter)).saved).toBe(false);
      expect(raw(GUEST_BUFFER_KEY)).toBe(value);
    },
  );
  it("record reports buffered_no_session only after a confirmed save", async () => {
    expect((await recordChapterProgress(chapter)).reason).toBe("buffered_no_session");
    const before = raw(GUEST_BUFFER_KEY);
    failWrite();
    expect((await recordChapterProgress({ ...chapter, chapterId: "two" })).reason).toBe(
      "write_failed",
    );
    expect(raw(GUEST_BUFFER_KEY)).toBe(before);
  });
  it("session await changing identity cannot buffer stale guest progress", async () => {
    const gate = deferred<null>();
    env.session.mockReturnValueOnce(gate.promise);
    const pending = recordChapterProgress(chapter);
    setActiveOwnerInternal("user:alice");
    gate.resolve(null);
    expect((await pending).reason).toBe("identity_changed");
    expect(raw(GUEST_BUFFER_KEY, "guest:synthetic")).toBeNull();
    expect(raw(GUEST_BUFFER_KEY)).toBeNull();
  });
  it("bind failure prevents send and retains the original buffer", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    const before = raw(GUEST_BUFFER_KEY),
      send = vi.fn();
    failWrite();
    expect(await promoteGuestProgress("alice", send)).toMatchObject({
      promoted: 0,
      remaining: null,
      reason: "write_failed",
    });
    expect(send).not.toHaveBeenCalled();
    expect(raw(GUEST_BUFFER_KEY)).toBe(before);
  });
  it("successful server ack plus cleanup failure retains a durably bound entry for retry", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    let fail: ReturnType<typeof failWrite>;
    const send = vi.fn(async () => {
      fail = failWrite();
      return { acknowledged: true };
    });
    expect(await promoteGuestProgress("alice", send)).toMatchObject({
      promoted: 0,
      reason: "write_failed",
    });
    expect(readGuestBuffer()).toMatchObject({
      boundUid: "alice",
      entries: { "c::ch": expect.anything() },
    });
    fail!.mockRestore();
    expect(await promoteGuestProgress("alice", async () => ({ acknowledged: true }))).toEqual({
      promoted: 1,
      remaining: 0,
    });
  });
  it("boundUid never rebinds to another account", async () => {
    setActiveOwnerInternal("user:bob");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture("alice")));
    const before = raw(GUEST_BUFFER_KEY),
      send = vi.fn();
    expect((await promoteGuestProgress("bob", send)).reason).toBe("identity_conflict");
    expect(send).not.toHaveBeenCalled();
    expect(raw(GUEST_BUFFER_KEY)).toBe(before);
  });
  it("guest partition is never implicitly imported into a signed account", async () => {
    await bufferChapterProgress(chapter);
    const before = raw(GUEST_BUFFER_KEY);
    setActiveOwnerInternal("user:alice");
    const send = vi.fn();
    expect((await promoteGuestProgress("alice", send)).reason).toBe("empty");
    expect(send).not.toHaveBeenCalled();
    expect(raw(GUEST_BUFFER_KEY, "guest:synthetic")).toBe(before);
  });
  it("identity changes during send retain old entry and prevent cleanup/new sends", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    const gate = deferred<{ acknowledged: boolean }>(),
      started = deferred<void>();
    const pending = promoteGuestProgress("alice", () => {
      started.resolve();
      return gate.promise;
    });
    await started.promise;
    setActiveOwnerInternal("user:bob");
    gate.resolve({ acknowledged: true });
    expect((await pending).reason).toBe("identity_changed");
    expect(JSON.parse(raw(GUEST_BUFFER_KEY, "user:alice")!).entries["c::ch"]).toBeTruthy();
    expect(raw(GUEST_BUFFER_KEY)).toBeNull();
  });
  it("a changed entry during send is retained instead of deleting a newer snapshot", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    const result = await promoteGuestProgress("alice", async () => {
      const current = readGuestBuffer();
      current.entries["c::ch"].score = 999;
      seed(GUEST_BUFFER_KEY, JSON.stringify(current));
      return { acknowledged: true };
    });
    expect(result).toMatchObject({ promoted: 0, remaining: 1, reason: "entry_changed" });
    expect(readGuestBuffer().entries["c::ch"].score).toBe(999);
  });
  it("corrupt evidence found after send is preserved without a false cleanup", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    const result = await promoteGuestProgress("alice", async () => {
      seed(GUEST_BUFFER_KEY, "{damaged");
      return { acknowledged: true };
    });
    expect(result).toMatchObject({ promoted: 0, remaining: null, reason: "corrupt" });
    expect(raw(GUEST_BUFFER_KEY)).toBe("{damaged");
  });
  it("failed read during promotion is unknown, not empty", async () => {
    setActiveOwnerInternal("user:alice");
    seed(GUEST_BUFFER_KEY, JSON.stringify(bufferFixture()));
    const send = vi.fn();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(await promoteGuestProgress("alice", send)).toMatchObject({
      promoted: 0,
      remaining: null,
      reason: "read_failed",
    });
    expect(send).not.toHaveBeenCalled();
  });
});
