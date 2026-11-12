import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  owner: "user:alice", epoch: 0, unlocked: [] as string[],
  fetch: vi.fn(), claim: vi.fn(), repair: vi.fn(), hook: vi.fn(), transition: vi.fn(),
}));
vi.mock("@/lib/identity/guard", () => ({
  captureIdentity: () => ({ owner: state.owner, epoch: state.epoch }),
  isIdentityCurrent: (t: any) => t.owner === state.owner && t.epoch === state.epoch,
}));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));
vi.mock("@/lib/achievements/v2/claim.functions", () => ({
  fetchUserAchievements: state.fetch, claimAchievements: state.claim, repairHistoricalAchievements: state.repair,
}));
vi.mock("@/lib/achievements/v2/index", () => ({ ENGINE_VERSION: 2, registry: { byId: new Map([
  ["one", { id: "one", inputs: [], version: 1 }], ["two", { id: "two", inputs: [], version: 1 }],
]) } }));
vi.mock("@/lib/achievements/v2/evaluator", () => ({ evaluate: () => ({ unlockedIds: new Set(state.unlocked), progress: new Map(), snapshotVersion: 1 }) }));
vi.mock("@/lib/achievements/v2/reconciler", () => ({
  reconcile: () => ({ newlyUnlocked: [...state.unlocked], newlyClaimed: [] }), dispatchClaimTransitions: vi.fn(),
}));
vi.mock("@/lib/achievements/v2/events", () => ({ dispatchAchievementHook: state.hook, dispatchAchievementTransition: state.transition }));
vi.mock("@/lib/achievements/v2/transition-policy", () => ({ shouldEmitAchievementNotification: () => ({ notificationEmitted: true }) }));
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((r,j) => { resolve=r; reject=j; }); return { promise, resolve, reject }; }
function owner(id: string | null) { state.owner = id ? `user:${id}` : "guest:device"; state.epoch++; }
const row = (id: string) => ({ achievement_id: id, unlocked_at: "2026-01-01" });
const flush = async () => { for (let i=0;i<10;i++) await Promise.resolve(); };
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  state.owner="user:alice"; state.epoch=0; state.unlocked=[];
  state.fetch.mockResolvedValue([]); state.claim.mockResolvedValue({ inserted: [], alreadyClaimed: [] });
  state.repair.mockResolvedValue({ repaired: [], existing: [] }); state.hook.mockReset();
});
async function engine() { const e = await import("@/lib/achievements/v2/engine"); e.initAchievementEngine(); return e; }
it("discards Alice mirror resolving after Bob, including notified storage", async () => {
  const e=await engine(), a=deferred<any[]>(); state.fetch.mockReturnValueOnce(a.promise);
  const pending=e.resetAchievementEngine("alice"); owner("bob"); state.fetch.mockResolvedValueOnce([row("bob")]);
  await e.resetAchievementEngine("bob"); const bytes=localStorage.getItem("irth.achievements.v2.notified");
  a.resolve([row("alice")]); await pending;
  expect([...e.getPersisted().keys()]).toEqual(["bob"]); expect(localStorage.getItem("irth.achievements.v2.notified")).toBe(bytes);
});
it("uses reset generation for same-user refresh supersession", async () => {
  const e=await engine(), a=deferred<any[]>(); state.fetch.mockReturnValueOnce(a.promise);
  const pending=e.resetAchievementEngine("alice"); state.fetch.mockResolvedValueOnce([row("fresh")]); await e.resetAchievementEngine("alice");
  a.resolve([row("old")]); await pending; expect([...e.getPersisted().keys()]).toEqual(["fresh"]);
});
it("rejects ABA mirror and stale failure cannot mark newer pending mirror ready", async () => {
  const e=await engine(), a=deferred<any[]>(), latest=deferred<any[]>(); state.fetch.mockReturnValueOnce(a.promise);
  const pending=e.resetAchievementEngine("alice"); owner("bob"); await e.resetAchievementEngine("bob"); owner("alice"); state.fetch.mockReturnValueOnce(latest.promise);
  const fresh=e.resetAchievementEngine("alice"); a.reject(new Error("old request")); await pending;
  expect(e.isMirrorReady()).toBe(false); latest.resolve([row("fresh")]); await fresh; expect([...e.getPersisted().keys()]).toEqual(["fresh"]);
});
it("owner change alone invalidates pending mirror before next engine reset", async () => {
  const e=await engine(), a=deferred<any[]>(); state.fetch.mockReturnValueOnce(a.promise); const pending=e.resetAchievementEngine("alice");
  owner("bob"); a.resolve([row("alice")]); await pending;
  expect(e.getPersisted().size).toBe(0); expect(e.isMirrorReady()).toBe(false);
});
it("fails closed when requested mirror user does not own active namespace", async () => {
  const e=await engine(); await e.resetAchievementEngine("bob");
  expect(state.fetch).not.toHaveBeenCalled(); expect(e.isMirrorReady()).toBe(false);
});
it("stale historical repair cannot write Bob mirror or complete his baseline", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); const repair=deferred<any>(); state.repair.mockReturnValueOnce(repair.promise); state.unlocked=["one"];
  const baseline=e.establishAchievementLiveBaseline(); await flush(); owner("bob"); state.unlocked=[]; await e.resetAchievementEngine("bob");
  repair.resolve({ repaired:["one"],existing:[] }); await baseline;
  expect(e.getPersisted().size).toBe(0); expect(e.isLiveTransitionsReady()).toBe(false);
});
it("stale live claim does not mutate or notify next user", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); await e.establishAchievementLiveBaseline();
  const claim=deferred<any>(); state.claim.mockReturnValueOnce(claim.promise); state.unlocked=["one"]; e.pushCanonical({ xp: 10 }); await flush();
  owner("bob"); state.unlocked=[]; await e.resetAchievementEngine("bob"); claim.resolve({inserted:["one"],alreadyClaimed:[]}); await flush();
  expect(e.getPersisted().size).toBe(0); expect(state.hook).not.toHaveBeenCalled(); expect(state.transition).not.toHaveBeenCalled();
  expect(state.claim).toHaveBeenCalledWith({data:{ids:["one"],engineVersion:2}});
});
it("reentrant transition callback prevents the rest of an old response", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); await e.establishAchievementLiveBaseline();
  state.hook.mockImplementationOnce(() => { owner("bob"); state.unlocked=[]; void e.resetAchievementEngine("bob"); });
  state.claim.mockResolvedValueOnce({inserted:["one","two"],alreadyClaimed:[]}); state.unlocked=["one","two"]; e.pushCanonical({xp:10}); await flush();
  expect(e.getPersisted().size).toBe(0); expect(state.hook).toHaveBeenCalledTimes(1); expect(state.transition).not.toHaveBeenCalled();
});
it("stale guest migration acknowledgment cannot remove new owner's stored bytes", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); const claim=deferred<any>(); state.claim.mockReturnValueOnce(claim.promise);
  localStorage.setItem("irth.achievements.v2.guest_unlocks",JSON.stringify([{achievementId:"one"}])); const pending=e.migrateGuestUnlocks();
  owner("bob"); await e.resetAchievementEngine("bob"); localStorage.setItem("irth.achievements.v2.guest_unlocks","new-owner-bytes");
  claim.resolve({inserted:[],alreadyClaimed:[]}); await pending; expect(localStorage.getItem("irth.achievements.v2.guest_unlocks")).toBe("new-owner-bytes");
});

