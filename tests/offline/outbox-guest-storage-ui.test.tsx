import React from "react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import {
  installIdentityPartition,
  __uninstallPartitionForTests,
  physicalKey,
} from "@/lib/identity/partition";
import {
  __resetIdentityForTests,
  setActiveOwnerInternal,
  getActiveOwner,
} from "@/lib/identity/owner";
const env = vi.hoisted(() => ({
  points: vi.fn(),
  dinars: vi.fn(),
  toast: vi.fn(),
  daily: vi.fn(),
  session: vi.fn(),
  uid: null as string | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: env.uid ? { id: env.uid } : null } }) },
  },
}));
vi.mock("@/lib/offline/gameplay-write", () => ({
  saveUserId: () => env.session(),
  saveAccepted: () => false,
}));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: { loggedIn: !!env.uid, dinars: 100, hearts: 5 },
    addPoints: env.points,
    addDinars: env.dinars,
    spendDinars: () => true,
    loseHeartOnce: () => 5,
    hasHearts: () => true,
    recordStreakActivity: async () => {},
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
  useParams: () => ({ mode: "memory", slug: "g" }),
  createFileRoute: () => (options: any) => options,
  Link: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
vi.mock("@/lib/stories/progress", () => ({
  recordStoryProgress: async () => ({ acknowledged: false }),
  completeStory: vi.fn(),
}));
vi.mock("@/lib/reflections", () => ({ getReflection: () => null }));
vi.mock("@/components/social/Istazadtu", () => ({ Istazadtu: () => null }));
vi.mock("@/components/stories/player/sceneLayouts", () => ({
  SceneStage: () => <div>مشهد</div>,
  resolveSceneTransition: () => "fade",
}));
vi.mock("@/components/stories/player/SegmentedProgress", () => ({ SegmentedProgress: () => null }));
vi.mock("@/components/stories/player/SceneExportButton", () => ({ SceneExportButton: () => null }));
vi.mock("@/components/stories/player/RewardMoment", () => ({
  RewardMoment: () => <div data-testid="reward" />,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
  Screen: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ReadingScale", () => ({
  ReadingScale: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/lib/games/store", () => ({
  getGameBySlug: async () => ({
    id: "g",
    mode: "memory",
    status: "published",
    title: "تحدي",
    stages: [{}],
    xp_reward: 100,
    coin_reward: 100,
    metadata: {},
  }),
}));
vi.mock("@/lib/games/progress", () => ({
  recordCompletion: vi.fn(),
  getMyProgress: async () => ({ completed: false }),
}));
vi.mock("@/lib/games/dailyChallengeService", () => ({
  markDailyChallengeCompletedLocally: env.daily,
}));
vi.mock("@/components/games/GameStageRenderer", () => ({
  GameStageRenderer: ({ onComplete }: any) => (
    <button onClick={() => void onComplete(100)}>إنهاء التحدي</button>
  ),
}));
vi.mock("@/components/games/GameTimer", () => ({ GameTimer: () => null }));
vi.mock("@/components/games/help/GameHelpContext", () => ({
  GameHelpProvider: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/games/help/HelpErrorBoundary", () => ({
  HelpErrorBoundary: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/games/help/GameHelpDialog", () => ({ GameHelpDialog: () => null }));
vi.mock("@/components/games/CrosswordHelpDialog", () => ({ CrosswordHelpDialog: () => null }));
vi.mock("@/components/games/TimeExpiredDialog", () => ({ TimeExpiredDialog: () => null }));
vi.mock("@/components/games/ExitConfirmDialog", () => ({ ExitConfirmDialog: () => null }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: () => null,
}));
vi.mock("@/components/games/sfx", () => ({ sfx: vi.fn() }));
vi.mock("@/lib/games/museumUnlocks", () => ({
  extractMuseumUnlocks: () => [],
  museumUnlocksToCollectionItems: () => [],
}));
vi.mock("@/lib/campaignLedger", () => ({ enqueueCollectionSync: vi.fn() }));
vi.mock("@/lib/audioManager", () => ({ audioManager: { playSfx: vi.fn() } }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({ androidMark: () => {} }));
vi.mock("@/components/motion/MotionPrimitives", () => ({
  AnimatedNumber: ({ value }: any) => <span>{value}</span>,
}));
vi.mock("sonner", () => ({ toast: { error: env.toast, success: vi.fn() } }));
vi.mock("@/lib/stories/summary", () => ({
  storyState: () => "completed",
  progressFraction: () => 0,
}));
vi.mock("@/lib/stories/covers", () => ({ useStoryCoverSrc: () => "/synthetic-cover" }));
vi.mock("@/components/stories/LockedStoryDialog", () => ({ LockedStoryDialog: () => null }));
import { StoryCard } from "@/components/stories/StoryCard";
import { StoryPlayer } from "@/components/stories/player/StoryPlayer";
import { Route } from "@/routes/games.$mode.$slug";
const Game = (Route as unknown as { component: React.ComponentType }).component;
const original = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
function locks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, _o: unknown, fn: () => unknown) => {
      const p = (tails.get(name) ?? Promise.resolve()).then(fn);
      tails.set(
        name,
        p.catch(() => {}),
      );
      return p;
    },
  };
}
function story() {
  return render(
    <StoryPlayer
      story={{ id: "s", title_ar: "قصة", xp_reward: 60, dinar_reward: 5 } as any}
      scenes={[{ id: "end", scene_index: 0, scene_type: "reflection" } as any]}
      media={[]}
      summary={null}
      initialSceneIndex={0}
      alreadyCompleted={false}
      onExit={() => {}}
    />,
  );
}
function fail() {
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
}
beforeEach(() => {
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, original);
  localStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("guest:test");
  installIdentityPartition();
  vi.clearAllMocks();
  env.uid = null;
  env.session.mockResolvedValue(null);
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks() });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, original);
  vi.unstubAllGlobals();
});
it("real StoryPlayer does not grant or show reward after quota and can retry", async () => {
  story();
  const spy = fail();
  fireEvent.click(screen.getByText("اختم الرحلة"));
  await screen.findByRole("alert");
  expect(env.points).not.toHaveBeenCalled();
  expect(env.dinars).not.toHaveBeenCalled();
  expect(screen.queryByTestId("reward")).toBeNull();
  spy.mockRestore();
  fireEvent.click(screen.getByText("إعادة المحاولة"));
  await screen.findByTestId("reward");
  expect(env.points).toHaveBeenCalledExactlyOnceWith(60);
  expect(env.dinars).toHaveBeenCalledExactlyOnceWith(5);
});
it("StoryPlayer replay of saved completion is reward-silent even with stale props", async () => {
  localStorage.setItem(physicalKey("irth.guest.storyCompletions.v1", getActiveOwner()), '["s"]');
  story();
  fireEvent.click(screen.getByText("اختم الرحلة"));
  await waitFor(() => expect(screen.queryByText("اختم الرحلة")).toBeNull());
  expect(env.points).not.toHaveBeenCalled();
  expect(screen.queryByTestId("reward")).toBeNull();
});
it("guest story waiting for lock cannot grant after identity switch", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  Object.defineProperty(navigator, "locks", {
    value: { request: (_n: string, _o: unknown, fn: () => unknown) => gate.then(fn) },
  });
  story();
  fireEvent.click(screen.getByText("اختم الرحلة"));
  env.uid = "alice";
  setActiveOwnerInternal("user:alice");
  await act(async () => {
    release();
    await gate;
  });
  expect(env.points).not.toHaveBeenCalled();
  expect(env.dinars).not.toHaveBeenCalled();
  expect(screen.queryByTestId("reward")).toBeNull();
});
it("real game route quota does not grant/mark completion; retry retains caps", async () => {
  render(<Game />);
  await screen.findByText("إنهاء التحدي");
  const spy = fail();
  fireEvent.click(screen.getByText("إنهاء التحدي"));
  await waitFor(() => expect(env.toast).toHaveBeenCalled());
  expect(env.points).not.toHaveBeenCalled();
  expect(env.dinars).not.toHaveBeenCalled();
  expect(env.daily).not.toHaveBeenCalled();
  expect(screen.queryByText("اكتملت الرحلة")).toBeNull();
  spy.mockRestore();
  fireEvent.click(screen.getByText("إنهاء التحدي"));
  await waitFor(() => expect(env.daily).toHaveBeenCalled());
  expect(env.points).toHaveBeenCalledExactlyOnceWith(40);
  expect(env.dinars).toHaveBeenCalledExactlyOnceWith(20);
});
it("real game route exposes unknown ledger read and recovery without pretending it is empty", async () => {
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
  render(<Game />);
  await screen.findByRole("alert");
  expect(screen.queryByText("إنهاء التحدي")).toBeNull();
  spy.mockRestore();
  fireEvent.click(screen.getByText("إعادة المحاولة"));
  await screen.findByText("إنهاء التحدي");
  expect(env.points).not.toHaveBeenCalled();
});
it("guest game session wait cannot write or grant after sign-in", async () => {
  let done!: (v: null) => void;
  env.session.mockReturnValue(
    new Promise<null>((r) => {
      done = r;
    }),
  );
  render(<Game />);
  await screen.findByText("إنهاء التحدي");
  fireEvent.click(screen.getByText("إنهاء التحدي"));
  env.uid = "alice";
  setActiveOwnerInternal("user:alice");
  await act(async () => {
    done(null);
  });
  expect(env.points).not.toHaveBeenCalled();
  expect(env.dinars).not.toHaveBeenCalled();
  expect(env.daily).not.toHaveBeenCalled();
});

it("StoryCard surfaces unknown history rather than a false completed/new badge", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
  render(
    <StoryCard
      story={
        {
          id: "s",
          title_ar: "قصة",
          unlocked: true,
          scene_count: 1,
          xp_reward: 10,
          dinar_reward: 3,
        } as any
      }
    />,
  );
  expect(screen.getByText("تعذر التحقق من سجل الإكمال")).toBeTruthy();
  expect(screen.queryByText("مكتملة")).toBeNull();
  expect(screen.queryByText("جديدة")).toBeNull();
});
