import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
const rawMethods = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
const state = vi.hoisted(() => ({ uid: "alice", readError: false, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.uid } } } }) },
    rpc: (...a: any[]) => state.rpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (state.readError) throw new Error("offline");
              return { data: null };
            },
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/daily-quest", () => ({ notifyQuestProgress: () => {} }));
function locks() {
  const tails = new Map();
  return {
    request: (name: any, opts: any, run: any) => {
      const p = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(
        name,
        p.catch(() => {}),
      );
      return p;
    },
  };
}
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks() });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  state.uid = "alice";
  state.readError = false;
  state.rpc.mockReset();
  const owner = await import("@/lib/identity/owner");
  owner.setActiveOwnerInternal("user:alice");
});
afterEach(async () => {
  const p = await import("@/lib/identity/partition");
  p.__uninstallPartitionForTests();
  Object.assign(Storage.prototype, rawMethods);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("audit reproductions — assertions describe observed defects, not acceptance", () => {
  it("[R1] Dead-Letter becomes unreadable after first archive with the real identity partition", async () => {
    const p = await import("@/lib/identity/partition");
    p.installIdentityPartition();
    const o = await import("@/lib/offline/outbox");
    const d = await import("@/lib/offline/dead-letter");
    const receipt = await o.enqueueWithId("alice", "one", "story_completion", { storyId: "one" });
    expect(await d.archiveRejected(receipt, "story_not_found")).toBe(true);
    expect(() => d.listDeadLetters("alice")).toThrow("dead-letter-key-mismatch");
    const next = await o.enqueueWithId("alice", "two", "story_completion", { storyId: "two" });
    await expect(d.archiveRejected(next, "story_not_found")).rejects.toThrow(
      "dead-letter-key-mismatch",
    );
    expect((await o.peekAll("alice")).map((r) => r.id)).toEqual(["two"]);
  });
  it("[R2] a local accepted chapter may later be rejected permanently", async () => {
    const g = await import("@/lib/offline/gameplay-write");
    const o = await import("@/lib/offline/outbox");
    const f = await import("@/lib/offline/flush");
    const d = await import("@/lib/offline/dead-letter");
    const outcome = await g.saveGameplay({
      userId: "alice",
      id: "chapter",
      kind: "chapter_progress",
      payload: { campaignId: "invalid", chapterId: "c" },
      rpc: async () => ({ data: { ok: true }, error: null }),
    });
    expect(g.saveAccepted(outcome)).toBe(true);
    expect(outcome.acknowledged).toBe(false);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    state.rpc.mockResolvedValue({
      data: { ok: false, reason: "invalid_campaign_id" },
      error: null,
    });
    expect(await f.flushOutbox("alice")).toEqual({ flushed: 0, failed: 1 });
    expect(await o.peekAll("alice")).toEqual([]);
    expect(d.listDeadLetters("alice")).toHaveLength(1);
  });
  it("[R3] after a crash between durable game completion and UI grant, restart suppresses the ungranted reward", async () => {
    const o = await import("@/lib/offline/outbox");
    await o.enqueueWithId("alice", "game_complete:alice:g", "game_complete", {
      gameId: "g",
      stageIndex: 0,
      score: 2,
    });
    // no profile reward was granted before the process stopped; reload gameplay module
    const g = await import("@/lib/games/progress");
    const result = await g.recordCompletion("g", 0, 2);
    expect(result).toEqual({ firstTime: false, saved: true });
  });
  it("[R4] a delayed older enqueue overwrites a newer durable payload after a context pause without Web Locks", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const o = await import("@/lib/offline/outbox");
    await o.enqueueWithId("alice", "x", "story_progress", { scene: 0 });
    let resume!: () => void;
    let paused!: () => void;
    const reached = new Promise<void>((r) => (paused = r));
    let intercepted = false;
    const original = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      ...args: any[]
    ) {
      const tx = original.apply(this, args as any);
      if (!intercepted && args[1] === "readonly") {
        intercepted = true;
        let handler: any;
        Object.defineProperty(tx, "oncomplete", {
          configurable: true,
          set(fn) {
            handler = fn;
          },
          get() {
            return null;
          },
        });
        tx.addEventListener("complete", (ev) => {
          resume = () => handler?.call(tx, ev);
          paused();
        });
      }
      return tx;
    });
    const g = await import("@/lib/offline/gameplay-write");
    const old = g.saveGameplay({
      userId: "alice",
      id: "x",
      kind: "story_progress",
      payload: { scene: 1 },
      rpc: async () => ({ data: { ok: true }, error: null }),
    });
    await reached;
    spy.mockRestore();
    const timedOut = await old;
    expect(timedOut).toMatchObject({ acknowledged: false, queued: false });
    vi.resetModules();
    const newer = await import("@/lib/offline/outbox");
    const fresh = await newer.enqueueWithId("alice", "x", "story_progress", { scene: 9 });
    resume();
    await new Promise((r) => setTimeout(r, 40));
    const late = (await newer.peekAll("alice"))[0];
    expect(late.supersedes).toBe(fresh.revision);
    expect(late.payload).toEqual({ scene: 1 });
  }, 15000);
  it("[R5] an enqueue waiting across account switch persists Alice fallback in Bob namespace", async () => {
    const partition = await import("@/lib/identity/partition");
    partition.installIdentityPartition();
    const owner = await import("@/lib/identity/owner");
    const o = await import("@/lib/offline/outbox");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: (_name: any, _opts: any, run: any) => gate.then(run) },
    });
    vi.stubGlobal("indexedDB", undefined);
    const writing = o.enqueueWithId("alice", "stranded", "story_completion", { storyId: "s" });
    owner.setActiveOwnerInternal("user:bob");
    state.uid = "bob";
    release();
    await writing;
    const bobPhysical = partition.physicalKey("irth.outbox.fallback.v1", "user:bob");
    expect(JSON.parse(localStorage.getItem(bobPhysical)!)[0].userId).toBe("alice");
    owner.setActiveOwnerInternal("user:alice");
    state.uid = "alice";
    vi.stubGlobal("indexedDB", new IDBFactory());
    expect(await o.peekAll("alice")).toEqual([]);
  });
  it("[R6] guest completion helpers report firstTime repeatedly after storage failure", async () => {
    const stories = await import("@/lib/stories/guestCompletions");
    const games = await import("@/lib/games/guestCompletions");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(stories.guestMarkCompleted("s")).toBe(true);
    expect(stories.guestMarkCompleted("s")).toBe(true);
    expect(games.addGuestCompletion("g").firstTime).toBe(true);
    expect(games.addGuestCompletion("g").firstTime).toBe(true);
  });
  it("[R7] restarted game with no pending row treats failed server read as a new reward", async () => {
    let g = await import("@/lib/games/progress");
    expect((await g.recordCompletion("g", 0, 2)).firstTime).toBe(true);
    const o = await import("@/lib/offline/outbox");
    const receipt = (await o.peekAll("alice"))[0];
    await o.remove(receipt.id, receipt);
    // Simulate a completed server handoff, then cold restart with an unreadable server row.
    vi.resetModules();
    state.readError = true;
    g = await import("@/lib/games/progress");
    expect((await g.recordCompletion("g", 0, 2)).firstTime).toBe(true);
  });
  it("[R8] campaign reward ledger claims before any profile grant and cannot replay that ungranted claim", async () => {
    const ledger = await import("@/lib/campaignLedger");
    const chapter = { id: "c", activities: [], rewards: { xp: 10, coins: 2 } } as any;
    const campaign = { id: "p", chapters: [chapter] } as any;
    expect(ledger.claimChapterReward(campaign, chapter).granted).toBe(true);
    // Process stops before addPoints/addDinars; restart still sees claimed, no pending reward intent.
    vi.resetModules();
    const restarted = await import("@/lib/campaignLedger");
    expect(restarted.claimChapterReward(campaign, chapter).granted).toBe(false);
  });
});
