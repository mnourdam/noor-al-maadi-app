import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({
  realQuery: false,
  feed: vi.fn(),
  uid: "u1",
  search: {} as Record<string, string>,
  chapterId: "ch1",
  hearts: 5,
  navigate: vi.fn(),
  plan: vi.fn(() => null),
  harvest: vi.fn(),
  refresh: vi.fn(async () => {}),
  resume: vi.fn(),
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
    profile: { loggedIn: true, hearts: state.hearts },
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
  useNavigate: () => state.navigate,
  useRouterState: () => "/settings",
  useParams: () => ({ id: "c1", chapter: state.chapterId }),
  useSearch: () => state.search,
  createFileRoute: () => (options: any) => options,
  Link: ({ children, to, params, search }: any) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) href = href.replace('$' + key, value);
    if (search?.review) href += '?review=' + search.review;
    return <a href={href}>{children}</a>;
  },
  notFound: () => new Error("missing"),
}));
vi.mock("@tanstack/react-query", async original => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return { ...actual,
    useQueryClient: () => state.realQuery ? actual.useQueryClient() : ({ invalidateQueries: async () => {} }),
    useQuery: (options: any) => state.realQuery ? actual.useQuery(options) : ({ data: state.campaign, isLoading: false }),
  };
});
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
  fetchPublishedFeed: async () => state.realQuery ? state.feed() : ({}),
  onCampaignPublished: () => () => {},
}));
vi.mock("@/lib/hearts", async (original) => ({
  ...(await original<object>()),
  getEffectiveHearts: () => state.hearts,
}));
vi.mock("@/lib/memory", () => ({
  ensurePlan: state.plan,
  isReviewMarker: () => false,
  harvestCampaignIntoBank: state.harvest,
  refreshMemoryBank: state.refresh,
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

vi.mock("@/lib/navigation/engine", () => ({ useOverlayDismiss: () => {} }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: ({ open }: any) => open ? <div data-testid="hearts-modal" /> : null,
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
vi.mock("@/lib/campaignLedger", async original => {
  const actual = await original<any>();
  return { ...actual, setActivePosition: (...args: any[]) => { state.resume(...args); return actual.setActivePosition(...args); } };
});
vi.mock("@/lib/campaigns/useCampaignProgression", () => ({ useCampaignLockStatus: () => ({ locked: false }) }));
vi.mock("@/components/campaigns/CampaignIntroGate", () => ({ CampaignIntroGate: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/campaigns/CampaignIntroPlayer", () => ({ CampaignIntroPlayer: () => null }));
vi.mock("@/lib/campaigns/intro/resolve", () => ({ resolveCampaignIntro: () => null }));
vi.mock("@/lib/campaignArtwork", () => ({ CampaignArtwork: () => null, hasCampaignKeyArt: () => false }));
vi.mock("@/components/KeyArtDissolve", () => ({ KeyArtDissolve: () => null }));
vi.mock("@/lib/display-names", () => ({ displayBadgeName: (id: string) => id, displayArtifactName: (id: string) => id }));
beforeEach(() => {
  state.realQuery = false; state.feed.mockReset();
  state.search = {}; state.chapterId = "ch1"; state.hearts = 5;
  state.navigate.mockClear(); state.plan.mockClear(); state.harvest.mockClear(); state.refresh.mockReset().mockResolvedValue(undefined); state.resume.mockClear();
  state.ownerListeners.clear();
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


async function seedPartial() {
  const ch = state.campaign.chapters[0];
  ch.activities = [{ id: "read", type: "reading_then_question", prompt: "نص النشاط للمراجعة", contextText: "تفاصيل القراءة المكتملة" }];
  state.campaign.chapters.push({ id: "ch2", title: "التالي", activities: [{ id: "later", type: "reading" }] });
  const { progress } = await modules();
  progress.recordActivity(state.campaign, ch, ch.activities[0], true);
  await new Promise(done => setTimeout(done, 0));
  return { progress, ch };
}
async function mountChapter() {
  const { Route } = await import("@/routes/campaigns.imported.$id.chapter.$chapter");
  const Component = (Route as any).component;
  return { ...render(<Component />), Component, Route };
}
function assertNoReadWrites() {
  expect(state.resume).not.toHaveBeenCalled(); expect(state.plan).not.toHaveBeenCalled();
  expect(state.harvest).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled(); expect(state.heart).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
}
it("follows real overview completed link to read-only chapter with zero hearts and no progress or rewards", async () => {
  await seedPartial();
  const { Route: Overview } = await import("@/routes/campaigns.imported.$id.index");
  const OverviewComponent = (Overview as any).component;
  const overview = render(<OverviewComponent />);
  const link = screen.getByText("أعد القراءة").closest("a")!;
  expect(link.getAttribute("href")).toBe("/campaigns/imported/c1/chapter/ch1?review=chapter");
  state.search = { review: new URL(link.href).searchParams.get("review")! };
  overview.unmount(); state.hearts = 0;
  const before = JSON.stringify({ ...localStorage }); state.rpc.mockClear();
  await mountChapter();
  await screen.findByText("تفاصيل القراءة المكتملة");
  expect(screen.queryByTestId("hearts-modal")).toBeNull();
  expect(screen.queryByText("أتممتَ هذا الفصل")).toBeNull();
  expect(screen.getByText(/أنهيتَ هذا الفصل —/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /الفصل التالي/ }).getAttribute("href")).toBe("/campaigns/imported/c1/chapter/ch2");
  expect(JSON.stringify({ ...localStorage })).toBe(before); assertNoReadWrites();
});
it("keeps normal completed-chapter URL on completion panel and existing whole-campaign review", async () => {
  const { progress } = await seedPartial();
  const view = await mountChapter();
  await screen.findByText("أتممتَ هذا الفصل");
  expect(screen.queryByText("تفاصيل القراءة المكتملة")).toBeNull();
  view.unmount();
  const next = state.campaign.chapters[1];
  progress.recordActivity(state.campaign, next, next.activities[0], true);
  await mountChapter();
  await screen.findByText("تفاصيل القراءة المكتملة");
  expect(screen.getByText(/أنهيتَ هذه الحملة/)).toBeTruthy();
});
it("rejects forged incomplete and locked read intent before plan, bank, resume or answer-key render", async () => {
  state.search = { review: "chapter" };
  state.campaign.chapters[0].activities[0].prompt = "إجابة سرية";
  const view = await mountChapter();
  await waitFor(() => expect(state.navigate).toHaveBeenCalled());
  expect(screen.queryByText("إجابة سرية")).toBeNull(); assertNoReadWrites();
  view.unmount(); state.navigate.mockClear();
  const { ch } = await seedPartial();
  ch.unlockRequirement = "never-completed";
  await mountChapter();
  await waitFor(() => expect(state.navigate).toHaveBeenCalled());
  expect(screen.queryByText("تفاصيل القراءة المكتملة")).toBeNull(); assertNoReadWrites();
});
it("excludes newly authored incomplete activities and truthfully renders absent historical activity evidence", async () => {
  const { ch, progress } = await seedPartial(); state.search = { review: "chapter" };
  ch.activities.push({ id: "new", type: "multiple_choice", prompt: "سؤال جديد مخفي", options: ["إجابة جديدة"], correctAnswer: 0 });
  const view = await mountChapter();
  await screen.findByText("تفاصيل القراءة المكتملة"); expect(screen.queryByText("سؤال جديد مخفي")).toBeNull();
  ch.activities = [ch.activities[1]];
  state.campaign = { ...state.campaign, chapters: [...state.campaign.chapters] };
  view.rerender(<view.Component />);
  expect(screen.getByText("لا تتوفر أنشطة مكتملة موثقة للمراجعة في هذا الفصل.")).toBeTruthy();
  expect(progress.getChapterProgress("c1", "ch1").completedActivityIds).toEqual(["read"]);
});
it("retires owner A review on owner B and rechecks owner ABA from partitioned completion", async () => {
  const { installIdentityPartition } = await import("@/lib/identity/partition");
  installIdentityPartition();
  await seedPartial(); state.search = { review: "chapter" };
  await mountChapter(); await screen.findByText("تفاصيل القراءة المكتملة");
  await act(async () => { state.uid = "u2"; state.epoch++; state.ownerListeners.forEach(fn => fn()); });
  expect(screen.queryByText("تفاصيل القراءة المكتملة")).toBeNull();
  expect(state.navigate).toHaveBeenCalled();
  await act(async () => { state.uid = "u1"; state.epoch++; state.ownerListeners.forEach(fn => fn()); });
  await screen.findByText("تفاصيل القراءة المكتملة");
  assertNoReadWrites();
});
it("blocks captured gameplay callback after intent change including normal→read→normal ABA", async () => {
  await modules();
  const view = await mountChapter();
  await screen.findByText("إجابة صحيحة");
  const oldResolve = state.resolve;
  state.search = { review: "chapter" }; view.rerender(<view.Component />);
  state.search = {}; view.rerender(<view.Component />);
  const before = JSON.stringify({ ...localStorage }); state.rpc.mockClear();
  await act(async () => { await oldResolve(true); });
  expect(JSON.stringify({ ...localStorage })).toBe(before); expect(state.rpc).not.toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
});

it("carries review intent only to completed next chapter and validates exact search values", async () => {
  const { progress } = await seedPartial();
  state.campaign.chapters.push({ id: "ch3", title: "ثالث", activities: [{ id: "third", type: "reading" }] });
  const next = state.campaign.chapters[1];
  progress.recordActivity(state.campaign, next, next.activities[0], true);
  state.search = { review: "chapter" };
  const view = await mountChapter();
  expect(screen.getByRole("link", { name: /الفصل التالي/ }).getAttribute("href")).toBe("/campaigns/imported/c1/chapter/ch2?review=chapter");
  expect((view.Route as any).validateSearch({ review: "chapter", preview: "draft" })).toEqual({ review: "chapter", preview: "draft" });
  expect((view.Route as any).validateSearch({ review: "anything", preview: "anything" })).toEqual({});
});
it("rejects captured gameplay callback after owner A→B→A epoch changes", async () => {
  const view = await mountChapter(); await screen.findByText("إجابة صحيحة");
  const oldResolve = state.resolve;
  await act(async () => { state.uid = "u2"; state.epoch++; state.ownerListeners.forEach(fn => fn()); });
  await act(async () => { state.uid = "u1"; state.epoch++; state.ownerListeners.forEach(fn => fn()); });
  const before = JSON.stringify({ ...localStorage }); state.rpc.mockClear();
  await act(async () => { await oldResolve(true); });
  expect(JSON.stringify({ ...localStorage })).toBe(before); expect(state.rpc).not.toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
  view.unmount();
});
it("does not settle local rewards/progress after dispatched save returns to a retired read intent", async () => {
  let release!: (value: unknown) => void;
  state.rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const { progress } = await modules();
  const view = await mountChapter(); await screen.findByText("إجابة صحيحة");
  let pending!: Promise<void>;
  act(() => { pending = state.resolve(true); });
  await waitFor(() => expect(state.rpc).toHaveBeenCalled());
  state.search = { review: "chapter" };
  view.rerender(<view.Component />);
  const before = JSON.stringify({ ...localStorage });
  await act(async () => {
    release({ data: { ok: true, reward_granted_xp: 5, reward_granted_dinars: 2 }, error: null });
    await pending;
  });
  expect(progress.getChapterProgress("c1", "ch1").completed).toBe(false);
  expect(JSON.stringify({ ...localStorage })).toBe(before);
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
});

it("preserves fresh whole-campaign completion modal but suppresses it for explicit review intent", async () => {
  const view = await mountChapter(); await screen.findByText("إجابة صحيحة");
  fireEvent.click(screen.getByText("إجابة صحيحة"));
  await screen.findByTestId("campaign-complete");
  state.search = { review: "chapter" }; view.rerender(<view.Component />);
  expect(screen.queryByTestId("campaign-complete")).toBeNull();
});

it("rejects old mounted-instance callbacks after unmount before any correct or wrong-answer write", async () => {
  const old = await mountChapter(); await screen.findByText("إجابة صحيحة");
  const resolve = state.resolve;
  old.unmount();
  state.search = { review: "chapter" }; await mountChapter();
  const before = JSON.stringify({ ...localStorage }); state.rpc.mockClear(); state.heart.mockClear();
  await act(async () => { await resolve(false); await resolve(true); });
  expect(JSON.stringify({ ...localStorage })).toBe(before);
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.heart).not.toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
});
it("finishes a normal chapter in a partial campaign through acknowledgement without switching into reread", async () => {
  state.campaign.chapters.push({ id: "ch2", title: "التالي", activities: [{ id: "later", type: "reading" }] });
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  fireEvent.click(screen.getByText("إجابة صحيحة"));
  const next = await screen.findByRole("button", { name: "التالي" });
  fireEvent.click(next);
  await screen.findByText("أتممتَ هذا الفصل");
  expect(screen.queryByText(/أنهيتَ هذا الفصل —/)).toBeNull();
  expect(screen.queryByText("وضع المراجعة")).toBeNull();
  expect(screen.getByRole("link", { name: /الفصل التالي/ }).getAttribute("href")).toBe("/campaigns/imported/c1/chapter/ch2");
  const { progress } = await modules();
  expect(progress.getChapterProgress("c1", "ch1").completed).toBe(true);
  expect(progress.getCampaignProgress("c1").completed).toBe(false);
});

it("never resurrects an old heart modal across read intent ABA and opens for a fresh eligible zero-heart admission", async () => {
  // No incidental bankTick render may be needed to show a fresh admission.
  state.refresh.mockImplementation(() => new Promise<void>(() => {}));
  state.hearts = 0;
  const view = await mountChapter();
  await screen.findByTestId("hearts-modal");
  const { progress } = await modules();
  state.campaign.chapters.push({ id: "ch2", title: "التالي", activities: [{ id: "later", type: "reading" }] });
  const ch = state.campaign.chapters[0];
  progress.recordActivity(state.campaign, ch, ch.activities[0], true);
  state.search = { review: "chapter" }; view.rerender(<view.Component />);
  expect(screen.queryByTestId("hearts-modal")).toBeNull();
  state.hearts = 5; state.search = {}; view.rerender(<view.Component />);
  expect(screen.queryByTestId("hearts-modal")).toBeNull();
  state.search = { review: "chapter" }; view.rerender(<view.Component />);
  state.hearts = 0; state.search = {}; view.rerender(<view.Component />);
  await screen.findByTestId("hearts-modal");
});

async function switchOwner(uid: string) {
  await act(async () => { state.uid = uid; state.epoch++; state.ownerListeners.forEach(fn => fn()); });
}
async function installPartition() {
  const { installIdentityPartition } = await import("@/lib/identity/partition");
  installIdentityPartition();
}
it("does not charge owner B's first correct answer for owner A's wrong attempt", async () => {
  await installPartition();
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  await act(async () => { await state.resolve(false); });
  expect(screen.getByText(/إجابة غير صحيحة/)).toBeTruthy();
  await switchOwner("u2");
  expect(screen.queryByText(/إجابة غير صحيحة/)).toBeNull();
  const { progress } = await modules();
  expect(progress.getChapterProgress("c1", "ch1").completedActivityIds).toEqual([]);
  state.points.mockClear(); state.dinars.mockClear();
  await act(async () => { await state.resolve(true); });
  expect(state.points).toHaveBeenCalledWith(5); expect(state.points).not.toHaveBeenCalledWith(2);
  expect(state.dinars).toHaveBeenCalledWith(2);
});
it("retires pending acknowledgement and unsent input on owner change without resetting the surrounding route", async () => {
  await installPartition();
  state.campaign.chapters[0].activities.push({ id: "second", type: "reading", prompt: "التالي" });
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  const heading = screen.getByRole("heading", { level: 1 });
  const input = screen.getByRole("textbox", { name: "إجابتي" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "إجابة الحساب الأول" } });
  await act(async () => { await state.resolve(true); });
  await screen.findByRole("button", { name: "التالي" });
  await switchOwner("u2");
  expect(screen.getByRole("heading", { level: 1 })).toBe(heading);
  expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();
  const fresh = screen.getByRole("textbox", { name: "إجابتي" }) as HTMLInputElement;
  expect(fresh).not.toBe(input); expect(fresh.value).toBe("");
  const { progress } = await modules();
  expect(progress.getChapterProgress("c1", "ch1").completedActivityIds).toEqual([]);
});
it("does not resurrect wrong-attempt maps or input after owner A→B→A epochs", async () => {
  await installPartition(); await mountChapter(); await screen.findByText("إجابة صحيحة");
  await act(async () => { await state.resolve(false); });
  fireEvent.change(screen.getByRole("textbox", { name: "إجابتي" }), { target: { value: "نص قديم" } });
  await switchOwner("u2"); await switchOwner("u1");
  expect(screen.queryByText(/إجابة غير صحيحة/)).toBeNull();
  expect((screen.getByRole("textbox", { name: "إجابتي" }) as HTMLInputElement).value).toBe("");
  state.points.mockClear(); state.dinars.mockClear();
  await act(async () => { await state.resolve(true); });
  expect(state.points).toHaveBeenCalledWith(5); expect(state.dinars).toHaveBeenCalledWith(2);
});
it("preserves same-owner wrong-attempt penalty and activity input while the in-play reading overlay opens", async () => {
  await installPartition();
  state.campaign.chapters[0].introText = "نص الفصل المتاح";
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  await act(async () => { await state.resolve(false); });
  const input = screen.getByRole("textbox", { name: "إجابتي" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "إجابة لم أرسلها" } });
  const before = JSON.stringify({ ...localStorage }); const rpcCount = state.rpc.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "إعادة قراءة نص الفصل" }));
  fireEvent.click(screen.getByRole("button", { name: "العودة إلى النشاط" }));
  expect(screen.getByRole("textbox", { name: "إجابتي" })).toBe(input); expect(input.value).toBe("إجابة لم أرسلها");
  expect(screen.getByText(/إجابة غير صحيحة/)).toBeTruthy();
  expect(JSON.stringify({ ...localStorage })).toBe(before); expect(state.rpc.mock.calls.length).toBe(rpcCount);
  await act(async () => { await state.resolve(true); });
  expect(state.points).toHaveBeenCalledWith(2); expect(state.dinars).toHaveBeenCalledWith(1);
});
it("isolates duplicate-submit locks while retired owner A save settles during owner B pending save", async () => {
  await installPartition();
  const releases: ((value: unknown) => void)[] = [];
  state.rpc.mockImplementation(() => new Promise(resolve => releases.push(resolve)));
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  let first!: Promise<void>; act(() => { first = state.resolve(true); });
  await waitFor(() => expect(releases).toHaveLength(1));
  await switchOwner("u2");
  let second!: Promise<void>; act(() => { second = state.resolve(true); });
  await waitFor(() => expect(releases).toHaveLength(2));
  await act(async () => { await state.resolve(true); }); expect(releases).toHaveLength(2);
  await act(async () => { releases[0]({ data: { ok: true }, error: null }); await first; });
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
  await act(async () => { await state.resolve(true); }); expect(releases).toHaveLength(2);
  await act(async () => { releases[1]({ data: { ok: true }, error: null }); await second; });
  expect(state.points).toHaveBeenCalledTimes(1); expect(state.points).toHaveBeenCalledWith(5);
  expect(state.dinars).toHaveBeenCalledTimes(1); expect(state.dinars).toHaveBeenCalledWith(2);
});
it("suppresses retired save rejection feedback but retains genuine current-owner save errors", async () => {
  await installPartition();
  const sync = await import("@/lib/progressSync");
  let rejectFirst!: (error: Error) => void;
  const save = vi.spyOn(sync, "upsertChapterProgress").mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }));
  await mountChapter(); await screen.findByText("إجابة صحيحة");
  let pending!: Promise<void>; act(() => { pending = state.resolve(true); });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await switchOwner("u2");
  await act(async () => { rejectFirst(new Error("retired failure")); await pending; });
  expect(state.toast).not.toHaveBeenCalled();
  save.mockRejectedValueOnce(new Error("current failure"));
  await act(async () => { await state.resolve(true); });
  expect(state.toast).toHaveBeenCalledTimes(1);
  expect(state.toast).toHaveBeenCalledWith("تعذر حفظ تقدم الفصل. حاول مجددًا.");
  expect(state.points).not.toHaveBeenCalled(); expect(state.dinars).not.toHaveBeenCalled();
});