it("mismatched stale reset preserves Bob mirror and readiness", async () => {
  const e=await engine(); owner("bob"); state.fetch.mockResolvedValueOnce([row("bob")]); await e.resetAchievementEngine("bob");
  await e.establishAchievementLiveBaseline(); const bytes=localStorage.getItem("irth.achievements.v2.notified");
  await e.resetAchievementEngine("alice");
  expect([...e.getPersisted().keys()]).toEqual(["bob"]); expect(e.isMirrorReady()).toBe(true); expect(e.isLiveTransitionsReady()).toBe(true);
  expect(localStorage.getItem("irth.achievements.v2.notified")).toBe(bytes);
});
it("delayed guest write and completion cannot overwrite Bob storage/readiness", async () => {
  const e=await engine(); owner(null); localStorage.setItem("irth.achievements.v2.guest_unlocks",JSON.stringify([{achievementId:"one"}]));
  const guest=e.resetAchievementEngine(null); owner("bob"); const rows=deferred<any[]>(); state.fetch.mockReturnValueOnce(rows.promise); const bob=e.resetAchievementEngine("bob");
  localStorage.setItem("irth.achievements.v2.guest_unlocks","bob-bytes"); await guest; await flush();
  expect(localStorage.getItem("irth.achievements.v2.guest_unlocks")).toBe("bob-bytes"); expect(e.isMirrorReady()).toBe(false); expect(e.isLiveTransitionsReady()).toBe(false);
  rows.resolve([row("bob")]); await bob;
});
it("old cycle finalization cannot release Bob's pending cycle slot", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); await e.establishAchievementLiveBaseline();
  const claim=deferred<any>(); state.claim.mockReturnValueOnce(claim.promise); state.unlocked=["one"]; e.pushCanonical({xp:1}); await flush();
  owner("bob"); state.unlocked=[]; await e.resetAchievementEngine("bob"); const repair=deferred<any>(); state.repair.mockReturnValueOnce(repair.promise);
  state.unlocked=["two"]; const baseline=e.establishAchievementLiveBaseline(); await flush(); expect(state.repair).toHaveBeenCalledTimes(1);
  claim.resolve({inserted:["one"],alreadyClaimed:[]}); await flush(); e.pushCanonical({xp:2}); await flush();
  expect(state.repair).toHaveBeenCalledTimes(1);
  state.unlocked=[]; repair.resolve({repaired:["two"],existing:[]}); await baseline; await flush();
  expect([...e.getPersisted().keys()]).toEqual(["two"]);
});
it("preserves legacy migration invocation before engine profile hydration", async () => {
  const e=await engine(); localStorage.setItem("irth.achievements.v2.guest_unlocks",JSON.stringify([{achievementId:"one"}]));
  await e.migrateGuestUnlocks(); expect(state.claim).toHaveBeenCalledWith({data:{ids:["one"],engineVersion:2}});
  expect(localStorage.getItem("irth.achievements.v2.guest_unlocks")).toBeNull();
});

