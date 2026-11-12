import React, { StrictMode, startTransition, useLayoutEffect } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProfileProvider, useProfile } from "@/lib/profile";
import {
  __resetIdentityForTests,
  setActiveOwnerInternal,
  getActiveOwner,
} from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";

vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => asyncEnv.claims(...args),
    auth: {
      getSession: () => asyncEnv.session(),
    },
  },
}));

const asyncEnv = vi.hoisted(() => ({
  streak: vi.fn(),
  avatar: vi.fn(),
  claims: vi.fn(),
  session: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/lib/streak-activity", () => ({
  recordStreakActivity: (...args: any[]) => asyncEnv.streak(...args),
}));
vi.mock("@/lib/emblems/avatar-persistence", () => ({
  persistAvatarSelection: (...args: any[]) => asyncEnv.avatar(...args),
}));
vi.mock("@/lib/identity/reset", () => ({
  resetForIdentityChange: (...args: any[]) => asyncEnv.reset(...args),
}));
type Api = ReturnType<typeof useProfile>;
function seed(points = 100, dinars = 50) {
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({
      name: "Synthetic",
      loggedIn: getActiveOwner().startsWith("user:"),
      points,
      dinars,
      hearts: 3,
      heartsAt: Date.now(),
      streak: 2,
    }),
  );
}
function harness(strict = false) {
  const ref = { api: null as Api | null };
  function Probe() {
    ref.api = useProfile();
    return null;
  }
  const tree = (
    <ProfileProvider>
      <Probe />
    </ProfileProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    view,
    get api() {
      return ref.api!;
    },
  };
}
function saved() {
  return JSON.parse(localStorage.getItem("hakaya.profile.v2")!);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  asyncEnv.streak.mockReset();
  asyncEnv.avatar.mockReset();
  asyncEnv.claims.mockReset();
  asyncEnv.session.mockReset();
  asyncEnv.reset.mockReset();
  asyncEnv.session.mockImplementation(async () => ({
    data: {
      session: getActiveOwner().startsWith("user:")
        ? { user: { id: getActiveOwner().slice(5) } }
        : null,
    },
  }));
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  seed();
  vi.stubGlobal("indexedDB", new IDBFactory());
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
  vi.unstubAllGlobals();
});

