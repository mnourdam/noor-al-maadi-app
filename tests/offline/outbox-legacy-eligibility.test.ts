import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectLegacyCandidates,
  type InventoryInputs,
  type LegacyInventory,
} from "@/lib/rewards/legacy-inventory";
import { planLegacyImport, SETTLEMENT_DOMAINS } from "@/lib/rewards/legacy-eligibility";
const OWNER = "user:alice",
  PROFILE = "hakaya.profile.v2";
const wallet = () => ({
  points: 321,
  dinars: 47,
  hearts: 2,
  heartsAt: 1700000000123,
  activityCooldowns: {},
  hintsPurchased: {},
  loggedIn: true,
  campaignsCompleted: [],
  storiesRead: [],
  investigationsCompleted: [],
  badges: [],
});
const key = (logical = PROFILE, owner = OWNER) => `${logical}::owner=${owner}`;
class Store {
  values = new Map<string, string>();
  denied = new Set<string>();
  get length() {
    return this.values.size;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.denied.has(k)) throw new Error("denied");
    return this.values.get(k) ?? null;
  }
}
let local: Store,
  session: Store,
  identity: { owner: string; epoch: number },
  inputs: InventoryInputs;
const seed = (logical = PROFILE, value: unknown = wallet(), store = local) =>
  store.values.set(key(logical), JSON.stringify(value));
