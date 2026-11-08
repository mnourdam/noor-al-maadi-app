import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({
  uid: "u1",
  owner: null as string | null,
  resolve: null as any,
  epoch: 0,
  ownerListeners: new Set<() => void>(),
  rpc: vi.fn(),
  points: vi.fn(),
  dinars: vi.fn(),
  marker: vi.fn(),
  heart: vi.fn(),
  toast: vi.fn(),
  campaign: null as any,
  investigation: null as any,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.uid } } } }) },
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: { loggedIn: true, hearts: 5 },
    addPoints: state.points,
    addDinars: state.dinars,
    markInvestigationCompletedLocal: state.marker,
    awardBadge: vi.fn(),
    recoverHeartFromActivity: state.heart,
    recordStreakActivity: async () => {},
    applyServerStats: vi.fn(),
    loseHeartOnce: state.heart,
  }),
}));
vi.mock("@/lib/identity/owner", () => ({
  getIdentityEpoch: () => state.epoch,
  getActiveUserId: () => state.uid,
  getActiveOwner: () => state.owner ?? `user:${state.uid}`,
  onOwnerChange: (listener: () => void) => {
    state.ownerListeners.add(listener);
    return () => {
      state.ownerListeners.delete(listener);
    };
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/settings",
  useParams: () => ({ id: "c1", chapter: "ch1" }),
  useSearch: () => ({}),
  createFileRoute: () => (options: any) => options,
  Link: ({ children }: any) => <div>{children}</div>,
  notFound: () => new Error("missing"),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: () => ({ data: state.campaign, isLoading: false }),
}));
vi.mock("@/lib/stories/progress-mirror", () => ({
  markCompleted: () => {},
  upsertProgress: () => {},
}));
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: async () => ({ ok: true }) }));
vi.mock("@/lib/reflections", () => ({ getReflection: () => null }));
vi.mock("@/components/social/Istazadtu", () => ({ Istazadtu: () => null }));
vi.mock("@/components/stories/player/sceneLayouts", () => ({
  SceneStage: () => <div>المشهد الأخير</div>,
  resolveSceneTransition: () => "fade",
}));
vi.mock("@/components/stories/player/SegmentedProgress", () => ({ SegmentedProgress: () => null }));
vi.mock("@/components/stories/player/SceneExportButton", () => ({ SceneExportButton: () => null }));
vi.mock("@/components/stories/player/RewardMoment", () => ({
  RewardMoment: ({ xp, dinars }: any) => (
    <div data-testid="reward">
      {xp}/{dinars}
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: { error: state.toast } }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ReadingScale", () => ({
  ReadingScale: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/feedback/FeedbackCTA", () => ({ FeedbackCTA: () => null }));
vi.mock("@/lib/navigation", () => ({
  useStashCurrentAsOrigin: () => vi.fn(),
  useOverlayDismiss: () => {},
  useOverlayEntries: () => [],
}));
vi.mock("@/lib/audioManager", () => ({ audioManager: { playSfx: () => {} } }));
vi.mock("@/lib/investigations-source", () => ({
  useSupabaseInvestigation: () => ({ row: state.investigation }),
  displayDifficulty: () => "سهل",
}));
vi.mock("@/lib/investigations/progress", async (original) => ({
  ...(await original<object>()),
  useCanonicalInvestigationProgress: () => ({ matches: () => false }),
  useInvestigationProgress: () => ({ uid: state.uid, completedIds: new Set<string>() }),
}));
vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localInvestigations: () => [],
}));
vi.mock("@/lib/encyclopedia-refs", () => ({ resolveRelatedRefs: () => [] }));
vi.mock("@/lib/investigations/case-number", () => ({
  useCaseNumber: () => 1,
  registerInvestigationsForNumbering: () => {},
}));
vi.mock("@/lib/investigations/recommend", () => ({
  markInvestigationOpened: () => {},
  clearInvestigationOpened: () => {},
}));
vi.mock("@/components/investigations/CaseHero", () => ({ CaseHero: () => null }));
vi.mock("@/components/investigations/CaseTimeline", () => ({
  CaseTimeline: () => null,
  phaseForStep: () => "end",
}));
vi.mock("@/components/investigations/CaseClosedCard", () => ({
  CaseClosedCard: () => <div data-testid="case-closed" />,
}));
vi.mock("@/components/investigations/EntityRefChip", () => ({ EntityRefChip: () => null }));
vi.mock("@/components/investigations/EvidenceBoard", () => ({ EvidenceBoard: () => null }));
vi.mock("@/lib/supabaseCampaigns", () => ({
  fetchCampaignByIdOrSlug: async () => state.campaign,
  onCampaignPublished: () => () => {},
}));
vi.mock("@/lib/hearts", async (original) => ({
  ...(await original<object>()),
  getEffectiveHearts: () => 5,
}));
vi.mock("@/lib/memory", () => ({
  ensurePlan: () => null,
  isReviewMarker: () => false,
  harvestCampaignIntoBank: () => {},
  refreshMemoryBank: async () => {},
  clearPlan: () => {},
}));
vi.mock("@/components/memory/ReviewActivity", () => ({ ReviewActivity: () => null }));
vi.mock("@/components/imported-campaign/ActivityRenderer", () => ({
  ActivityRenderer: ({ onResolve }: any) => {
    state.resolve = onResolve;
    return (
      <button
        onClick={() => {
          void onResolve(true);
        }}
      >
        إجابة صحيحة
      </button>
    );
  },
}));
vi.mock("@/components/imported-campaign/ActivityReviewCard", () => ({
  ActivityReviewCard: () => null,
}));
vi.mock("@/components/imported-campaign/RichReadingText", () => ({ RichReadingText: () => null }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: () => null,
}));
vi.mock("@/components/imported-campaign/CampaignCompleteModal", () => ({
  CampaignCompleteModal: ({ open }: any) =>
    open ? <div data-testid="campaign-complete">أتممت الحملة</div> : null,
}));
vi.mock("@/components/imported-campaign/UnlockList", () => ({ UnlockList: () => null }));
vi.mock("@/components/CachedImage", () => ({ CachedImage: () => null }));
vi.mock("@/components/motion/MotionPrimitives", () => ({
  Stagger: ({ children }: any) => <div>{children}</div>,
  AnimatedNumber: ({ value }: any) => <span>{value}</span>,
}));

