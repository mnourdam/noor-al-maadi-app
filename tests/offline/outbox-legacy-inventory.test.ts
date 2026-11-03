import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  inspectLegacyCandidates,
  type InventoryInputs,
  type RawLegacyStorage,
} from "@/lib/rewards/legacy-inventory";

const PROFILE = "hakaya.profile.v2";
const physical = (key = PROFILE, owner = "user:alice") => `${key}::owner=${owner}`;
const profile = () => ({
  points: 321,
  dinars: 47,
  hearts: 2,
  heartsAt: 1700000000123,
  activityCooldowns: { "document:one": 1700001000234 },
  hintsPurchased: { "inv:one": 2 },
  storiesRead: ["s1"],
  campaignsCompleted: ["c1"],
  investigationsCompleted: ["i1"],
  artifactsFound: ["a1"],
  badges: ["b1"],
  loggedIn: true,
});
class FakeStorage implements RawLegacyStorage {
  data = new Map<string, string>();
  reads: string[] = [];
  onRead?: (key: string) => void;
  onKey?: () => void;
  failRead = false;
  failKeys = false;
  get length() {
    return this.data.size;
  }
  key(index: number) {
    this.onKey?.();
    if (this.failKeys) throw new Error("denied");
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    this.reads.push(key);
    this.onRead?.(key);
    if (this.failRead) throw new Error("denied");
    return this.data.get(key) ?? null;
  }
}
let local: FakeStorage, session: FakeStorage;
let identity: { owner: string; epoch: number };
let inputs: InventoryInputs;
const run = () => inspectLegacyCandidates("user:alice", inputs);
const item = (key: string, store = "local") =>
  run().candidates.find(
    (c) =>
      c.source.logicalKey === key &&
      c.source.store === store &&
      c.source.ownership === "physical_suffix",
  );
const seed = (value: unknown, key = PROFILE, storage = local) =>
  storage.data.set(physical(key), JSON.stringify(value));
beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  identity = { owner: "user:alice", epoch: 4 };
  inputs = { identity: () => ({ ...identity }), local: () => local, session: () => session };
  // Any accidental runtime integration or write is a test failure.
  for (const name of ["localStorage", "sessionStorage"] as const)
    vi.stubGlobal(name, {
      getItem: () => {
        throw new Error("ambient storage forbidden");
      },
      setItem: vi.fn(() => {
        throw new Error("write forbidden");
      }),
      removeItem: vi.fn(() => {
        throw new Error("delete forbidden");
      }),
      clear: vi.fn(() => {
        throw new Error("clear forbidden");
      }),
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 3B-1 strict read-only V17 candidates", () => {
  it("extracts a potential baseline exactly without initial defaults, rounding or clamping", () => {
    const original = profile();
    seed(original);
    const result = run();
    expect(result.state).toBe("valid");
    expect(result.complete).toBe(true);
    expect(result.baseline.state).toBe("valid");
    expect(result.baseline.candidate?.economicFields).toMatchObject({
      points: 321,
      dinars: 47,
      hearts: 2,
      heartsAt: 1700000000123,
      activityCooldowns: original.activityCooldowns,
      hintsPurchased: original.hintsPurchased,
    });
    expect(result.baseline.candidate?.raw).toBe(JSON.stringify(original));
    expect(result.baseline.candidate?.source).toEqual({
      store: "local",
      logicalKey: PROFILE,
      physicalKey: physical(),
      ownership: "physical_suffix",
    });
    expect(result.provenDeliveries).toEqual([]);
  });
  it("distinguishes missing from unreadable and never invents zero", () => {
    expect(item(PROFILE)?.state).toBe("missing");
    expect(run().baseline.candidate).toBeUndefined();
    seed(profile());
    local.failRead = true;
    expect(item(PROFILE)?.state).toBe("unreadable");
    expect(run().state).toBe("unreadable");
    expect(run().baseline.candidate).toBeUndefined();
  });
  it.each([
    "{bad",
    "null",
    "[]",
    '{"points":0}',
    JSON.stringify({ ...profile(), heartsAt: "now" }),
    JSON.stringify({ ...profile(), points: -1 }),
    JSON.stringify({ ...profile(), hintsPurchased: { one: "2" } }),
  ])("rejects malformed JSON or profile shape: %s", (raw) => {
    local.data.set(physical(), raw);
    const result = run();
    expect(result.state).toBe("corrupt");
    expect(item(PROFILE)?.raw).toBe(raw);
    expect(result.complete).toBe(false);
    expect(result.baseline.candidate).toBeUndefined();
  });
  it("does not retrieve Bob's values or include his key metadata in Alice's report", () => {
    seed(profile());
    local.data.set(physical(PROFILE, "user:bob"), JSON.stringify({ ...profile(), points: 99999 }));
    const result = run();
    expect(result.state).toBe("valid");
    expect(local.reads).not.toContain(physical(PROFILE, "user:bob"));
    expect(JSON.stringify(result)).not.toContain("bob");
    expect(JSON.stringify(result)).not.toContain("99999");
    expect(result.baseline.candidate?.economicFields?.points).toBe(321);
  });
  it("does not even retrieve unproven global values or assign them to the active account", () => {
    local.data.set(PROFILE, JSON.stringify({ ...profile(), userId: "bob" }));
    const result = run();
    expect(result.state).toBe("ambiguous");
    expect(result.complete).toBe(false);
    expect(local.reads).not.toContain(PROFILE);
    expect(JSON.stringify(result)).not.toContain("bob");
    expect(result.baseline.candidate).toBeUndefined();
  });
  it("rejects conflicting local and session profiles without max or newest-source selection", () => {
    seed(profile());
    seed({ ...profile(), points: 9999, dinars: 1, heartsAt: 1 }, PROFILE, session);
    const result = run();
    expect(result.state).toBe("ambiguous");
    expect(result.complete).toBe(false);
    expect(
      result.candidates.filter((c) => c.source.logicalKey === PROFILE && c.state === "ambiguous"),
    ).toHaveLength(2);
    expect(result.baseline.candidate).toBeUndefined();
  });
  it("does not prefer a physical profile over an unattributed global profile", () => {
    seed(profile());
    local.data.set(PROFILE, "unread unknown data");
    expect(run().baseline.state).toBe("ambiguous");
    expect(run().baseline.candidate).toBeUndefined();
    expect(local.reads).not.toContain(PROFILE);
  });
  it("even identical profiles in different stores require an explicit provenance decision", () => {
    seed(profile());
    seed(profile(), PROFILE, session);
    expect(run().state).toBe("ambiguous");
    expect(run().baseline.candidate).toBeUndefined();
  });
  it.each(["enumeration", "value", "final"])(
    "fences an account change during %s without returning a partial report",
    (stage) => {
      seed(profile());
      if (stage === "enumeration")
        local.onKey = () => {
          identity = { owner: "user:bob", epoch: 5 };
        };
      if (stage === "value")
        local.onRead = () => {
          identity = { owner: "user:bob", epoch: 5 };
        };
      if (stage === "final") {
        const normal = inputs.identity;
        let calls = 0;
        run(); // compute the final guard position with no mutation
        inputs.identity = () => {
          calls++;
          return normal();
        };
        run();
        const final = calls;
        calls = 0;
        inputs.identity = () => {
          calls++;
          if (calls === final) identity = { owner: "user:bob", epoch: 5 };
          return normal();
        };
      }
      const result = run();
      expect(result.state).toBe("owner_mismatch");
      expect(result.reason).toBe("identity_changed");
      expect(result.complete).toBe(false);
      expect(result.candidates).toEqual([]);
      expect(result.baseline.candidate).toBeUndefined();
    },
  );
  it("detects epoch changes even when the owner switches away and back", () => {
    seed(profile());
    local.onRead = () => {
      identity.epoch++;
    };
    expect(run().reason).toBe("identity_changed");
    expect(run().candidates).toEqual([]);
  });
  it("rejects values changed between scans and discards their tentative projections", () => {
    seed(profile());
    let reads = 0;
    local.onRead = (key) => {
      if (key === physical() && ++reads === 2)
        local.data.set(key, JSON.stringify({ ...profile(), points: 322 }));
    };
    const result = run();
    expect(result.state).toBe("changed_during_read");
    expect(result.candidates).toEqual([]);
  });
  it("detects key addition during enumeration", () => {
    seed(profile());
    let first = true;
    local.onKey = () => {
      if (first) {
        first = false;
        local.data.set(physical("irth.memory.history.v1"), "{}");
      }
    };
    expect(run().state).toBe("changed_during_read");
  });
  it("old synced claims remain legacy_unknown, never applied or delivered", () => {
    seed(profile());
    seed(
      { keys: { "chapter:c1": { at: "2020-01-01", synced: true } }, pending: [] },
      "irth_campaign_ledger_v1",
    );
    expect(item("irth_campaign_ledger_v1")).toMatchObject({
      state: "valid",
      evidence: "claim_only",
      legacyEntitlements: [{ key: "chapter:c1", state: "legacy_unknown" }],
    });
    expect(run().provenDeliveries).toEqual([]);
  });
  it("completion markers do not fabricate missing grants or compensation", () => {
    seed(profile());
    const result = run();
    expect(result.baseline.candidate?.economicFields?.campaignsCompleted).toEqual(["c1"]);
    expect(item("irth_campaign_grants_v2")?.state).toBe("missing");
    expect(result.provenDeliveries).toEqual([]);
    expect(result.candidates.flatMap((c) => c.legacyEntitlements ?? [])).toEqual([]);
  });
  it("legacy grant totals are only reported evidence, not proof of atomic delivery", () => {
    seed(
      { c1: { xp: 20, coins: 3, unlocks: ["artifact:a1"], perChapter: {}, updatedAt: "2020" } },
      "irth_campaign_grants_v2",
    );
    expect(item("irth_campaign_grants_v2")).toMatchObject({
      state: "valid",
      evidence: "reported_grant",
    });
    expect(run().provenDeliveries).toEqual([]);
  });
  it("embedded foreign identity is redacted rather than exported as a baseline", () => {
    seed({ ...profile(), userId: "bob" });
    const result = run();
    expect(result.state).toBe("owner_mismatch");
    expect(item(PROFILE)?.raw).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("bob");
    expect(result.baseline.candidate).toBeUndefined();
  });
  it("embedded logical UID mismatch is rejected before getItem", () => {
    const key = physical("irth.story_progress_mirror.v1.bob");
    local.data.set(key, "do not read");
    expect(run().state).toBe("owner_mismatch");
    expect(local.reads).not.toContain(key);
  });
  it("guest completions stay guest-owned and do not imply rewards", () => {
    identity = { owner: "guest:device1", epoch: 8 };
    local.data.set(physical("irth.guest.storyCompletions.v1", identity.owner), '["s1"]');
    const result = inspectLegacyCandidates(identity.owner, inputs);
    expect(result.candidates.find((c) => c.state === "valid")).toMatchObject({
      evidence: "completion_only",
    });
    expect(result.provenDeliveries).toEqual([]);
    expect(result.baseline.state).toBe("missing");
  });
  it("unknown historical schemas stay ambiguous instead of passing a lenient JSON-object check", () => {
    seed({ arbitrary: "data" }, "irth.games.whoami.help.v1");
    expect(item("irth.games.whoami.help.v1")).toMatchObject({
      state: "ambiguous",
      reason: "schema_not_admitted",
    });
    expect(run().complete).toBe(false);
  });
  it("denied storage, key enumeration and identity reads fail closed without initial seeds", () => {
    inputs.local = () => {
      throw new Error("denied");
    };
    expect(run().state).toBe("unreadable");
    inputs.local = () => local;
    local.failKeys = true;
    seed(profile());
    expect(run().state).toBe("unreadable");
    inputs.identity = () => {
      throw new Error("identity denied");
    };
    expect(run()).toMatchObject({ state: "unreadable", epoch: null, complete: false });
  });
  it("preserves real zero values and fractional legacy totals without treating absence as zero", () => {
    seed({ ...profile(), points: 0, dinars: 0.5, hearts: 0 });
    expect(run().baseline.candidate?.economicFields).toMatchObject({
      points: 0,
      dinars: 0.5,
      hearts: 0,
    });
  });
  it("performs no writes, partition migration, IDB open or baseline/readiness creation", () => {
    seed(profile());
    local.data.set(PROFILE, "global fixture stays here");
    const beforeLocal = [...local.data],
      beforeSession = [...session.data];
    const open = vi.spyOn(indexedDB, "open"),
      removeDB = vi.spyOn(indexedDB, "deleteDatabase");
    run();
    run();
    expect([...local.data]).toEqual(beforeLocal);
    expect([...session.data]).toEqual(beforeSession);
    expect(open).not.toHaveBeenCalled();
    expect(removeDB).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(localStorage.clear).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.removeItem).not.toHaveBeenCalled();
    expect(sessionStorage.clear).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("captures primitive identity values even if the adapter returns a mutable shared object", () => {
    seed(profile());
    inputs.identity = () => identity;
    local.onRead = () => {
      identity.epoch++;
    };
    expect(run()).toMatchObject({
      state: "owner_mismatch",
      reason: "identity_changed",
      candidates: [],
      complete: false,
    });
  });
  it("does not read another account's logical daily-quest key inside the active physical partition", () => {
    const key = physical("irth.daily-quest.bob.v2");
    local.data.set(key, "do not inspect");
    expect(run().state).toBe("owner_mismatch");
    expect(local.reads).not.toContain(key);
  });
  it("inventories owner-prefixed ordering-help without touching another owner's paid-help state", () => {
    const key = "user:alice:irth.campaign.ordering.help.v3",
      foreign = "user:bob:irth.campaign.ordering.help.v3";
    local.data.set(
      key,
      JSON.stringify({
        activity1: {
          pinnedIds: ["one"],
          fingerprint: "fp",
          pending: { itemId: "one", txId: "t1", at: "2020", paidAt: "2020" },
        },
      }),
    );
    local.data.set(foreign, "not Alice's help");
    const result = run();
    expect(result.candidates.find((c) => c.source.physicalKey === key)).toMatchObject({
      source: { ownership: "owner_prefix" },
      state: "ambiguous",
      reason: "schema_not_admitted",
    });
    expect(local.reads).not.toContain(foreign);
    expect(JSON.stringify(result)).not.toContain(foreign);
  });
  it("redacts a Memory plan stamped with another owner even under the active physical namespace", () => {
    seed({ ownerKey: "user:bob", planKey: "p1" }, "irth.memory.plan.p1");
    const result = run();
    expect(result.state).toBe("owner_mismatch");
    expect(JSON.stringify(result)).not.toContain("user:bob");
    expect(
      result.candidates.find((c) => c.source.logicalKey === "irth.memory.plan.p1")?.raw,
    ).toBeUndefined();
  });
  it("does not export another user's nested fallback operation from a historically mixed namespace", () => {
    seed(
      [{ id: "old", userId: "bob", kind: "profile_delta", payload: { xp: 99 } }],
      "irth.outbox.fallback.v1",
    );
    const result = run();
    expect(result.state).toBe("owner_mismatch");
    expect(JSON.stringify(result)).not.toContain("bob");
    expect(item("irth.outbox.fallback.v1")?.raw).toBeUndefined();
  });
  it("detects changes in opaque raw values without exporting those values", () => {
    seed({ opaque: 1 }, "irth.games.whoami.help.v1");
    let reads = 0;
    local.onRead = (key) => {
      if (key === physical("irth.games.whoami.help.v1") && ++reads === 2)
        local.data.set(key, JSON.stringify({ opaque: 2 }));
    };
    const result = run();
    expect(result.state).toBe("changed_during_read");
    expect(result.candidates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("opaque");
  });
});
