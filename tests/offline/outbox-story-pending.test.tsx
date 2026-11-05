import React from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";

const env = vi.hoisted(() => ({
  uid: "alice",
  points: vi.fn(),
  dinars: vi.fn(),
  rpc: vi.fn(),
  enqueue: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
  mirror: vi.fn(),
  streak: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: env.uid } } } }) },
    rpc: (...args: unknown[]) => env.rpc(...args),
  },
}));
vi.mock("@/lib/offline/outbox", () => ({
  enqueueWithId: (...args: unknown[]) => env.enqueue(...args),
  remove: (...args: unknown[]) => env.remove(...args),
}));
vi.mock("@/lib/offline/dead-letter", () => ({
  isPermanentReason: (reason: string) => reason === "not_found",
  archiveRejected: (...args: unknown[]) => env.archive(...args),
}));
vi.mock("@/lib/stories/progress-mirror", () => ({
  upsertProgress: vi.fn(),
  markCompleted: (...args: unknown[]) => env.mirror(...args),
}));
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: env.streak }));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: { loggedIn: true },
    addPoints: env.points,
    addDinars: env.dinars,
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/reflections", () => ({ getReflection: () => null }));
vi.mock("@/components/social/Istazadtu", () => ({ Istazadtu: () => null }));
vi.mock("@/components/stories/player/sceneLayouts", () => ({
  SceneStage: () => <div>مشهد</div>,
  resolveSceneTransition: () => "cut",
}));
vi.mock("@/components/stories/player/SegmentedProgress", () => ({ SegmentedProgress: () => null }));
vi.mock("@/components/stories/player/SceneExportButton", () => ({ SceneExportButton: () => null }));
// Observe the unchanged reward component's input contract, without animation timers.
vi.mock("@/components/stories/player/RewardMoment", () => ({
  RewardMoment: ({ xp, dinars, onDone }: any) => (
    <button data-testid="reward" onClick={onDone}>
      {xp}:{dinars}
    </button>
  ),
}));
import { StoryPlayer } from "@/components/stories/player/StoryPlayer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const ok = () => ({
  data: { ok: true, reward_granted_xp: 60, reward_granted_dinars: 5 },
  error: null,
});
function element(id = "s", completed = false, exit = vi.fn()) {
  return (
    <StoryPlayer
      story={{ id, title_ar: id, xp_reward: 60, dinar_reward: 5 } as any}
      scenes={[{ id: "end", scene_index: 0, scene_type: "reflection" } as any]}
      media={[]}
      summary={null}
      initialSceneIndex={0}
      alreadyCompleted={completed}
      onExit={exit}
    />
  );
}
async function finish() {
  fireEvent.click(screen.getByText("اختم الرحلة"));
  await act(async () => {});
}
function noReward() {
  expect(env.points).not.toHaveBeenCalled();
  expect(env.dinars).not.toHaveBeenCalled();
  expect(screen.queryByTestId("reward")).toBeNull();
  expect(screen.queryByText("اكتملت القصة")).toBeNull();
}
beforeEach(() => {
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  env.uid = "alice";
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  env.enqueue.mockImplementation(async (uid, id, kind, payload) => ({
    id,
    userId: uid,
    kind,
    payload,
  }));
  env.remove.mockResolvedValue(true);
  env.archive.mockResolvedValue(true);
  env.rpc.mockResolvedValue(ok());
  env.streak.mockResolvedValue(undefined);
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
});
it("confirmed uses the current reward amounts and normal ending", async () => {
  render(element());
  await finish();
  expect((await screen.findByTestId("reward")).textContent).toBe("60:5");
  expect(env.points).toHaveBeenCalledExactlyOnceWith(60);
  expect(env.dinars).toHaveBeenCalledExactlyOnceWith(5);
  fireEvent.click(screen.getByTestId("reward"));
  expect(screen.getByText("اكتملت القصة")).toBeTruthy();
});
it("queued shows pending only, with no grants, completed ending or confirmed event", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  const event = vi.fn();
  window.addEventListener("irth:story-completions:changed", event);
  render(element());
  await finish();
  expect(screen.getByText("بانتظار تأكيد الخادم")).toBeTruthy();
  noReward();
  expect(env.mirror).not.toHaveBeenCalled();
  expect(env.streak).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
  window.removeEventListener("irth:story-completions:changed", event);
});
it("queued retry confirms the SAME stable operation and blocks simultaneous retries", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  render(element());
  await finish();
  const gate = deferred<ReturnType<typeof ok>>();
  env.rpc.mockImplementation((name) =>
    name === "complete_story_v2" ? gate.promise : Promise.resolve(ok()),
  );
  Object.defineProperty(navigator, "onLine", { value: true });
  fireEvent.click(screen.getByText("إعادة التحقق"));
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(env.rpc.mock.calls.filter(([name]) => name === "complete_story_v2")).toHaveLength(1);
  await act(async () => {
    gate.resolve(ok());
  });
  expect(await screen.findByTestId("reward")).toBeTruthy();
  const ids = env.enqueue.mock.calls
    .filter(([, , kind]) => kind === "story_completion")
    .map(([, id]) => id);
  expect(ids).toEqual(["story_completion:alice:s", "story_completion:alice:s"]);
  expect(env.points).toHaveBeenCalledTimes(1);
});
it("storage deadline stays unresolved, never known queued", async () => {
  render(element());
  await act(async () => {});
  const gate = deferred<any>();
  env.enqueue.mockImplementation((_uid, _id, kind) =>
    kind === "story_completion" ? gate.promise : Promise.resolve({}),
  );
  vi.useFakeTimers();
  fireEvent.click(screen.getByText("اختم الرحلة"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8001);
  });
  expect(screen.getByText("نتيجة الحفظ غير محسومة")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noReward();
  await act(async () => {
    gate.resolve({});
  });
  noReward();
});
it("failed storage and failed RPC offer retry without a fictitious saved state", async () => {
  render(element());
  await act(async () => {});
  env.enqueue.mockRejectedValue(new Error("quota"));
  env.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  await finish();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByText("إعادة المحاولة")).toBeTruthy();
  noReward();
});
it("permanent rejection does not become pending even if archive fails", async () => {
  env.rpc.mockResolvedValue({ data: { ok: false, reason: "not_found" }, error: null });
  env.archive.mockResolvedValue(false);
  render(element());
  await finish();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noReward();
});
it("missing receipt is not confirmation", async () => {
  env.enqueue.mockRejectedValue(new Error("missing receipt"));
  env.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  render(element());
  await finish();
  noReward();
  expect(screen.getByRole("alert")).toBeTruthy();
});
for (const boundary of ["unmount", "exit", "account", "epoch-return", "story"] as const) {
  it("fences delayed completion after " + boundary, async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    env.rpc.mockImplementation((name) =>
      name === "complete_story_v2" ? gate.promise : Promise.resolve(ok()),
    );
    const view = render(element());
    await finish();
    if (boundary === "unmount") view.unmount();
    if (boundary === "exit") fireEvent.keyDown(window, { key: "Escape" });
    if (boundary === "account" || boundary === "epoch-return") {
      await act(async () => {
        env.uid = "bob";
        setActiveOwnerInternal("user:bob");
      });
      if (boundary === "epoch-return")
        await act(async () => {
          env.uid = "alice";
          setActiveOwnerInternal("user:alice");
        });
    }
    if (boundary === "story") view.rerender(element("other"));
    await act(async () => {
      gate.resolve(ok());
    });
    noReward();
  });
}
it("Alice finally does not release Bob's active single-flight guard", async () => {
  const alice = deferred<ReturnType<typeof ok>>(),
    bob = deferred<ReturnType<typeof ok>>();
  env.rpc.mockImplementation((name) =>
    name === "complete_story_v2"
      ? env.uid === "alice"
        ? alice.promise
        : bob.promise
      : Promise.resolve(ok()),
  );
  render(element());
  await finish();
  await act(async () => {
    env.uid = "bob";
    setActiveOwnerInternal("user:bob");
  });
  await finish();
  await act(async () => {
    alice.resolve(ok());
  });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await act(async () => {});
  expect(env.rpc.mock.calls.filter(([name]) => name === "complete_story_v2")).toHaveLength(2);
  await act(async () => {
    bob.resolve(ok());
  });
  expect(env.points).toHaveBeenCalledTimes(1);
});
it("confirmed replay stays silent and never submits completion", async () => {
  render(element("s", true));
  await finish();
  expect(screen.getByText("اكتملت القصة")).toBeTruthy();
  expect(env.rpc).not.toHaveBeenCalled();
  expect(env.points).not.toHaveBeenCalled();
});