vi.mock("@/lib/tutorial/validate", () => ({ validateTutorialConfigInDev: () => {} }));
vi.mock("@/lib/tutorial/debug", () => ({ registerTutorialDebugBinding: () => () => {} }));
vi.mock("@/lib/tutorial/eligibility", () => ({
  computeEligibility: () => false,
  eligibilityWaitingReason: () => "test",
  getAllEligibilityFlags: () => ({}),
  refreshFirstLaunchChoiceFlag: () => {},
  subscribeEligibility: () => () => {},
}));
vi.mock("@/lib/boot/reconciliation", () => ({ getReconciliationState: () => "offline-local" }));
// Diagnostics and the separate best-effort sticky completion writer are not
// reward delivery authorities. Isolate their background imports from crash cuts.
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/campaigns/completions", () => ({
  recordCampaignCompletion: async () => ({ acknowledged: false, queued: true }),
}));
beforeEach(() => {
  vi.resetModules();
  state.resolve = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
  localStorage.clear();
  state.uid = "u1";
  state.owner = null;
  state.epoch = 0;
  state.points.mockReset();
  state.dinars.mockReset();
  state.marker.mockReset();
  state.heart.mockReset().mockReturnValue({ ok: true });
  state.toast.mockReset();
  state.campaign = {
    id: "c1",
    title: "حملة",
    chapters: [
      {
        id: "ch1",
        title: "فصل",
        activities: [{ id: "a1", type: "reading", xpReward: 5, coinsReward: 2 }],
      },
    ],
  };
  state.investigation = {
    id: "inv1",
    slug: "inv1",
    title: "تحقيق",
    steps: [{ type: "conclusion", text: "آخر خطوة" }],
    reward: { hearts: 1 },
  };
  state.rpc.mockReset().mockResolvedValue({
    data: { ok: true, reward_granted_xp: 5, reward_granted_dinars: 2 },
    error: null,
  });
  vi.stubGlobal("indexedDB", new IDBFactory());
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal("navigator", {
    onLine: true,
    locks: {
      request: (name: string, _options: unknown, run: () => unknown) => {
        const promise = (tails.get(name) ?? Promise.resolve()).then(run);
        tails.set(
          name,
          promise.catch(() => {}),
        );
        return promise;
      },
    },
  });
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  // The real progress adapter imports its completion recorder asynchronously.
  // Drain that scheduled work before resetting modules/storage for another case.
  await new Promise((done) => setTimeout(done, 0));
  vi.restoreAllMocks();
  const { __uninstallPartitionForTests } = await import("@/lib/identity/partition");
  __uninstallPartitionForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function campaignPlayer() {
  const { Route } = await import("@/routes/campaigns.imported.$id.chapter.$chapter");
  const Component = (Route as any).component;
  const view = render(<Component />);
  await screen.findByText("إجابة صحيحة");
  return view;
}
async function resolve(meta?: any, correct = true) {
  await act(async () => {
    await state.resolve(correct, meta);
  });
}
async function modules() {
  const progress = await import("@/lib/importedCampaignProgress");
  const ledger = await import("@/lib/campaignLedger");
  const totals = await import("@/lib/campaignRewardsGranted");
  return { progress, ledger, totals };
}
function fixture() {
  const campaign = state.campaign;
  return { campaign, chapter: campaign.chapters[0], activity: campaign.chapters[0].activities[0] };
}
function deferred<T>() {
  let finish!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    finish = r;
  });
  return { promise, finish };
}
it("REPRO online confirms progress and grants local activity rewards separately", async () => {
  await campaignPlayer();
  await resolve();
  expect(state.points).toHaveBeenCalledWith(5);
  expect(state.dinars).toHaveBeenCalledWith(2);
  const { ledger } = await modules();
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(true);
});
it("REPRO offline queued already spends local XP/dinars and marks completed", async () => {
  Object.assign(navigator, { onLine: false });
  await campaignPlayer();
  await resolve();
  const { ledger, progress } = await modules();
  expect(state.points).toHaveBeenCalledWith(5);
  expect(state.dinars).toHaveBeenCalledWith(2);
  expect(progress.getChapterProgress("c1", "ch1").completed).toBe(true);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(true);
  const { peekAll } = await import("@/lib/offline/outbox");
  const row = (await peekAll("u1")).find((r) => r.kind === "chapter_progress")!;
  expect(row.id).toBe("chapter_progress:u1:c1:ch1");
  expect(row.payload).not.toHaveProperty("activityId");
  expect(row.payload).not.toHaveProperty("rewardScale");
});
it("unresolved write does not yet claim a reward", async () => {
  await campaignPlayer();
  // Exercise the real finite deadline through a deliberately stalled IDB open.
  const request: any = {};
  vi.stubGlobal("indexedDB", { open: () => request });
  vi.useFakeTimers();
  const attempt = state.resolve(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8001);
    await attempt;
  });
  expect(state.points).not.toHaveBeenCalled();
  const { ledger } = await modules();
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(false);
  // Release the raw storage lifetime after the UI deadline, rather than
  // leaking an unresolved open across test/module lifetimes.
  await act(async () => {
    request.error = new Error("late storage failure");
    request.onerror();
  });
});
it("Outbox quota plus RPC failure cannot claim or advance", async () => {
  await campaignPlayer();
  vi.stubGlobal("indexedDB", undefined);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "irth.outbox.fallback.v1") throw new Error("quota");
    original.call(this, key, value);
  });
  state.rpc.mockRejectedValue(new Error("offline"));
  await resolve();
  expect(state.points).not.toHaveBeenCalled();
  const { progress } = await modules();
  expect(progress.getChapterProgress("c1", "ch1").completed).toBe(false);
});
it("failed ledger read is not permission to regrant", async () => {
  const { ledger } = await modules();
  const { campaign, chapter, activity } = fixture();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("read failure");
  });
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(state.points).not.toHaveBeenCalled();
});
it("REPRO queued then permanent rejection leaves claims and local completion", async () => {
  Object.assign(navigator, { onLine: false });
  await campaignPlayer();
  await resolve();
  const { peekAll } = await import("@/lib/offline/outbox");
  const row = (await peekAll("u1")).find((r) => r.kind === "chapter_progress")!;
  Object.assign(navigator, { onLine: true });
  state.rpc.mockResolvedValue({ data: { ok: false, reason: "invalid_campaign_id" }, error: null });
  const { flushOutbox } = await import("@/lib/offline/flush");
  expect((await flushOutbox("u1")).failed).toBeGreaterThanOrEqual(1);
  expect((await peekAll("u1")).some((item) => item.id === row.id)).toBe(false);
  const { progress, ledger } = await modules();
  expect(progress.getCampaignProgress("c1").completed).toBe(true);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(true);
  expect(state.points).toHaveBeenCalledWith(5);
});
it("reconnect acknowledgement removes work without creating per-activity delivery evidence", async () => {
  Object.assign(navigator, { onLine: false });
  const { recordChapterProgress } = await import("@/lib/offline/record");
  const payload = {
    campaignId: "c1",
    chapterId: "ch1",
    status: "completed" as const,
    completed: true,
  };
  const queued = await recordChapterProgress(payload);
  Object.assign(navigator, { onLine: true });
  const confirmed = await recordChapterProgress(payload);
  expect(confirmed.operationId).toBe(queued.operationId);
  expect(confirmed.acknowledged).toBe(true);
  const { settlementForOwner } = await import("@/lib/rewards/settlement");
  expect(await settlementForOwner("user:u1").list()).toEqual([]);
  expect(state.points).not.toHaveBeenCalled();
});
it("REPRO crash after local progress write before claim leaves completed progress with no entitlement", async () => {
  const { ledger, progress } = await modules();
  vi.spyOn(ledger, "claimActivityReward").mockImplementation(() => {
    throw new Error("crash-before-claim");
  });
  await campaignPlayer();
  await resolve();
  expect(progress.getCampaignProgress("c1").completed).toBe(true);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(false);
  expect(state.points).not.toHaveBeenCalled();
});
it("REPRO crash after claim before addPoints permanently suppresses the replay delta", async () => {
  const { ledger } = await modules();
  state.points.mockImplementation(() => {
    throw new Error("crash-before-profile");
  });
  const view = await campaignPlayer();
  await resolve();
  view.unmount();
  const { campaign, chapter, activity } = fixture();
  vi.resetModules();
  const restarted = await import("@/lib/campaignLedger");
  expect(restarted.claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(true);
  expect(localStorage.getItem("profile-fixture")).toBeNull();
});
it("REPRO crash after addPoints before totals leaves a claim without canonical totals", async () => {
  const { totals, ledger } = await modules();
  vi.spyOn(totals, "recordCampaignGrant").mockImplementation(() => {
    throw new Error("crash-before-totals");
  });
  await campaignPlayer();
  await resolve();
  expect(state.points).toHaveBeenCalledWith(5);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(true);
  expect(localStorage.getItem("irth_campaign_grants_v2")).toBeNull();
});
it("REPRO chapter claim can survive without collection sync", async () => {
  const { ledger } = await modules();
  state.campaign.chapters[0].rewards = { xp: 9, unlocks: ["artifact:synthetic"] };
  const original = ledger.claimChapterReward;
  vi.spyOn(ledger, "claimChapterReward").mockImplementation((...args) => {
    original(...args);
    throw new Error("crash-after-chapter-claim");
  });
  await campaignPlayer();
  await resolve();
  expect(ledger.hasClaimed("chapter:c1:ch1")).toBe(true);
  expect(JSON.parse(localStorage.getItem("irth_campaign_ledger_v1")!).pending).toEqual([]);
});
it("REPRO campaign completion before modal does not establish reward delivery", async () => {
  const { ledger, progress } = await modules();
  vi.spyOn(ledger, "claimCampaignReward").mockImplementation(() => {
    throw new Error("crash-before-campaign-grant");
  });
  await campaignPlayer();
  await resolve();
  expect(progress.getCampaignProgress("c1").completed).toBe(true);
  expect(screen.queryByTestId("campaign-complete")).toBeNull();
  expect(ledger.hasClaimed("campaign:c1")).toBe(false);
});
for (const aba of [false, true])
  it("owner epoch changes during RPC fence rewards" + (aba ? " ABA" : ""), async () => {
    const gate = deferred<any>();
    state.rpc.mockImplementation((name) =>
      name === "record_campaign_progress_v2"
        ? gate.promise
        : Promise.resolve({ data: { ok: true }, error: null }),
    );
    await campaignPlayer();
    fireEvent.click(screen.getByText("إجابة صحيحة"));
    await waitFor(() =>
      expect(state.rpc.mock.calls.some(([name]) => name === "record_campaign_progress_v2")).toBe(
        true,
      ),
    );
    state.uid = "bob";
    state.epoch++;
    if (aba) {
      state.uid = "u1";
      state.epoch++;
    }
    await act(async () => {
      gate.finish({ data: { ok: true }, error: null });
    });
    expect(state.points).not.toHaveBeenCalled();
    expect(state.dinars).not.toHaveBeenCalled();
  });
it("replaying an existing claim is silent, without proving that the first delivery occurred", async () => {
  const { ledger } = await modules();
  const { campaign, chapter, activity } = fixture();
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(true);
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(state.points).not.toHaveBeenCalled();
});
it("retry retains the stable chapter operation ID", async () => {
  Object.assign(navigator, { onLine: false });
  const { recordChapterProgress } = await import("@/lib/offline/record");
  const p = { campaignId: "c1", chapterId: "ch1", status: "unlocked" as const };
  const a = await recordChapterProgress(p),
    b = await recordChapterProgress(p);
  expect(a.operationId).toBe("chapter_progress:u1:c1:ch1");
  expect(b.operationId).toBe(a.operationId);
});
it("REPRO local completion unlocks next chapter before server confirmation", async () => {
  Object.assign(navigator, { onLine: false });
  state.campaign.chapters.push({ id: "ch2", order: 2, activities: [{ id: "a2" }] });
  state.campaign.chapters[0].order = 1;
  await campaignPlayer();
  await resolve();
  const { progress } = await modules();
  expect(progress.isChapterUnlocked(state.campaign, state.campaign.chapters[1])).toBe(true);
  expect(state.rpc).not.toHaveBeenCalled();
});
it("skipped optional activity keeps progress but leaves activity claim absent", async () => {
  await campaignPlayer();
  await resolve({ skipped: true });
  const { progress, ledger } = await modules();
  expect(progress.getChapterProgress("c1", "ch1").completedActivityIds).toEqual(["a1"]);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(false);
});
it("wrong answer retains its heart penalty and does not claim", async () => {
  await campaignPlayer();
  await resolve(undefined, false);
  expect(state.heart).toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled();
  const { ledger } = await modules();
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(false);
});
for (const [wrong, viaReveal, xp, coins] of [
  [0, false, 5, 2],
  [1, false, 2, 1],
  [2, false, 1, 0],
  [0, true, 1, 0],
] as const) {
  it("retains full/half/min route arithmetic " + JSON.stringify([wrong, viaReveal]), async () => {
    await campaignPlayer();
    for (let i = 0; i < wrong; i++) await resolve(undefined, false);
    await resolve({ viaReveal });
    expect(state.points).toHaveBeenCalledWith(xp);
    if (coins) expect(state.dinars).toHaveBeenCalledWith(coins);
    else expect(state.dinars).not.toHaveBeenCalled();
  });
}
it("V17 claim without profile evidence stays ambiguous and cannot be auto-rewarded", async () => {
  const { ledger } = await modules();
  localStorage.setItem(
    "irth_campaign_ledger_v1",
    JSON.stringify({ keys: { "activity:c1:ch1:a1": { at: "old", synced: true } }, pending: [] }),
  );
  const { campaign, chapter, activity } = fixture();
  const before = localStorage.getItem("irth_campaign_ledger_v1");
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(localStorage.getItem("irth_campaign_ledger_v1")).toBe(before);
});
it("REPRO profile fixture with no claim is insufficient to dedupe another grant", async () => {
  localStorage.setItem("profile-fixture", '{"points":5,"dinars":2}');
  const { ledger } = await modules();
  const { campaign, chapter, activity } = fixture();
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(true);
  expect(localStorage.getItem("profile-fixture")).toBe('{"points":5,"dinars":2}');
});
it("lost acknowledgement and missing receipt are not delivery evidence", async () => {
  const { recordChapterProgress } = await import("@/lib/offline/record");
  // Server commits, but its live reply is lost; the durable driver retries.
  let calls = 0;
  state.rpc.mockImplementation(async () =>
    ++calls === 1
      ? { data: null, error: { message: "reply lost after simulated server commit" } }
      : { data: { ok: true }, error: null },
  );
  const outcome = await recordChapterProgress({
    campaignId: "c1",
    chapterId: "ch1",
    status: "completed",
    completed: true,
  });
  expect(outcome.acknowledged).toBe(false);
  expect(outcome.queued).toBe(true);
  const { flushOutbox } = await import("@/lib/offline/flush");
  expect((await flushOutbox("u1")).flushed).toBe(1);
  const { peekAll } = await import("@/lib/offline/outbox");
  expect(await peekAll("u1")).toEqual([]);
  const { settlementForOwner } = await import("@/lib/rewards/settlement");
  expect(await settlementForOwner("user:u1").list()).toEqual([]);
  expect(state.points).not.toHaveBeenCalled();
});
it("REPRO totals write failure may return totals that were never persisted", async () => {
  const { totals } = await modules();
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "irth_campaign_grants_v2") throw new Error("quota");
    original.call(this, key, value);
  });
  expect(totals.recordCampaignGrant("c1", { xp: 5 }).xp).toBe(5);
  expect(totals.getCampaignGrantedTotals("c1").xp).toBe(0);
});