it("fences wrong-answer UI and resume writes if heart callback synchronously changes owner", async () => {
  await installPartition(); await mountChapter(); await screen.findByText("إجابة صحيحة");
  state.resume.mockClear();
  state.heart.mockImplementationOnce(() => {
    state.uid = "u2"; state.epoch++;
    state.ownerListeners.forEach(fn => fn());
    return { ok: true };
  });
  await act(async () => { await state.resolve(false); });
  // The new owner may receive its own ordinary chapter-entry pointer, never A's activity pointer.
  expect(state.resume.mock.calls).toEqual([[{ campaignId: "c1", chapterId: "ch1" }]]);
  expect(screen.queryByText(/إجابة غير صحيحة/)).toBeNull();
  state.points.mockClear(); state.dinars.mockClear();
  await act(async () => { await state.resolve(true); });
  expect(state.points).toHaveBeenCalledWith(5); expect(state.dinars).toHaveBeenCalledWith(2);
});

it("actual overview with real QueryClient rejects missing feed but seeded synthetic feed makes no query", async () => {
  await seedPartial();
  state.realQuery = true;
  state.feed.mockImplementation(() => { throw Error("unseeded external query prohibited"); });
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { syntheticFeed } = await import("./browser/completed-reread-boundary");
  const { Route: Overview } = await import("@/routes/campaigns.imported.$id.index");
  const Page = (Overview as any).component;
  const makeClient = () => { const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}}); client.setQueryData(["campaign", "c1", "published"], state.campaign); return client; };
  const missing = makeClient();
  const first = render(<QueryClientProvider client={missing}><Page /></QueryClientProvider>);
  await waitFor(() => expect(state.feed).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(missing.getQueryState(["campaigns","feed"])?.status).toBe("error"));
  first.unmount(); missing.clear(); state.feed.mockClear();
  const seeded = makeClient(); const feed=syntheticFeed(state.campaign);
  seeded.setQueryData(["campaigns","feed"],feed);
  const second=render(<QueryClientProvider client={seeded}><Page /></QueryClientProvider>);
  await screen.findByText("أعد القراءة");
  await act(async()=>{await Promise.resolve();});
  expect(state.feed).not.toHaveBeenCalled();
  expect(seeded.getQueryData(["campaigns","feed"])).toEqual(feed);
  expect(screen.getByText("أعد القراءة").closest("a")?.getAttribute("href")).toBe("/campaigns/imported/c1/chapter/ch1?review=chapter");
  second.unmount(); seeded.clear();
});
