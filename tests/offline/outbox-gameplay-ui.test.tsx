import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({
  uid: "u1",
  epoch: 0,
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
    loseHeartOnce: vi.fn(),
  }),
}));
vi.mock("@/lib/identity/owner", () => ({
  getIdentityEpoch: () => state.epoch,
  getActiveUserId: () => state.uid,
  getActiveOwner: () => state.uid,
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
  ActivityRenderer: ({ onResolve }: any) => (
    <button
      onClick={() => {
        void onResolve(true);
      }}
    >
      إجابة صحيحة
    </button>
  ),
}));
vi.mock("@/components/imported-campaign/ActivityReviewCard", () => ({
  ActivityReviewCard: () => null,
}));
vi.mock("@/components/imported-campaign/RichReadingText", () => ({ RichReadingText: () => null }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: () => null,
}));
vi.mock("@/components/imported-campaign/CampaignCompleteModal", () => ({
  CampaignCompleteModal: () => null,
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
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  state.uid = "u1";
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
  state.rpc
    .mockReset()
    .mockResolvedValue({
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function player(onExit = vi.fn()) {
  const { StoryPlayer } = await import("../../src/components/stories/player/StoryPlayer");
  return render(
    <StoryPlayer
      story={{ id: "s1", title_ar: "قصة", xp_reward: 100, dinar_reward: 100 } as any}
      scenes={[{ id: "scene1", scene_index: 0, scene_type: "reflection", text: "النهاية" } as any]}
      media={[]}
      summary={null}
      initialSceneIndex={0}
      alreadyCompleted={false}
      onExit={onExit}
    />,
  );
}
function deferredCompletion() {
  let finish!: (v: any) => void;
  state.rpc.mockImplementation((name) =>
    name === "complete_story_v2"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ data: { ok: true }, error: null }),
  );
  return { finish: (v: any) => finish(v) };
}
it("StoryPlayer waits for saving instead of displaying authored rewards and ignores double clicks", async () => {
  const pending = deferredCompletion();
  await player();
  const button = screen.getByRole("button", { name: /اختم الرحلة/ });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() =>
    expect(state.rpc.mock.calls.filter(([name]) => name === "complete_story_v2")).toHaveLength(1),
  );
  expect(screen.queryByTestId("reward")).toBeNull();
  expect(state.points).not.toHaveBeenCalled();
  pending.finish({
    data: { ok: true, reward_granted_xp: 5, reward_granted_dinars: 2 },
    error: null,
  });
  await waitFor(() => expect(screen.getByTestId("reward").textContent).toBe("5/2"));
  expect(state.points).toHaveBeenCalledExactlyOnceWith(5);
  expect(state.dinars).toHaveBeenCalledExactlyOnceWith(2);
});
it("StoryPlayer storage plus network failure stays in the scene with retry and no reward", async () => {
  vi.stubGlobal("indexedDB", undefined);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  state.rpc.mockRejectedValue(new Error("offline"));
  await player();
  fireEvent.click(screen.getByRole("button", { name: /اختم الرحلة/ }));
  await screen.findByRole("alert");
  expect(screen.getByText("المشهد الأخير")).toBeTruthy();
  expect(screen.queryByTestId("reward")).toBeNull();
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy();
  expect(state.points).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  state.rpc.mockResolvedValue({
    data: { ok: true, reward_granted_xp: 5, reward_granted_dinars: 2 },
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
  await screen.findByTestId("reward");
  expect(state.points).toHaveBeenCalledExactlyOnceWith(5);
});
it("closing StoryPlayer during saving does not apply a late reward and retains recoverable work", async () => {
  const pending = deferredCompletion();
  const exit = vi.fn();
  const view = await player(exit);
  fireEvent.click(screen.getByRole("button", { name: /اختم الرحلة/ }));
  await waitFor(() =>
    expect(state.rpc.mock.calls.some(([name]) => name === "complete_story_v2")).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
  expect(exit).toHaveBeenCalledOnce();
  view.unmount();
  pending.finish({ data: null, error: { message: "offline" } });
  const outbox = await import("../../src/lib/offline/outbox");
  await waitFor(async () =>
    expect((await outbox.peekAll("u1")).some((row) => row.kind === "story_completion")).toBe(true),
  );
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
});
it("switching account while StoryPlayer saves cannot credit the new account", async () => {
  const pending = deferredCompletion();
  await player();
  fireEvent.click(screen.getByRole("button", { name: /اختم الرحلة/ }));
  await waitFor(() =>
    expect(state.rpc.mock.calls.some(([name]) => name === "complete_story_v2")).toBe(true),
  );
  state.uid = "u2";
  state.epoch++;
  pending.finish({
    data: { ok: true, reward_granted_xp: 5, reward_granted_dinars: 2 },
    error: null,
  });
  await screen.findByRole("alert");
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
  const { peekAll } = await import("../../src/lib/offline/outbox");
  expect(await peekAll("u2")).toEqual([]);
});

async function investigationPlayer() {
  const { Route } = await import("../../src/routes/investigation.$id");
  const Component = (Route as any).component;
  return render(<Component />);
}
async function campaignPlayer() {
  const { Route } = await import("../../src/routes/campaigns.imported.$id.chapter.$chapter");
  const Component = (Route as any).component;
  return render(<Component />);
}
it("the actual investigation screen does not close, mark progress or grant hearts after save failure; retry is safe", async () => {
  vi.stubGlobal("indexedDB", undefined);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  state.rpc.mockRejectedValue(new Error("offline"));
  await investigationPlayer();
  fireEvent.click(screen.getByRole("button", { name: "إنهاء التحقيق" }));
  await waitFor(() => expect(state.toast).toHaveBeenCalled());
  expect(screen.queryByTestId("case-closed")).toBeNull();
  expect(state.marker).not.toHaveBeenCalled();
  expect(state.heart).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "إنهاء التحقيق" })).toBeTruthy();
  vi.restoreAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  state.rpc.mockResolvedValue({ data: { ok: true, applied: true, xp_earned: 5 }, error: null });
  const button = screen.getByRole("button", { name: "إنهاء التحقيق" });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByTestId("case-closed");
  expect(state.marker).toHaveBeenCalledOnce();
  expect(state.heart).toHaveBeenCalledOnce();
});
it("the actual campaign screen keeps existing progress and rewards intact on storage failure, then retries once", async () => {
  vi.stubGlobal("indexedDB", undefined);
  state.rpc.mockRejectedValue(new Error("offline"));
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "irth.outbox.fallback.v1") throw new Error("quota");
    original.call(this, key, value);
  });
  await campaignPlayer();
  const button = screen.getByRole("button", { name: "إجابة صحيحة" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(state.toast).toHaveBeenCalled());
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
  expect(localStorage.getItem("irth_campaign_progress")).toBeNull();
  vi.restoreAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  state.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(state.points).toHaveBeenCalledExactlyOnceWith(5));
  expect(state.dinars).toHaveBeenCalledExactlyOnceWith(2);
  expect(
    JSON.parse(localStorage.getItem("irth_campaign_progress")!).c1.chapters.ch1
      .completedActivityIds,
  ).toEqual(["a1"]);
});