async function switchOwner(owner: string, points = 200) {
  await act(async () => {
    setActiveOwnerInternal(owner);
    seed(points);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
}
for (const aba of [false, true])
  it(
    "creation-bound addPoints rejects retained action after " + (aba ? "ABA" : "Alice to Bob"),
    async () => {
      const h = harness(),
        old = h.api.addPoints;
      await switchOwner("user:bob");
      if (aba) await switchOwner("user:alice", 100);
      await act(async () => {
        old(7);
      });
      expect(h.api.profile.points).toBe(aba ? 100 : 200);
      expect(saved().points).toBe(aba ? 100 : 200);
      // Positive control: the actual target session remains writable.
      await act(async () => {
        h.api.addPoints(3);
        h.api.addDinars(2);
      });
      expect(saved().points).toBe(aba ? 103 : 203);
      expect(saved().dinars).toBe(52);
      await act(async () => {
        old(7);
      });
      expect(saved().points).toBe(aba ? 103 : 203);
    },
  );

// Every public mutation, including secondary side effects. Reads cannot grant
// authority. A newly added public function must be explicitly classified here.
const reads = [
  "getPersistence",
  "todayDailyIds",
  "hasHearts",
  "hintsRevealed",
  "availableStreakMilestones",
];
// Factories return scoped capabilities; their returned actions are tested separately.
const factories = ["captureHeartPurchase"];
const mutations: [keyof Api, (api: Api) => any[]][] = [
  ["login", () => ["Old Alice"]],
  ["logout", () => []],
  ["addPoints", () => [7]],
  ["addDinars", () => [3]],
  ["openStory", () => ["old"]],
  ["finishStory", () => ["old", "old-mission"]],
  ["toggleSavedStory", () => ["old"]],
  ["markPuzzleSolved", () => ["old"]],
  ["markWhoSolved", () => ["old"]],
  ["unlockEra", () => ["old"]],
  ["touchStreak", () => []],
  ["awardBadge", () => ["old"]],
  ["completeInvestigation", () => ["old", 20]],
  ["markInvestigationCompletedLocal", () => ["old"]],
  ["completeTimeline", () => ["old", 20]],
  ["completeDecision", () => ["old", 20]],
  ["completeMission", () => ["old", 20]],
  ["completeCampaign", () => ["old", 20]],
  ["findArtifact", () => ["old"]],
  ["unlockCharacter", () => ["old"]],
  ["unlockRegion", () => ["old", 10]],
  ["claimDaily", () => ["old", 20]],
  ["updateSettings", () => [{ sound: false }]],
  ["setBio", () => ["old"]],
  ["setFavorites", () => [{ favoriteStateId: "old" }]],
  ["adoptServerAvatar", () => ["old"]],
  ["setAvatar", () => ["old"]],
  ["setAvatarDurable", () => ["old"]],
  ["setNotificationPrefs", () => [{ dailyChallenge: false }]],
  ["loseHeart", () => []],
  ["loseHeartOnce", () => ["old-attempt"]],
  ["recoverHeartFromActivity", () => [{ kind: "document", id: "old" }]],
  ["spendDinarsForHeart", () => []],
  ["spendDinars", () => [10]],
  ["trySpendDinars", () => [10]],
  ["buyHint", () => ["old", 0, 10]],
  ["claimStreakMilestone", () => [7]],
  ["hydrateClaimedStreakRewards", () => []],
  ["recordStreakActivity", () => ["game", "old"]],
  ["replaceProfile", (api) => [{ ...api.profile, points: 999, dinars: 999 }]],
  ["mergeCloudSave", (api) => [{ ...api.profile, points: 999, dinars: 999 }]],
  ["resetProfile", () => []],
  ["applyServerStats", () => [{ xp: 999, dinars: 999 }]],
  ["grantTitle", () => ["old"]],
  ["grantArtifact", () => ["old"]],
];
it("explicitly classifies all public Profile APIs", () => {
  const h = harness();
  expect(
    Object.entries(h.api)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort(),
  ).toEqual([...reads, ...factories, ...mutations.map(([key]) => key)].sort());
});
for (const [key, argsFor] of mutations)
  it("retained " + key + " cannot mutate Bob or emit side effects", async () => {
    const h = harness(),
      action = h.api[key] as (...args: any[]) => any,
      args = argsFor(h.api);
    await switchOwner("user:bob");
    const before = localStorage.getItem("hakaya.profile.v2"),
      profile = JSON.stringify(h.api.profile);
    const events = vi.spyOn(window, "dispatchEvent");
    await act(async () => {
      await action(...args);
    });
    expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
    expect(JSON.stringify(h.api.profile)).toBe(profile);
    expect(events).not.toHaveBeenCalled();
    expect(asyncEnv.avatar).not.toHaveBeenCalled();
    expect(asyncEnv.streak).not.toHaveBeenCalled();
    expect(asyncEnv.claims).not.toHaveBeenCalled();
    expect(asyncEnv.reset).not.toHaveBeenCalled();
  });
it("retained current-session actions survive unrelated renders and revisions", async () => {
  const h = harness(),
    old = h.api;
  await act(async () => {
    h.api.setBio("rerender");
  });
  await act(async () => {
    old.addPoints(7);
    old.addDinars(3);
  });
  expect(saved().points).toBe(107);
  expect(saved().dinars).toBe(53);
  await act(async () => {
    old.addPoints(7);
  });
  expect(saved().points).toBe(114);
});
it("a legitimate purchase and reward keep their existing arithmetic and callbacks", async () => {
  const h = harness(),
    old = h.api;
  await act(async () => {
    expect(old.trySpendDinars(10)).toBe(true);
  });
  await act(async () => {
    old.addDinars(3);
    old.addPoints(7);
  });
  expect(saved().dinars).toBe(43);
  expect(saved().points).toBe(107);
});
it("an old rejected reservation cannot reserve Bob's money", async () => {
  const h = harness(),
    old = h.api.trySpendDinars;
  await switchOwner("user:bob");
  expect(old(40)).toBe(false);
  await act(async () => {
    expect(h.api.trySpendDinars(40)).toBe(true);
  });
  expect(saved().dinars).toBe(10);
});
it("an admitted reservation dropped during identity change cannot block the next owner's purchase", async () => {
  const h = harness();
  await act(async () => {
    startTransition(() => {
      expect(h.api.trySpendDinars(10)).toBe(true);
    });
    setActiveOwnerInternal("user:bob");
    seed(200);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  expect(saved().dinars).toBe(50);
  await act(async () => {
    expect(h.api.trySpendDinars(45)).toBe(true);
  });
  expect(saved().dinars).toBe(5);
});
it("old heart attempts do not poison the live dedup key", async () => {
  const h = harness(),
    old = h.api.loseHeartOnce;
  await switchOwner("user:bob");
  old("creation-bound-unique-attempt");
  await act(async () => {
    h.api.loseHeartOnce("creation-bound-unique-attempt");
  });
  expect(saved().hearts).toBe(2);
});
for (const aba of [false, true])
  it(
    "external Promise retains its original action across " + (aba ? "ABA" : "switch"),
    async () => {
      const h = harness(),
        old = h.api.addDinars,
        gate = deferred<number>();
      const pending = gate.promise.then(old);
      await switchOwner("user:bob");
      if (aba) await switchOwner("user:alice", 100);
      await act(async () => {
        gate.resolve(30);
        await pending;
      });
      expect(saved().dinars).toBe(50);
    },
  );
it("old callbacks from an unmounted provider cannot write a remounted provider", async () => {
  const first = harness(),
    old = first.api;
  first.view.unmount();
  const second = harness();
  await act(async () => {
    old.addPoints(7);
    old.resetProfile();
    old.awardBadge("old");
  });
  expect(second.api.profile.points).toBe(100);
  expect(saved().points).toBe(100);
  await act(async () => {
    second.api.addPoints(3);
  });
  expect(saved().points).toBe(103);
});
it("StrictMode reset revokes old generation but ordinary new actions stay live", async () => {
  const h = harness(true),
    old = h.api;
  await act(async () => {
    h.api.resetProfile();
  });
  const before = JSON.stringify(h.api.profile);
  await act(async () => {
    old.addPoints(7);
    old.addDinars(3);
    old.resetProfile();
  });
  expect(JSON.stringify(h.api.profile)).toBe(before);
  const points = h.api.profile.points;
  await act(async () => {
    h.api.addPoints(7);
  });
  expect(saved().points).toBe(points + 7);
});
it("StrictMode initial render action cannot acquire authority from later hydration", async () => {
  let first: Api | undefined, live!: Api;
  function Probe() {
    live = useProfile();
    first ??= live;
    return null;
  }
  render(
    <StrictMode>
      <ProfileProvider>
        <Probe />
      </ProfileProvider>
    </StrictMode>,
  );
  await act(async () => {
    first!.addPoints(7);
  });
  expect(saved().points).toBe(100);
  await act(async () => {
    live.addPoints(7);
  });
  expect(saved().points).toBe(107);
});
it("batched transition admitted before a switch cannot run on the next frame", async () => {
  const h = harness(),
    old = h.api.addPoints;
  await act(async () => {
    startTransition(() => old(7));
    setActiveOwnerInternal("user:bob");
    seed(200);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  expect(h.api.profile.points).toBe(200);
  expect(saved().points).toBe(200);
});
for (const aba of [false, true])
  it(
    "Streak Promise admitted under Alice rejects results after " + (aba ? "ABA" : "switch"),
    async () => {
      const h = harness(),
        gate = deferred<any>();
      asyncEnv.streak.mockReturnValueOnce(gate.promise);
      let pending!: Promise<void>;
      await act(async () => {
        pending = h.api.recordStreakActivity("game", "old");
      });
      expect(asyncEnv.streak).toHaveBeenCalledTimes(1);
      await switchOwner("user:bob");
      if (aba) await switchOwner("user:alice", 100);
      await act(async () => {
        gate.resolve({ ok: true, xp_total: 999, dinar_balance: 999, grants: [] });
        await pending;
      });
      expect(saved().points).toBe(aba ? 100 : 200);
      expect(saved().dinars).toBe(50);
    },
  );
it("an accepted avatar Promise is locally obsolete after provider generation reset", async () => {
  const h = harness(),
    gate = deferred<any>();
  asyncEnv.avatar.mockReturnValueOnce(gate.promise);
  let pending!: ReturnType<Api["setAvatarDurable"]>;
  await act(async () => {
    pending = h.api.setAvatarDurable("synthetic");
  });
  expect(asyncEnv.avatar).toHaveBeenCalledTimes(1);
  await act(async () => {
    h.api.resetProfile();
  });
  const before = localStorage.getItem("hakaya.profile.v2");
  await act(async () => {
    gate.resolve("synced");
    expect(await pending).toBe("failed");
  });
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
});
it("logout checks its original capability again after the module await", async () => {
  const h = harness();
  await act(async () => {
    h.api.logout();
    setActiveOwnerInternal("user:bob");
    seed(200);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  expect(asyncEnv.reset).not.toHaveBeenCalled();
});
it("Guest to User to Guest never revives the first guest action", async () => {
  await switchOwner("guest:synthetic", 10);
  const h = harness(),
    old = h.api.addPoints;
  await switchOwner("user:alice", 100);
  await switchOwner("guest:synthetic", 10);
  await act(async () => {
    old(7);
  });
  expect(saved().points).toBe(10);
  await act(async () => {
    h.api.addPoints(2);
  });
  expect(saved().points).toBe(12);
});
it("reload preserves V17 bytes and does not replay an old action or initialize Settlement", async () => {
  const bytes = localStorage.getItem("hakaya.profile.v2");
  const open = vi.spyOn(indexedDB, "open");
  const first = harness(),
    old = first.api.addPoints;
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(bytes);
  first.view.unmount();
  const next = harness();
  await act(async () => {
    old(7);
  });
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(bytes);
  expect(Object.keys(saved())).not.toContain("appliedGrant");
  expect(Object.keys(saved())).not.toContain("delivered");
  expect(next.api.profile.points).toBe(100);
  expect(open).not.toHaveBeenCalled();
});

it("retained heart factory and prepared capability cannot mutate a later owner", async () => {
  const h = harness(),
    factory = h.api.captureHeartPurchase,
    prepared = factory();
  await switchOwner("user:bob");
  const bytes = localStorage.getItem("hakaya.profile.v2");
  expect(prepared.current()).toBe(false);
  expect(factory().current()).toBe(false);
  expect(await prepared.apply({ hearts: 3, dinars: 1 })).toBe(false);
  expect(await factory().apply({ hearts: 3, dinars: 1 })).toBe(false);
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(bytes);
});