it("clears previous identity snapshot and evaluation before partial rebuilds", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); state.unlocked=["one"];
  e.pushCanonical({ campaigns:{completedIds:["alice-campaign"]}, xp:500 }); await flush();
  expect(e.getSnapshot().campaigns.completedIds.has("alice-campaign")).toBe(true); expect(e.getEvaluation().unlockedIds.has("one")).toBe(true);
  owner("bob"); state.unlocked=[]; const rows=deferred<any[]>(); state.fetch.mockReturnValueOnce(rows.promise); const bob=e.resetAchievementEngine("bob");
  expect(e.getSnapshot().campaigns.completedIds.size).toBe(0); expect(e.getSnapshot().xp.total).toBe(0); expect(e.getEvaluation().unlockedIds.size).toBe(0);
  e.pushCanonical({xp:2}); await flush(); expect(e.getSnapshot().xp.total).toBe(2); expect(e.getSnapshot().campaigns.completedIds.size).toBe(0);
  rows.resolve([]); await bob;
});
it("synchronous subscriber reset preserves the successor's queued cycle", async () => {
  const e=await engine(); await e.resetAchievementEngine("alice"); const rows=deferred<any[]>(); let switched=false; let bob:Promise<void>|undefined;
  e.onEngineTick(() => {
    if(switched) return; switched=true; owner("bob"); state.fetch.mockReturnValueOnce(rows.promise); bob=e.resetAchievementEngine("bob");
    e.pushCanonical({xp:2});
  });
  const stale=e.establishAchievementLiveBaseline();
  e.pushCanonical({campaigns:{completedIds:["bob-campaign"]}}); await stale; await flush();
  expect(e.getSnapshot().campaigns.completedIds.has("bob-campaign")).toBe(true); expect(e.isLiveTransitionsReady()).toBe(false);
  rows.resolve([]); await bob;
});