async function tutorialPlayer(completed = vi.fn()) {
  const { TutorialProvider, useTutorial } = await import("../../src/lib/tutorial/engine");
  function Controls() {
    const { api, snapshot } = useTutorial();
    return (
      <>
        <button onClick={() => api.finish()}>إنهاء التعليم</button>
        <span data-testid="tutorial-state">{snapshot.state}</span>
      </>
    );
  }
  return render(
    <TutorialProvider hooks={{ onTutorialCompleted: completed }}>
      <Controls />
    </TutorialProvider>,
  );
}
it("tutorial UI retains its controls after failed saving and retries without duplicate completion events", async () => {
  vi.stubGlobal("indexedDB", undefined);
  state.rpc.mockRejectedValue(new Error("offline"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const completed = vi.fn();
  await tutorialPlayer(completed);
  fireEvent.click(screen.getByRole("button", { name: "إنهاء التعليم" }));
  await waitFor(() => expect(state.toast).toHaveBeenCalled());
  expect(completed).not.toHaveBeenCalled();
  expect(screen.getByTestId("tutorial-state").textContent).toBe("idle");
  vi.restoreAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  state.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  const button = screen.getByRole("button", { name: "إنهاء التعليم" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(completed).toHaveBeenCalledOnce());
});
it("tutorial unmount during saving suppresses late completion callbacks", async () => {
  let finish!: (v: any) => void;
  state.rpc.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const completed = vi.fn();
  const view = await tutorialPlayer(completed);
  fireEvent.click(screen.getByRole("button", { name: "إنهاء التعليم" }));
  await waitFor(() => expect(state.rpc).toHaveBeenCalled());
  view.unmount();
  finish({ data: { ok: true }, error: null });
  const { peekAll } = await import("../../src/lib/offline/outbox");
  await waitFor(async () => expect(await peekAll("u1")).toEqual([]));
  expect(completed).not.toHaveBeenCalled();
});

async function profileStreakPlayer() {
  const actual =
    await vi.importActual<typeof import("../../src/lib/profile")>("../../src/lib/profile");
  function Controls() {
    const { profile, recordStreakActivity } = actual.useProfile();
    return (
      <>
        <button
          onClick={() => {
            void recordStreakActivity("game", "g1");
          }}
        >
          نشاط
        </button>
        <output data-testid="streak-value">{profile.streak}</output>
        <output data-testid="profile-points">{profile.points}</output>
      </>
    );
  }
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({ loggedIn: true, points: 0, dinars: 0, streak: 0 }),
  );
  return render(
    <actual.ProfileProvider>
      <Controls />
    </actual.ProfileProvider>,
  );
}
it("the real profile Streak wrapper does not project an unpersisted authenticated activity", async () => {
  const recorder = await import("../../src/lib/streak-activity");
  const spy = vi
    .spyOn(recorder, "recordStreakActivity")
    .mockResolvedValue({ ok: false, queued: false, reason: "rpc_error" });
  await profileStreakPlayer();
  fireEvent.click(screen.getByRole("button", { name: "نشاط" }));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(screen.getByTestId("streak-value").textContent).toBe("0");
});
it("the real profile Streak wrapper discards totals from an old account", async () => {
  const recorder = await import("../../src/lib/streak-activity");
  let finish!: (v: any) => void;
  vi.spyOn(recorder, "recordStreakActivity").mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await profileStreakPlayer();
  fireEvent.click(screen.getByRole("button", { name: "نشاط" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  state.uid = "u2";
  state.epoch++;
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({ loggedIn: true, points: 3, dinars: 0, streak: 0 }),
  );
  fireEvent(window, new Event("irth:identity-changed"));
  finish({
    ok: true,
    current_streak: 20,
    longest_streak: 20,
    xp_total: 99,
    dinar_balance: 99,
    grants: [],
  });
  await waitFor(() => expect(screen.getByTestId("profile-points").textContent).toBe("3"));
});
