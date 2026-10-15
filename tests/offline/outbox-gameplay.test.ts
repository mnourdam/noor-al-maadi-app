import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({ uid: "u1", epoch: 0, rpc: vi.fn(), mirror: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: state.uid ? { user: { id: state.uid } } : null },
      }),
      getUser: async () => ({ data: { user: state.uid ? { id: state.uid } : null } }),
    },
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));
vi.mock("@/lib/identity/owner", () => ({
  getIdentityEpoch: () => state.epoch,
  getActiveUserId: () => state.uid,
  getActiveOwner: () => state.uid,
}));
vi.mock("@/lib/profile", () => ({ useProfile: () => ({ profile: {} }) }));
vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localInvestigations: () => [],
}));
vi.mock("@/lib/stories/progress-mirror", () => ({
  markCompleted: state.mirror,
  upsertProgress: state.mirror,
}));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));

let store: Storage;
function lockService() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, _options: unknown, run: () => unknown) => {
      const promise = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(
        name,
        promise.catch(() => {}),
      );
      return promise;
    },
  };
}
beforeEach(() => {
  vi.resetModules();
  state.uid = "u1";
  state.epoch = 0;
  state.mirror.mockReset();
  state.rpc.mockReset().mockImplementation(async (name: string) => ({
    data: {
      ok: true,
      applied: true,
      reward_granted_xp: 5,
      reward_granted_dinars: 2,
      xp_earned: 5,
      dinars_earned: 2,
      hearts_earned: 1,
      newly_recorded_day: true,
      grants: [],
    },
    error: null,
  }));
  localStorage.clear();
  store = localStorage;
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("navigator", { onLine: true, locks: lockService() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function callers(): Promise<Array<{ name: string; kind: string; run: () => Promise<any> }>> {
  const story = await import("../../src/lib/stories/progress");
  const investigation = await import("../../src/lib/investigations/progress");
  const chapter = await import("../../src/lib/offline/record");
  const tutorial = await import("../../src/lib/tutorial/persistence");
  const streak = await import("../../src/lib/streak-activity");
  const campaign = await import("../../src/lib/campaigns/completions");
  return [
    {
      name: "story progress",
      kind: "story_progress",
      run: () => story.recordStoryProgress("s1", 2),
    },
    { name: "story completion", kind: "story_completion", run: () => story.completeStory("s1") },
    {
      name: "investigation",
      kind: "investigation_complete",
      run: () => investigation.recordInvestigationCompletion({ investigationId: "inv1", score: 2 }),
    },
    {
      name: "chapter",
      kind: "chapter_progress",
      run: () =>
        chapter.recordChapterProgress({
          campaignId: "c1",
          chapterId: "ch1",
          status: "completed",
          completed: true,
        }),
    },
    { name: "tutorial", kind: "tutorial_completion", run: () => tutorial.markCompleted(1) },
    {
      name: "streak",
      kind: "streak_activity",
      run: () => streak.recordStreakActivity("story", "s1"),
    },
    {
      name: "legacy campaign",
      kind: "campaign_completion",
      run: () =>
        campaign.recordCampaignCompletion({ campaignId: "c1", allowUnverifiedServerWrite: true }),
    },
  ];
}
const names = [
  "story progress",
  "story completion",
  "investigation",
  "chapter",
  "tutorial",
  "streak",
  "legacy campaign",
];
function acknowledged(out: any) {
  return out.acknowledged === true || out.ok === true;
}
const outbox = () => import("../../src/lib/offline/outbox");

describe("Phase D real gameplay recorders with fake storage/server", () => {
  it.each(names)("%s: enqueue then RPC success acknowledges the exact receipt", async (name) => {
    const caller = (await callers()).find((c) => c.name === name)!;
    const api = await outbox();
    const remove = vi.spyOn(api, "remove");
    expect(acknowledged(await caller.run())).toBe(true);
    expect(remove).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: "u1", kind: caller.kind, revision: expect.any(String) }),
    );
    expect(await api.peekAll("u1")).toEqual([]);
  });
  it.each(names)("%s: offline completion is queued only when durable", async (name) => {
    const caller = (await callers()).find((c) => c.name === name)!;
    Object.defineProperty(navigator, "onLine", { value: false });
    const result = await caller.run();
    expect(result.queued).toBe(true);
    expect(acknowledged(result)).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(await (await outbox()).peekAll("u1")).toHaveLength(1);
  });
  it.each(names)("%s: both storage and RPC failure never report queued or reward", async (name) => {
    const caller = (await callers()).find((c) => c.name === name)!;
    vi.stubGlobal("indexedDB", undefined);
    const original = store.setItem.bind(store);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (key === "irth.outbox.fallback.v1") throw new Error("quota");
      original(key, value);
    });
    state.rpc.mockRejectedValue(new Error("offline"));
    const result = await caller.run();
    expect(result.queued).toBe(false);
    expect(acknowledged(result)).toBe(false);
    expect("result" in result ? result.result : undefined).toBeUndefined();
    expect("xpEarned" in result ? result.xpEarned : 0).toBe(0);
    expect(state.mirror).not.toHaveBeenCalled();
  });
  it.each(names)("%s: double completion shares a single live request", async (name) => {
    const caller = (await callers()).find((c) => c.name === name)!;
    await Promise.all([caller.run(), caller.run()]);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["false", "throw"])(
    "remove %s retains pending data without invalidating the server acknowledgement",
    async (mode) => {
      const caller = (await callers())[1];
      const api = await outbox();
      const spy = vi.spyOn(api, "remove");
      if (mode === "false") spy.mockResolvedValue(false);
      else spy.mockRejectedValue(new Error("storage"));
      const result = await caller.run();
      expect(result.acknowledged).toBe(true);
      expect(result.queued).toBe(true);
      expect(await api.peekAll("u1")).toHaveLength(1);
    },
  );
  it("an old live acknowledgement cannot delete a newer revision", async () => {
    const caller = (await callers())[1];
    const api = await outbox();
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    let finish!: (v: any) => void;
    state.rpc.mockImplementationOnce(() => {
      start();
      return new Promise((r) => {
        finish = r;
      });
    });
    const pending = caller.run();
    await started;
    const newer = await api.enqueueWithId("u1", "story_completion:u1:s1", "story_completion", {
      storyId: "s1",
      newer: true,
    });
    finish({ data: { ok: true, reward_granted_xp: 0 }, error: null });
    const result = await pending;
    expect(result.acknowledged).toBe(true);
    expect(result.queued).toBe(true);
    expect(await api.peekAll("u1")).toEqual([newer]);
  });
  it.each(["investigation", "legacy campaign"])(
    "%s permanent refusal is archived, never acknowledged",
    async (name) => {
      const caller = (await callers()).find((c) => c.name === name)!;
      const reason = name === "investigation" ? "investigation_not_found" : "invalid_campaign_id";
      state.rpc.mockResolvedValue({ data: { ok: false, reason }, error: null });
      const result = await caller.run();
      expect(acknowledged(result)).toBe(false);
      expect(result.queued).toBe(false);
      expect(await (await outbox()).peekAll("u1")).toEqual([]);
      const { listDeadLetters } = await import("../../src/lib/offline/dead-letter");
      expect(listDeadLetters("u1")).toEqual([
        expect.objectContaining({ kind: caller.kind, reason }),
      ]);
    },
  );
  it.each(["investigation", "legacy campaign"])(
    "%s archive failure keeps the original pending operation",
    async (name) => {
      const caller = (await callers()).find((c) => c.name === name)!;
      state.rpc.mockResolvedValue({
        data: {
          ok: false,
          reason: name === "investigation" ? "investigation_not_found" : "invalid_campaign_id",
        },
        error: null,
      });
      const original = store.setItem.bind(store);
      vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
        if (key.startsWith("irth.outbox.dead-letter.v1:entry:")) throw new Error("quota");
        original(key, value);
      });
      const result = await caller.run();
      expect(acknowledged(result)).toBe(false);
      expect(result.queued).toBe(true);
      expect(await (await outbox()).peekAll("u1")).toHaveLength(1);
    },
  );
  it.each(names)("%s ignores an old account's late success", async (name) => {
    const caller = (await callers()).find((c) => c.name === name)!;
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    let finish!: (v: any) => void;
    state.rpc.mockImplementationOnce(() => {
      start();
      return new Promise((r) => {
        finish = r;
      });
    });
    const pending = caller.run();
    await started;
    state.uid = "u2";
    state.epoch++;
    finish({ data: { ok: true, reward_granted_xp: 5, applied: true, xp_earned: 5 }, error: null });
    expect(acknowledged(await pending)).toBe(false);
    expect(state.mirror).not.toHaveBeenCalled();
    expect(await (await outbox()).peekAll("u1")).toHaveLength(1);
    expect(await (await outbox()).peekAll("u2")).toEqual([]);
  });
  it("a hanging RPC has a finite UI budget and can be retried with the same operation id", async () => {
    const caller = (await callers())[1];
    // Persist first using a real IDB transaction; install fake timers only once RPC starts.
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    state.rpc.mockImplementationOnce(() => {
      vi.useFakeTimers();
      start();
      return new Promise(() => {});
    });
    const pending = caller.run();
    await started;
    await vi.advanceTimersByTimeAsync(8001);
    const outcome = await pending;
    expect(outcome.queued).toBe(true);
    expect(outcome.acknowledged).toBe(false);
    vi.useRealTimers();
    const rows = await (await outbox()).peekAll("u1");
    expect(rows).toHaveLength(1);
    await caller.run();
    expect(await (await outbox()).peekAll("u1")).toEqual([]);
  });
  it("failed daily-quest storage is not reported as queued", async () => {
    Object.defineProperty(navigator, "onLine", { value: false });
    vi.stubGlobal("indexedDB", undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { grantDailyQuestReward } = await import("../../src/lib/daily-quest-reward");
    const result = await grantDailyQuestReward({
      userId: "u1",
      localDate: "2026-10-15",
      entityId: "e1",
      xp: 5,
      dinars: 2,
    });
    expect(result.outcome).toBe("storage_error");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("campaign preview does not mutate prior progress and failed reads cannot overwrite it", async () => {
    const { recordActivity, PROGRESS_KEY } = await import("../../src/lib/importedCampaignProgress");
    const campaign = {
      id: "c1",
      chapters: [{ id: "ch1", activities: [{ id: "a1", xpReward: 5 }] }],
    } as any;
    const original = JSON.stringify({
      c1: {
        campaignId: "c1",
        chapters: {
          ch1: {
            completedActivityIds: ["old"],
            completed: false,
            xpEarned: 1,
            coinsEarned: 0,
            heartsLost: 0,
          },
        },
        totalXp: 1,
        totalCoins: 0,
        totalHeartsLost: 0,
        completed: false,
        unlockedRegistryIds: [],
      },
    });
    localStorage.setItem(PROGRESS_KEY, original);
    const projected = recordActivity(
      campaign,
      campaign.chapters[0],
      campaign.chapters[0].activities[0],
      true,
      false,
    );
    expect(projected.chapters.ch1.completedActivityIds).toEqual(["old", "a1"]);
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(original);
    const get = store.getItem.bind(store);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === PROGRESS_KEY) throw new Error("read");
      return get(key);
    });
    expect(() =>
      recordActivity(campaign, campaign.chapters[0], campaign.chapters[0].activities[0], true),
    ).toThrow("read");
    expect(get(PROGRESS_KEY)).toBe(original);
  });
  it("a campaign reward claim cannot grant on a failed ledger read or write", async () => {
    const { claimActivityReward } = await import("../../src/lib/campaignLedger");
    const campaign = { id: "c1" } as any;
    const chapter = { id: "ch1" } as any;
    const activity = { id: "a1", xpReward: 5 } as any;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
    vi.restoreAllMocks();
    localStorage.setItem("irth_campaign_ledger_v1", "{");
    expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
    expect(localStorage.getItem("irth_campaign_ledger_v1")).toBe("{");
  });
  it("a tutorial retry cannot downgrade a previously saved version", async () => {
    const { markCompleted, readCompletionRecord } =
      await import("../../src/lib/tutorial/persistence");
    localStorage.setItem(
      "irth.tutorial.irth-first-time.completed-version.v1",
      JSON.stringify({ version: 3, userId: "u1", completedAt: 1 }),
    );
    await markCompleted(1);
    expect(readCompletionRecord()?.version).toBe(3);
  });

  it("legacy campaign handoff preserves operations added while a save is pending", async () => {
    const { enqueueChapterSync, flushPending } = await import("../../src/lib/campaignLedger");
    const old = {
      kind: "chapter",
      campaignId: "c1",
      chapterId: "old",
      status: "completed",
      score: 1,
      xpEarned: 0,
      coinsEarned: 0,
      completed: true,
      at: "old",
    };
    localStorage.setItem("irth_campaign_ledger_v1", JSON.stringify({ keys: {}, pending: [old] }));
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    let finish!: (v: any) => void;
    state.rpc.mockImplementationOnce(() => {
      start();
      return new Promise((r) => {
        finish = r;
      });
    });
    const pending = flushPending();
    await started;
    enqueueChapterSync({
      campaignId: "c1",
      chapterId: "new",
      status: "completed",
      score: 1,
      xpEarned: 0,
      coinsEarned: 0,
      completed: true,
    });
    finish({ data: { ok: true }, error: null });
    await pending;
    expect(
      JSON.parse(localStorage.getItem("irth_campaign_ledger_v1")!).pending.map(
        (op: any) => op.chapterId,
      ),
    ).toEqual(["new"]);
  });
  it("legacy campaign handoff does not write old-account operations over a new account", async () => {
    const { flushPending } = await import("../../src/lib/campaignLedger");
    localStorage.setItem(
      "irth_campaign_ledger_v1",
      JSON.stringify({
        keys: {},
        pending: [
          {
            kind: "chapter",
            campaignId: "c1",
            chapterId: "old",
            status: "completed",
            completed: true,
            at: "old",
          },
        ],
      }),
    );
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    let finish!: (v: any) => void;
    state.rpc.mockImplementationOnce(() => {
      start();
      return new Promise((r) => {
        finish = r;
      });
    });
    const pending = flushPending();
    await started;
    state.uid = "u2";
    state.epoch++;
    const other = JSON.stringify({
      keys: {},
      pending: [{ kind: "chapter", campaignId: "c2", chapterId: "other", at: "new" }],
    });
    localStorage.setItem("irth_campaign_ledger_v1", other);
    finish({ data: { ok: true }, error: null });
    await pending;
    expect(localStorage.getItem("irth_campaign_ledger_v1")).toBe(other);
  });
  it("transport-level permanent rejections use the same receipt-bound archive path", async () => {
    const caller = (await callers())[2];
    state.rpc.mockResolvedValue({ data: null, error: { message: "investigation_not_found" } });
    const result = await caller.run();
    expect(result.acknowledged).toBe(false);
    expect(result.queued).toBe(false);
    expect(await (await outbox()).peekAll("u1")).toEqual([]);
    const { listDeadLetters } = await import("../../src/lib/offline/dead-letter");
    expect(listDeadLetters("u1")[0].reason).toBe("investigation_not_found");
  });

  it("a late direct investigation rejection archives the old receipt without deleting its replacement", async () => {
    const caller = (await callers())[2];
    const api = await outbox();
    let start!: () => void;
    const started = new Promise<void>((r) => {
      start = r;
    });
    let finish!: (v: any) => void;
    state.rpc.mockImplementationOnce(() => {
      start();
      return new Promise((r) => {
        finish = r;
      });
    });
    const pending = caller.run();
    await started;
    const [old] = await api.peekAll("u1");
    const latest = await api.enqueueWithId("u1", old.id, "investigation_complete", {
      investigationId: "inv1",
      score: 3,
    });
    finish({ data: { ok: false, reason: "investigation_not_found" }, error: null });
    const result = await pending;
    expect(result.acknowledged).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.xpEarned).toBe(0);
    expect(await api.peekAll("u1")).toEqual([latest]);
    const { listDeadLetters } = await import("../../src/lib/offline/dead-letter");
    expect(listDeadLetters("u1")[0].revision).toBe(old.revision);
  });

  it.each(names.filter((name) => name !== "streak"))(
    "%s rejects a session lookup that resolves after an account change",
    async (name) => {
      const caller = (await callers()).find((c) => c.name === name)!;
      const { supabase } = await import("../../src/integrations/supabase/client");
      let finish!: (v: any) => void;
      vi.spyOn(supabase.auth, "getSession").mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = caller.run();
      state.uid = "u2";
      state.epoch++;
      finish({ data: { session: { user: { id: "u2" } } } });
      expect(acknowledged(await pending)).toBe(false);
      expect(state.rpc).not.toHaveBeenCalled();
      expect(await (await outbox()).peekAll("u2")).toEqual([]);
    },
  );
  it("mini-game repeated completion cannot duplicate a first-time reward and preserves one pending operation", async () => {
    Object.defineProperty(navigator, "onLine", { value: false });
    const { recordCompletion } = await import("../../src/lib/games/progress");
    const results = await Promise.all([recordCompletion("g1", 0, 3), recordCompletion("g1", 0, 3)]);
    expect(results.filter((result) => result.firstTime)).toHaveLength(1);
    expect(await (await outbox()).peekAll("u1")).toHaveLength(1);
    expect((await recordCompletion("g1", 0, 3)).firstTime).toBe(false);
  });
  it("chapter live RPC and receipt use the same input snapshot even if the caller mutates its object", async () => {
    const { recordChapterProgress } = await import("../../src/lib/offline/record");
    const input = { campaignId: "c1", chapterId: "ch1", status: "completed" as const, completed: true, score: 1 };
    const pending = recordChapterProgress(input);
    input.chapterId = "other"; input.score = 99;
    const result = await pending; expect(result.acknowledged).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("record_campaign_progress_v2", expect.objectContaining({ p_chapter_id: "ch1", p_score: 1 }));
    expect(result.operationId).toBe("chapter_progress:u1:c1:ch1");
  });

});