it("retry rejection replaces pending with an honest failure", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  render(element());
  await finish();
  Object.defineProperty(navigator, "onLine", { value: true });
  env.rpc.mockResolvedValue({ data: { ok: false, reason: "not_found" }, error: null });
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("بانتظار تأكيد الخادم")).toBeNull();
  noReward();
});
it("pending close is safe and leaves legacy storage untouched without entitlements", async () => {
  localStorage.setItem("synthetic-v17", '{"completed":["old"]}');
  const before = { ...localStorage };
  Object.defineProperty(navigator, "onLine", { value: false });
  const exit = vi.fn();
  render(element("s", false, exit));
  await finish();
  fireEvent.click(screen.getByText("إغلاق"));
  expect(exit).toHaveBeenCalledTimes(1);
  expect({ ...localStorage }).toEqual(before);
  expect(Object.keys(localStorage).some((key) => /entitlement|delivered/.test(key))).toBe(false);
  noReward();
});

it("account swap while durable enqueue waits prevents the old completion RPC", async () => {
  const gate = deferred<any>();
  env.enqueue.mockImplementation((uid, id, kind, payload) =>
    kind === "story_completion"
      ? gate.promise
      : Promise.resolve({ id, userId: uid, kind, payload }),
  );
  render(element());
  await finish();
  await act(async () => {
    env.uid = "bob";
    setActiveOwnerInternal("user:bob");
  });
  await act(async () => {
    gate.resolve({ id: "story_completion:alice:s" });
  });
  expect(env.rpc.mock.calls.filter(([name]) => name === "complete_story_v2")).toHaveLength(0);
  noReward();
});
it("simultaneous ending events submit and grant only once", async () => {
  const gate = deferred<ReturnType<typeof ok>>();
  env.rpc.mockImplementation((name) =>
    name === "complete_story_v2" ? gate.promise : Promise.resolve(ok()),
  );
  render(element());
  await finish();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await act(async () => {});
  expect(env.rpc.mock.calls.filter(([name]) => name === "complete_story_v2")).toHaveLength(1);
  await act(async () => {
    gate.resolve(ok());
  });
  expect(env.points).toHaveBeenCalledTimes(1);
});
it("rechecking after a missing row still requires a fresh server acknowledgement", async () => {
  Object.defineProperty(navigator, "onLine", { value: false });
  render(element());
  await finish();
  Object.defineProperty(navigator, "onLine", { value: true });
  env.enqueue.mockRejectedValue(new Error("receipt unavailable"));
  env.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  fireEvent.click(screen.getByText("إعادة التحقق"));
  await act(async () => {});
  expect(screen.getByRole("alert")).toBeTruthy();
  noReward();
});