it("guest buffered_no_session saves progress without a delivery promise", async () => {
  state.uid = "";
  state.owner = "guest:synthetic";
  const { installIdentityPartition } = await import("@/lib/identity/partition");
  installIdentityPartition();
  const { recordChapterProgress } = await import("@/lib/offline/record");
  const result = await recordChapterProgress({
    campaignId: "c1",
    chapterId: "ch1",
    status: "completed",
    completed: true,
  });
  expect(result.reason).toBe("buffered_no_session");
  expect(result.acknowledged).toBe(false);
  const { readGuestBuffer } = await import("@/lib/campaigns/guest-progress-buffer");
  expect(Object.keys(readGuestBuffer().entries)).toHaveLength(1);
  expect(state.points).not.toHaveBeenCalled();
});
it("guest quota cannot become buffered success or migrate ownership", async () => {
  state.uid = "";
  state.owner = "guest:synthetic";
  const { installIdentityPartition } = await import("@/lib/identity/partition");
  installIdentityPartition();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const { recordChapterProgress } = await import("@/lib/offline/record");
  const result = await recordChapterProgress({
    campaignId: "c1",
    chapterId: "ch1",
    status: "completed",
    completed: true,
  });
  expect(result.acknowledged).toBe(false);
  expect(result.reason).not.toBe("buffered_no_session");
  expect(state.rpc).not.toHaveBeenCalled();
});
it("a second pending activity replaces the chapter snapshot without preserving per-activity reward scale", async () => {
  Object.assign(navigator, { onLine: false });
  const { recordChapterProgress } = await import("@/lib/offline/record");
  const p = { campaignId: "c1", chapterId: "ch1", status: "unlocked" as const, completed: false };
  await recordChapterProgress({ ...p, score: 1, xpEarned: 5 });
  await recordChapterProgress({ ...p, score: 2, xpEarned: 10 });
  const { peekAll } = await import("@/lib/offline/outbox");
  const rows = await peekAll("u1");
  expect(rows).toHaveLength(1);
  expect(rows[0].payload.score).toBe(2);
  expect(rows[0].payload).not.toHaveProperty("rewardScale");
  expect(rows[0].payload).not.toHaveProperty("activityIds");
});
it("REPRO restart backfill can turn progress-only completion into a consumed claim", async () => {
  const { progress, ledger } = await modules();
  const { campaign, chapter, activity } = fixture();
  progress.recordActivity(campaign, chapter, activity, true);
  expect(ledger.hasClaimed("activity:c1:ch1:a1")).toBe(false);
  ledger.backfillLedgerFromLegacyProgress();
  expect(ledger.claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(state.points).not.toHaveBeenCalled();
});
it("REPRO an unmatched prior profile grant permits another route grant", async () => {
  let syntheticBalance = 5; // known fixture history, not an inferred player balance
  state.points.mockImplementation((xp) => {
    syntheticBalance += xp;
  });
  await campaignPlayer();
  await resolve();
  expect(syntheticBalance).toBe(10);
  expect(state.points).toHaveBeenCalledWith(5);
});
