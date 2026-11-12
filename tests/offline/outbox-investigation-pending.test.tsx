import React from "react";
import { createHash } from "node:crypto";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
const state = vi.hoisted(() => ({
  uid: "alice",
  enqueue: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
  badge: vi.fn(),
  streak: vi.fn(),
  stats: vi.fn(),
  clear: vi.fn(),
  opened: vi.fn(),
  sfx: vi.fn(),
  confirmed: false,
  canonicalPending: false,
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
    awardBadge: state.badge,
    recoverHeartFromActivity: state.heart,
    recoverHeartsFromActivities: async (activities: Iterable<unknown>) => {
      let gained = 0;
      for (const activity of activities) if (state.heart(activity)?.ok) gained++;
      return { status: gained ? "written" : "unchanged", gained };
    },
    recordStreakActivity: state.streak,
    applyServerStats: state.stats,
    loseHeartOnce: vi.fn(),
  }),
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
vi.mock("@/lib/audioManager", () => ({ audioManager: { playSfx: state.sfx } }));
vi.mock("@/lib/investigations-source", () => ({
  useSupabaseInvestigation: () => ({ row: state.investigation }),
  displayDifficulty: () => "سهل",
}));
vi.mock("@/lib/investigations/progress", async (original) => ({
  ...(await original<object>()),
  useCanonicalInvestigationProgress: () => ({ matches: () => state.canonicalPending }),
  useInvestigationProgress: () => ({
    uid: state.uid,
    completedIds: new Set<string>(state.confirmed ? ["inv1"] : []),
  }),
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
  markInvestigationOpened: state.opened,
  clearInvestigationOpened: state.clear,
}));
vi.mock("@/components/investigations/CaseHero", () => ({ CaseHero: () => null }));
vi.mock("@/components/investigations/CaseTimeline", () => ({
  CaseTimeline: () => null,
  phaseForStep: () => "end",
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
vi.mock("@/lib/offline/outbox", () => ({
  enqueueWithId: (...args: unknown[]) => state.enqueue(...args),
  remove: (...args: unknown[]) => state.remove(...args),
}));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: vi.fn() }));
vi.mock("@/lib/offline/dead-letter", () => ({
  isPermanentReason: (reason: string) => reason === "investigation_not_found",
  archiveRejected: (...args: unknown[]) => state.archive(...args),
}));
import { Route } from "@/routes/investigation.$id";
import { recordInvestigationCompletion } from "@/lib/investigations/progress";
const Player = (Route as unknown as { component: React.ComponentType }).component;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const granted = () => ({
  data: {
    ok: true,
    applied: true,
    xp_earned: 7,
    dinars_earned: 3,
    hearts_earned: 1,
  },
  error: null,
});
function mount() {
  return render(<Player />);
}
async function finish() {
  fireEvent.click(screen.getByRole("button", { name: "إنهاء التحقيق" }));
  await act(async () => {});
}
function noEffects() {
  expect(state.marker).not.toHaveBeenCalled();
  expect(state.clear).not.toHaveBeenCalled();
  expect(state.badge).not.toHaveBeenCalled();
  expect(state.heart).not.toHaveBeenCalled();
  expect(state.streak).not.toHaveBeenCalled();
  expect(state.stats).not.toHaveBeenCalled();
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
  expect(state.sfx.mock.calls.filter(([name]) => name === "campaign-complete")).toHaveLength(0);
  expect(screen.queryByText("✓ القضية أُغلقت")).toBeNull();
  expect(screen.queryByText("تم الإغلاق")).toBeNull();
  expect(screen.queryByText("تم حل القضية بنجاح")).toBeNull();
}
beforeEach(() => {
  vi.clearAllMocks();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  // Real SHA-256 bytes with a deterministic Promise schedule; selected race
  // tests replace digest with an explicitly controlled deferred operation.
  vi.stubGlobal("crypto", {
    subtle: {
      digest: async (_algorithm: string, data: Uint8Array) =>
        Uint8Array.from(createHash("sha256").update(data).digest()).buffer,
    },
  });
  state.uid = "alice";
  state.confirmed = false;
  state.canonicalPending = false;
  state.investigation = {
    id: "inv1",
    slug: "case-one",
    title: "قضية",
    steps: [{ type: "conclusion", text: "خاتمة التحقيق" }],
    reward: { xp: 1100, dinars: 500, hearts: 5, badge: "detective" },
  };
  state.enqueue.mockImplementation(async (uid, id, kind, payload) => ({
    id,
    userId: uid,
    kind,
    payload,
  }));
  state.remove.mockResolvedValue(true);
  state.archive.mockResolvedValue(true);
  state.heart.mockReturnValue({ ok: true });
  state.streak.mockResolvedValue(undefined);
  state.rpc.mockImplementation(async (name) =>
    name === "get_my_profile"
      ? { data: { xp: 107, dinars: 23, hearts: 4 }, error: null }
      : granted(),
  );
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("confirmed closes using server reward numbers and only its heart count", async () => {
  mount();
  await finish();
  expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
  expect(screen.getByText("+7")).toBeTruthy();
  expect(screen.getByText("+3")).toBeTruthy();
  expect(screen.queryByText("+1100")).toBeNull();
  expect(state.heart).toHaveBeenCalledExactlyOnceWith({ kind: "investigation", id: "case-one:0" });
  expect(state.badge).toHaveBeenCalledExactlyOnceWith("detective");
  expect(state.marker).toHaveBeenCalledExactlyOnceWith("case-one");
  expect(state.clear).toHaveBeenCalledExactlyOnceWith("case-one");
  expect(state.stats).toHaveBeenCalledWith(expect.objectContaining({ xp: 107, hearts: 4 }));
});
it("queued renders pending and blocks EVERY completion and reward effect", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  await finish();
  expect(screen.getByText("بانتظار تأكيد الخادم")).toBeTruthy();
  noEffects();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("canonical pending contribution cannot initialize a confirmed closed screen", async () => {
  state.canonicalPending = true;
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  expect(screen.getByText("خاتمة التحقيق")).toBeTruthy();
  await finish();
  expect(screen.getByText("بانتظار تأكيد الخادم")).toBeTruthy();
  noEffects();
});
it("unresolved storage propagates and never claims queued", async () => {
  const gate = deferred<any>();
  state.enqueue.mockReturnValue(gate.promise);
  mount();
  vi.useFakeTimers();
  fireEvent.click(screen.getByText("إنهاء التحقيق"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8001);
  });
  expect(screen.getByText("نتيجة الحفظ غير محسومة")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noEffects();
  await act(async () => {
    gate.resolve({});
  });
  noEffects();
});
it("recorder exposes unresolved storageState unchanged", async () => {
  const gate = deferred<any>();
  state.enqueue.mockReturnValue(gate.promise);
  vi.useFakeTimers();
  const result = recordInvestigationCompletion({ investigationId: "inv1" });
  await vi.advanceTimersByTimeAsync(8001);
  expect(await result).toMatchObject({
    acknowledged: false,
    queued: false,
    storageState: "unresolved",
    reason: "storage_pending",
  });
  gate.resolve({});
  await gate.promise;
});
it("storage plus RPC failure offers retry without claiming a saved completion", async () => {
  state.enqueue.mockRejectedValue(new Error("quota"));
  state.rpc.mockRejectedValue(new Error("offline"));
  mount();
  await finish();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByText("إعادة التحقق")).toBeTruthy();
  noEffects();
});
it("permanent rejection with retained receipt is failed, not pending", async () => {
  state.archive.mockResolvedValue(false);
  state.rpc.mockResolvedValue({
    data: { ok: false, reason: "investigation_not_found" },
    error: null,
  });
  mount();
  await finish();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noEffects();
});
it("queued retry confirms with exactly the original delta and payload", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  await finish();
  noEffects();
  Object.defineProperty(navigator, "onLine", { value: true });
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
  const writes = state.enqueue.mock.calls;
  expect(writes).toHaveLength(2);
  expect(writes[0].slice(0, 4)).toEqual(writes[1].slice(0, 4));
  expect(
    state.rpc.mock.calls.find(([name]) => name === "complete_investigation_v2")?.[1].p_delta_id,
  ).toBe(writes[0][1]);
  expect(state.heart).toHaveBeenCalledTimes(1);
});
for (const flags of [
  { applied: false, already_completed: true },
  { applied: false, already_granted: true },
  { applied: true, already_granted: true },
]) {
  it(
    "replayed server response does not regrant hearts or badges: " + JSON.stringify(flags),
    async () => {
      state.rpc.mockResolvedValue({ data: { ...granted().data, ...flags }, error: null });
      mount();
      await finish();
      expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
      expect(screen.getByText("سُجِّل هذا الملف سابقًا — لا مكافآت مكرّرة.")).toBeTruthy();
      expect(state.heart).not.toHaveBeenCalled();
      expect(state.badge).not.toHaveBeenCalled();
      expect(screen.queryByText("+7")).toBeNull();
    },
  );
}
it("already confirmed server progress opens silently without a new request", () => {
  state.confirmed = true;
  mount();
  expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
  expect(state.enqueue).not.toHaveBeenCalled();
  expect(state.heart).not.toHaveBeenCalled();
});
for (const kind of ["account", "epoch-return", "unmount", "investigation"] as const) {
  it("fences a delayed RPC after " + kind, async () => {
    const gate = deferred<ReturnType<typeof granted>>();
    state.rpc.mockReturnValue(gate.promise);
    const view = mount();
    await finish();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    if (kind === "account" || kind === "epoch-return") {
      await act(async () => {
        state.uid = "bob";
        setActiveOwnerInternal("user:bob");
      });
      if (kind === "epoch-return")
        await act(async () => {
          state.uid = "alice";
          setActiveOwnerInternal("user:alice");
        });
    }
    if (kind === "unmount") view.unmount();
    if (kind === "investigation") {
      state.investigation = { ...state.investigation, id: "inv2", slug: "case-two" };
      view.rerender(<Player />);
    }
    // Ignore mount bookkeeping of the new screen, then resolve the old RPC.
    state.clear.mockClear();
    await act(async () => {
      gate.resolve(granted());
    });
    noEffects();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
}
it("delayed SHA-256 cannot enqueue or call RPC after owner epoch changes", async () => {
  const gate = deferred<ArrayBuffer>();
  vi.stubGlobal("crypto", { subtle: { digest: vi.fn(() => gate.promise) } });
  mount();
  await finish();
  expect(state.enqueue).not.toHaveBeenCalled();
  await act(async () => {
    state.uid = "bob";
    setActiveOwnerInternal("user:bob");
    state.uid = "alice";
    setActiveOwnerInternal("user:alice");
  });
  await act(async () => {
    gate.resolve(new Uint8Array(32).buffer);
  });
  expect(state.enqueue).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
  noEffects();
});
it("session changed without a matching owner cannot use the old uid after hash", async () => {
  const gate = deferred<ArrayBuffer>();
  vi.stubGlobal("crypto", { subtle: { digest: () => gate.promise } });
  mount();
  await finish();
  state.uid = "bob";
  await act(async () => {
    gate.resolve(new Uint8Array(32).buffer);
  });
  expect(state.enqueue).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
  noEffects();
});
it("double tap makes one completion request and one local grant", async () => {
  const gate = deferred<ReturnType<typeof granted>>();
  state.rpc.mockImplementation((name) =>
    name === "complete_investigation_v2"
      ? gate.promise
      : Promise.resolve({ data: null, error: null }),
  );
  mount();
  fireEvent.click(screen.getByText("إنهاء التحقيق"));
  fireEvent.click(screen.getByText("إنهاء التحقيق"));
  await act(async () => {});
  expect(
    state.rpc.mock.calls.filter(([name]) => name === "complete_investigation_v2"),
  ).toHaveLength(1);
  await act(async () => {
    gate.resolve(granted());
  });
  expect(state.marker).toHaveBeenCalledTimes(1);
  expect(state.heart).toHaveBeenCalledTimes(1);
});
it("old finally cannot release Bob's ongoing completion guard", async () => {
  const alice = deferred<ReturnType<typeof granted>>(),
    bob = deferred<ReturnType<typeof granted>>();
  state.rpc.mockImplementation((name) =>
    name === "complete_investigation_v2"
      ? state.uid === "alice"
        ? alice.promise
        : bob.promise
      : Promise.resolve({ data: null, error: null }),
  );
  mount();
  await finish();
  await act(async () => {
    state.uid = "bob";
    setActiveOwnerInternal("user:bob");
  });
  await finish();
  await act(async () => {
    alice.resolve(granted());
  });
  await finish();
  expect(
    state.rpc.mock.calls.filter(([name]) => name === "complete_investigation_v2"),
  ).toHaveLength(2);
  await act(async () => {
    bob.resolve(granted());
  });
  expect(state.heart).toHaveBeenCalledTimes(1);
});
it("late reconciliation stats after account swap cannot change the new profile", async () => {
  const gate = deferred<any>();
  state.rpc.mockImplementation((name) =>
    name === "get_my_profile" ? gate.promise : Promise.resolve(granted()),
  );
  mount();
  await finish();
  expect(state.marker).toHaveBeenCalledTimes(1);
  await act(async () => {
    state.uid = "bob";
    setActiveOwnerInternal("user:bob");
  });
  await act(async () => {
    gate.resolve({ data: { xp: 999 }, error: null });
  });
  expect(state.stats).not.toHaveBeenCalled();
});
it("swap while awaiting streak cannot start an old get_my_profile RPC", async () => {
  const gate = deferred<void>();
  state.streak.mockReturnValue(gate.promise);
  mount();
  await finish();
  await act(async () => {
    state.uid = "bob";
    setActiveOwnerInternal("user:bob");
  });
  await act(async () => {
    gate.resolve();
  });
  expect(state.rpc.mock.calls.map(([name]) => name)).toEqual(["complete_investigation_v2"]);
  expect(state.stats).not.toHaveBeenCalled();
});
it("pending/retry keeps question answers and presentation mapping intact", async () => {
  state.investigation.steps = [
    {
      type: "question",
      text: "من صاحب الدليل؟",
      options: ["صحيح", "خطأ", "غير ذلك"],
      correctAnswer: 0,
    },
  ];
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  const order = Array.from(document.querySelectorAll("button")).map((b) => b.textContent);
  fireEvent.click(screen.getByRole("button", { name: /صحيح/ }));
  fireEvent.click(screen.getByText("تأكيد الإجابة"));
  await finish();
  expect(screen.getByText("بانتظار تأكيد الخادم")).toBeTruthy();
  expect(screen.queryByText("تأكيد الإجابة")).toBeNull();
  const after = Array.from(document.querySelectorAll("button")).map((b) => b.textContent);
  expect(after.filter((t) => order.includes(t))).toEqual(
    order.filter((t) => !t?.includes("تأكيد الإجابة")),
  );
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(state.enqueue.mock.calls[1][3]).toEqual({
    investigationId: "inv1",
    score: 1,
    correctCount: 1,
  });
});
it("missing receipt never substitutes for server confirmation", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  await finish();
  Object.defineProperty(navigator, "onLine", { value: true });
  state.enqueue.mockRejectedValue(new Error("missing receipt"));
  state.rpc.mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(screen.getByRole("alert")).toBeTruthy();
  noEffects();
});
it("pending leaves V17 bytes intact without entitlement or delivered records", async () => {
  localStorage.setItem("v17.synthetic.progress", '{"completed":["old"]}');
  const before = { ...localStorage };
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  await finish();
  expect({ ...localStorage }).toEqual(before);
  expect(Object.keys(localStorage).some((key) => /entitlement|delivered/.test(key))).toBe(false);
  noEffects();
});
it("keeps the pre-existing SHA-256 stable delta known vector", async () => {
  await recordInvestigationCompletion({ investigationId: "inv1", score: 2 });
  expect(state.enqueue.mock.calls[0][1]).toBe("048e0b54-3d12-4e52-84bf-b2f7e8d4fbe5");
  expect(state.rpc.mock.calls[0]).toEqual([
    "complete_investigation_v2",
    {
      p_investigation_id: "inv1",
      p_delta_id: "048e0b54-3d12-4e52-84bf-b2f7e8d4fbe5",
      p_score: 2,
      p_correct_count: 0,
    },
  ]);
});
it("refuses a session uid that already disagrees with the active owner", async () => {
  state.uid = "bob";
  const outcome = await recordInvestigationCompletion({ investigationId: "inv1" });
  expect(outcome).toMatchObject({ acknowledged: false, reason: "identity_changed" });
  expect(state.enqueue).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});
it("server zero hearts cannot fall back to authored hearts", async () => {
  state.rpc.mockResolvedValue({ data: { ...granted().data, hearts_earned: 0 }, error: null });
  mount();
  await finish();
  expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
  expect(state.heart).not.toHaveBeenCalled();
});
it("continues respecting the existing local cooldown/full outcome", async () => {
  state.heart.mockReturnValue({ ok: false, reason: "cooldown" });
  mount();
  await finish();
  expect(state.heart).toHaveBeenCalledTimes(1);
  expect(screen.getByText("✓ القضية أُغلقت")).toBeTruthy();
  expect(state.points).not.toHaveBeenCalled();
  expect(state.dinars).not.toHaveBeenCalled();
});
it("rejecting a queued retry removes pending and still grants nothing", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  mount();
  await finish();
  Object.defineProperty(navigator, "onLine", { value: true });
  state.rpc.mockResolvedValue({
    data: { ok: false, reason: "investigation_not_found" },
    error: null,
  });
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noEffects();
});