const report = () => inspectLegacyCandidates(OWNER, inputs);
const plan = (r = report()) => planLegacyImport(r, { owner: OWNER, epoch: 4 });
function freeze(value: any) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
beforeEach(() => {
  local = new Store();
  session = new Store();
  identity = { owner: OWNER, epoch: 4 };
  inputs = { identity: () => ({ ...identity }), local: () => local, session: () => session };
  for (const name of ["localStorage", "sessionStorage", "indexedDB"] as const)
    vi.stubGlobal(
      name,
      new Proxy(
        {},
        {
          get() {
            throw new Error("ambient storage forbidden");
          },
        },
      ),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 3B-2B pure eligibility planner integrated with the real inventory reader", () => {
  it("identifies one validated wallet only as a conditional candidate, never an import", () => {
    seed();
    const result = plan();
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.baselineEligibility.profileGroup).toMatchObject({
      equivalence: "single_source",
      historicalOwnership: "not_proven",
    });
    expect(result.stagingEligibility.status).toBe("requires_writer_fence");
    expect(result.migrationReadiness.status).toBe("blocked");
    expect(result.authorityActivationEligibility.status).toBe("blocked");
    for (const domain of SETTLEMENT_DOMAINS)
      expect(result.settlementReadinessByDomain[domain].status).toBe("insufficient_evidence");
  });
  it.each(["{}", "broken JSON"])(
    "quarantines an independently proven C access cache (%s) without rewriting reader facts",
    (raw) => {
      seed();
      local.values.set(key("irth.stories.unlock.v1:alice"), raw);
      const r = report(),
        before = JSON.stringify(r);
      const result = plan(freeze(r));
      expect(r.baseline.state).not.toBe("valid");
      expect(result.baselineEligibility.status).toBe("eligible_candidate");
      expect(result.quarantinedSources).toContainEqual(
        expect.objectContaining({
          category: "C",
          readerState: raw === "{}" ? "ambiguous" : "corrupt",
        }),
      );
      expect(JSON.stringify(r)).toBe(before);
      expect(result.settlementReadinessByDomain.story_rewards.status).toBe("insufficient_evidence");
    },
  );
  it("keeps an unreadable C cache isolated only because its key/domain was still inventoried", () => {
    seed();
    seed("irth.stories.unlock.v1:alice", {});
    local.denied.add(key("irth.stories.unlock.v1:alice"));
    const r = report();
    expect(r.state).toBe("unreadable");
    expect(r.complete).toBe(false);
    expect(plan(r).baselineEligibility.status).toBe("eligible_candidate");
  });
  it("a corrupt B ledger blocks campaign settlement without converting missing delivery proof into a balance conflict", () => {
    seed();
    seed("irth_campaign_ledger_v1", { keys: "invalid", pending: [] });
    const r = report(),
      result = plan(r);
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.settlementReadinessByDomain.campaign_rewards.status).toBe("blocked");
    expect(result.settlementReadinessByDomain.story_rewards.status).toBe("insufficient_evidence");
    expect(
      r.candidates.find(
        (c) => c.source.logicalKey === "irth_campaign_ledger_v1" && c.source.store === "local",
      )?.state,
    ).toBe("corrupt");
  });
  it("ambiguous mixed B buffer is a campaign barrier, never guessed to be C", () => {
    seed();
    seed("irth.campaign_progress_buffer.v1", { boundUid: null, entries: {} });
    const result = plan();
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.quarantinedSources).toContainEqual(
      expect.objectContaining({ category: "B", readerState: "ambiguous" }),
    );
    expect(result.settlementReadinessByDomain.campaign_rewards.status).toBe("blocked");
  });
  it("a global ledger stays D/unattributed while retaining its B-origin campaign barrier", () => {
    seed();
    local.values.set("irth_campaign_ledger_v1", '{"unknownOwner":true}');
    const r = report(),
      result = plan(r);
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.quarantinedSources).toContainEqual(
      expect.objectContaining({ category: "D", readerState: "ambiguous" }),
    );
    expect(result.settlementReadinessByDomain.campaign_rewards.status).toBe("blocked");
  });
  it("different balances block without choosing the larger balance or newer timestamp", () => {
    seed();
    seed(PROFILE, { ...wallet(), points: 9999, heartsAt: 1709999999999 }, session);
    expect(plan().baselineEligibility.status).toBe("blocked");
    expect(plan().baselineEligibility.reasons).toContainEqual({
      code: "conflicting_profile_sources",
    });
  });
  it("retains both exact raw profile sources as one conditional group without upgrading ambiguous facts", () => {
    seed();
    seed(PROFILE, wallet(), session);
    const r = report(),
      before = JSON.stringify(r);
    expect(r.baseline.state).toBe("ambiguous");
    const result = plan(freeze(r));
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.baselineEligibility.profileGroup?.equivalence).toBe("exact_raw");
    expect(result.baselineEligibility.profileGroup?.sources.map((s) => s.store).sort()).toEqual([
      "local",
      "session",
    ]);
    expect(result.stagingEligibility.status).toBe("requires_writer_fence");
    expect(JSON.stringify(r)).toBe(before);
    expect(
      r.candidates.filter((c) => c.source.logicalKey === PROFILE && c.state === "ambiguous"),
    ).toHaveLength(2);
  });
  it("matching numeric balances are insufficient when protected purchase data differs", () => {
    seed();
    seed(PROFILE, { ...wallet(), hintsPurchased: { "inv:one": 1 } }, session);
    expect(plan().baselineEligibility.status).toBe("blocked");
  });
  it("does not invent a semantic equivalence contract for reordered profile bytes", () => {
    seed();
    const v = wallet();
    session.values.set(key(), JSON.stringify(Object.fromEntries(Object.entries(v).reverse())));
    expect(plan().baselineEligibility.status).toBe("blocked");
  });
  it("an unattributed global wallet prevents candidate eligibility", () => {
    seed();
    local.values.set(PROFILE, JSON.stringify(wallet()));
    expect(plan().baselineEligibility.status).toBe("blocked");
    expect(plan().baselineEligibility.reasons).toContainEqual(
      expect.objectContaining({ code: "unattributed_or_unsafe_economic_source" }),
    );
  });
  it.each(["corrupt", "unreadable"])("does not waive an A profile failure: %s", (state) => {
    seed();
    if (state === "corrupt") local.values.set(key(), "broken");
    else local.denied.add(key());
    expect(plan().baselineEligibility.status).toBe("blocked");
    expect(plan().stagingEligibility.status).toBe("blocked");
  });
  it.each(["activityCooldowns", "hintsPurchased"])(
    "missing required protected field %s remains insufficient, never defaulted",
    (field) => {
      const v: Record<string, unknown> = wallet();
      delete v[field];
      seed(PROFILE, v);
      expect(report().state).toBe("valid");
      expect(plan().baselineEligibility.status).toBe("insufficient_evidence");
      expect(plan().baselineEligibility.reasons).toContainEqual({
        code: "protected_fields_missing",
      });
    },
  );
  it("an invalid field in a mixed profile cannot be salvaged just because wallet numbers look valid", () => {
    seed(PROFILE, { ...wallet(), badges: 99 });
    expect(report().state).toBe("corrupt");
    expect(plan().baselineEligibility.status).toBe("blocked");
  });
  it("unresolved paid ordering intent blocks baseline and spending rather than being treated as ancillary", () => {
    seed();
    local.values.set(
      `${OWNER}:irth.campaign.ordering.help.v3`,
      JSON.stringify({
        act: {
          pinnedIds: [],
          fingerprint: "fp",
          pending: { itemId: "one", txId: "t1", at: "2020", paidAt: "2020" },
        },
      }),
    );
    const result = plan();
    expect(result.baselineEligibility.status).toBe("blocked");
    expect(result.settlementReadinessByDomain.economy_spending.status).toBe("blocked");
    expect(result.quarantinedSources).toContainEqual(
      expect.objectContaining({ category: "A", readerState: "ambiguous" }),
    );
  });
  it("opaque Outbox data remains A because monetary operations cannot be safely split", () => {
    seed();
    seed("irth.outbox.fallback.v1", [
      { id: "p1", userId: "alice", kind: "profile_delta", payload: { dinars: 5 } },
    ]);
    expect(plan().baselineEligibility.status).toBe("blocked");
  });
  it("rejects reader identity changes even if someone attaches tentative valid candidates", () => {
    seed();
    const good = report();
    identity.epoch++;
    const mismatch = planLegacyImport(good, identity);
    expect(mismatch.baselineEligibility.status).toBe("blocked");
    const changed: LegacyInventory = {
      ...good,
      state: "owner_mismatch",
      complete: false,
      reason: "identity_changed",
    };
    expect(plan(changed).baselineEligibility.status).toBe("blocked");
  });
  it("changed_during_read from the real reader cannot be rescued", () => {
    seed();
    const realGet = local.getItem.bind(local);
    let n = 0;
    local.getItem = (k) => {
      if (k === key() && ++n === 2) seed(PROFILE, { ...wallet(), points: 322 });
      return realGet(k);
    };
    const r = report();
    expect(r.state).toBe("changed_during_read");
    expect(plan(r).baselineEligibility.status).toBe("blocked");
  });
  it("a general enumeration failure without candidates blocks all decisions", () => {
    seed();
    local.key = () => {
      throw new Error("enumeration failed");
    };
    const r = report();
    expect(r.candidates).toEqual([]);
    expect(r.state).toBe("unreadable");
    const result = plan(r);
    expect(result.baselineEligibility.status).toBe("blocked");
    for (const domain of SETTLEMENT_DOMAINS)
      expect(result.settlementReadinessByDomain[domain].status).toBe("blocked");
  });
  it("a Bob-stamped record in Alice's namespace cannot be trusted", () => {
    seed(PROFILE, { ...wallet(), userId: "bob" });
    const r = report();
    expect(r.state).toBe("owner_mismatch");
    expect(plan(r).baselineEligibility.status).toBe("blocked");
  });
  it("a legitimate separate Bob namespace neither leaks values nor invalidates Alice", () => {
    seed();
    local.values.set(key(PROFILE, "user:bob"), JSON.stringify({ ...wallet(), points: 99999 }));
    const result = plan();
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(JSON.stringify(result)).not.toContain("bob");
  });
  it("legacy synced claims block campaign delivery without fabricating applied or delivered facts", () => {
    seed();
    seed("irth_campaign_ledger_v1", {
      keys: { "chapter:c1": { at: "2020", synced: true } },
      pending: [],
    });
    const r = report(),
      before = JSON.stringify(r),
      result = plan(freeze(r));
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(result.settlementReadinessByDomain.campaign_rewards.status).toBe("blocked");
    expect(r.candidates.find((c) => c.legacyEntitlements)?.legacyEntitlements).toEqual([
      { key: "chapter:c1", state: "legacy_unknown" },
    ]);
    expect(r.provenDeliveries).toEqual([]);
    expect(JSON.stringify(r)).toBe(before);
  });
  it("no revision is invented for revisionless V17 data", () => {
    seed();
    const r = report(),
      before = JSON.stringify(r);
    const result = plan(r);
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(JSON.stringify(r)).toBe(before);
    expect(result.baselineEligibility.profileGroup).not.toHaveProperty("revision");
  });
  it("does not re-read adapters, perform IO or expose private raw balances", () => {
    seed(PROFILE, { ...wallet(), name: "DO_NOT_EXPORT_RAW_PROFILE" });
    const r = report();
    local.getItem = session.getItem = () => {
      throw new Error("reread forbidden");
    };
    inputs.identity = () => {
      throw new Error("identity lookup forbidden");
    };
    const before = JSON.stringify(r);
    const result = plan(freeze(r));
    expect(result.baselineEligibility.status).toBe("eligible_candidate");
    expect(JSON.stringify(result)).not.toContain("DO_NOT_EXPORT_RAW_PROFILE");
    expect(result.baselineEligibility).not.toHaveProperty("economicFields");
    expect(JSON.stringify(r)).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("cannot accept forged readiness switches or baseline overrides", () => {
    seed();
    const r = report();
    Object.assign(r, { writerFenceVerified: true, migrationReady: true, authorityActive: true });
    const result = plan(r);
    expect(result.stagingEligibility.status).toBe("requires_writer_fence");
    expect(result.migrationReadiness.status).toBe("blocked");
    expect(result.authorityActivationEligibility.status).toBe("blocked");
    expect(
      Object.values(result.settlementReadinessByDomain).every(
        (d) => d.status !== ("ready" as string),
      ),
    ).toBe(true);
  });
  it.each([
    ["irth.story_progress_mirror.v1.alice", "story_rewards"],
    ["irth.inv.backfilled.v1:alice", "investigation_rewards"],
    ["irth.daily-challenges.done.alice.2026-11-03", "game_rewards"],
    ["irth.memory.plan.hash1", "memory_rewards"],
    ["irth.daily-quest.alice.v2", "daily_quest_rewards"],
  ] as const)(
    "isolates B source %s to domain %s without promoting it to valid",
    (logical, domain) => {
      seed();
      seed(logical, {});
      const r = report(),
        result = plan(r);
      expect(result.baselineEligibility.status).toBe("eligible_candidate");
      expect(result.settlementReadinessByDomain[domain].status).toBe("blocked");
      expect(
        result.sourceAssessments.find(
          (a) => a.source.logicalKey === logical && a.source.store === "local",
        ),
      ).toMatchObject({ category: "B", readerState: "ambiguous" });
    },
  );
  it("profile completion history remains a domain barrier separate from wallet validity", () => {
    seed(PROFILE, { ...wallet(), campaignsCompleted: ["c1"] });
    expect(plan().baselineEligibility.status).toBe("eligible_candidate");
    expect(plan().settlementReadinessByDomain.campaign_rewards.status).toBe("blocked");
  });
  it("rejects an inconsistent completeness flag rather than treating a partial report as stable", () => {
    seed();
    const r = report();
    r.complete = false;
    expect(plan(r).baselineEligibility.status).toBe("blocked");
  });
  it("does not mutate input through references in the returned explanation", () => {
    seed();
    seed("irth_campaign_ledger_v1", {});
    const r = report(),
      before = JSON.stringify(r),
      result = plan(r);
    result.quarantinedSources[0].source.physicalKey = "changed output only";
    result.quarantinedSources[0].domains.push("story_rewards");
    expect(JSON.stringify(r)).toBe(before);
    expect(plan(r).settlementReadinessByDomain.story_rewards.status).toBe("insufficient_evidence");
  });
  it("a missing profile yields insufficient evidence rather than zero", () => {
    expect(plan().baselineEligibility.status).toBe("insufficient_evidence");
    expect(plan().baselineEligibility.profileGroup).toBeUndefined();
  });
});
