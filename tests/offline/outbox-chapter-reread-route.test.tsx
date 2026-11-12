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
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: async () => ({ ok: true }) }));
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
  ActivityRenderer: ({ activity, onResolve }: any) => {
    const [answer, setAnswer] = React.useState("");
    state.resolve = onResolve;
    return <div><p>{activity.prompt}</p><label>إجابتي<input value={answer} onChange={e => setAnswer(e.target.value)} /></label><button onClick={() => onResolve(true)}>إجابة صحيحة</button></div>;
  },
}));
vi.mock("@/components/imported-campaign/ActivityReviewCard", () => ({
  ActivityReviewCard: () => null,
}));
vi.mock("@/lib/navigation/engine", () => ({ useOverlayDismiss: () => {} }));
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
async function modules() {
  const progress = await import("@/lib/importedCampaignProgress");
  const ledger = await import("@/lib/campaignLedger");
  const totals = await import("@/lib/campaignRewardsGranted");
  return { progress, ledger, totals };
}
it("actual chapter route restores same question and unsent answer after repeated reread without persistence or rewards", async () => {
  const ch = state.campaign.chapters[0];
  ch.activities = [
    { id: "read", type: "reading_then_question", prompt: "استمتع بالقراءة", contextText: "النص السابق للفصل" },
    { id: "question", type: "multiple_choice", prompt: "السؤال الحالي", options: ["أ", "ب"], correctAnswer: 0 },
  ];
  const { progress } = await modules();
  progress.recordActivity(state.campaign, ch, ch.activities[0], true);
  await campaignPlayer();
  fireEvent.change(screen.getByRole("textbox", { name: "إجابتي" }), { target: { value: "إجابة لم أرسلها" } });
  const before = JSON.stringify({ ...localStorage });
  const rpcBefore = state.rpc.mock.calls.length;
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByRole("button", { name: "إعادة قراءة نص الفصل" }));
    expect(screen.getByText("النص السابق للفصل")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى النشاط" }));
    expect(screen.getByText("السؤال الحالي")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "إجابتي" }) as HTMLInputElement).value).toBe("إجابة لم أرسلها");
  }
  expect(JSON.stringify({ ...localStorage })).toBe(before);
  expect(state.rpc.mock.calls.length).toBe(rpcBefore);
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
  expect(state.heart).not.toHaveBeenCalled();
  expect(progress.getChapterProgress("c1", "ch1").completedActivityIds).toEqual(["read"]);
});
