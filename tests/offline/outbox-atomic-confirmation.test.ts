import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  confirmationTransactionsForOwner,
  transactionsForOwner,
  type ConfirmationSettlementTransaction,
} from "@/lib/rewards/transaction";
import {
  settlementForOwner,
  type Entitlement,
  type SettlementDecision,
} from "@/lib/rewards/settlement";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
const owner = "user:atomic-alice",
  key = "synthetic-confirmation";
const binding = { operationId: "op", revision: "rev", snapshot: "snapshot" };
const decision: SettlementDecision = {
  state: "confirmed",
  rewardDue: true,
  evidence: "synthetic-adapter-evidence",
};
let base: Entitlement;
const api = () => settlementForOwner(owner);
const run = (work: (tx: ConfirmationSettlementTransaction) => void) =>
  confirmationTransactionsForOwner(owner).run(work);
const confirm = (
  tx: ConfirmationSettlementTransaction,
  row = base,
  b = binding,
  d: SettlementDecision = decision,
) => tx.compareSettleEntitlement(key, row, b, d);
function companions(tx: ConfirmationSettlementTransaction) {
  for (const store of ["economy", "appliedGrants", "migrationState"] as const)
    tx.compareWrite(store, "synthetic", undefined, { synthetic: true });
}
async function companionRows() {
  const rows: unknown[] = [];
  await transactionsForOwner(owner).run((tx) => {
    for (const store of ["economy", "appliedGrants", "migrationState"] as const)
      tx.read(store, "synthetic", (row) => {
        rows.push(row);
      });
  });
  return rows;
}
beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  setActiveOwnerInternal(owner);
  base = (await api().prepare({
    key,
    source: "local",
    terms: "unchanged",
    binding,
    expected: null,
  }))!;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps historical scope unchanged and exposes only narrow confirmation composition", async () => {
  await transactionsForOwner(owner).run((tx) => {
    expect(Object.keys(tx).sort()).toEqual(["abort", "compareWrite", "read", "readEntitlement"]);
  });
  await run((tx) => {
    confirm(tx);
    companions(tx);
  });
  const row = (await api().read(key))!;
  expect(row).toEqual({
    ...base,
    attempts: [
      { binding, progress: "confirmed", reward: "delivery_pending", evidence: decision.evidence },
    ],
  });
  expect((await companionRows()).every(Boolean)).toBe(true);
});
it("rolls back four successful native requests on abort", async () => {
  const original = IDBObjectStore.prototype.put;
  const reached = new Set<string>();
  let abort: () => void;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    const request = original.apply(this, args),
      name = this.name;
    request.addEventListener("success", () => {
      reached.add(name);
      if (reached.size === 4) abort();
    });
    return request;
  });
  await expect(
    run((tx) => {
      abort = () => tx.abort();
      confirm(tx);
      companions(tx);
    }),
  ).rejects.toThrow("transaction-aborted");
  expect([...reached].sort()).toEqual([
    "appliedGrants",
    "economy",
    "entitlements",
    "migrationState",
  ]);
  expect(await api().read(key)).toEqual(base);
  expect(await companionRows()).toEqual([undefined, undefined, undefined]);
});
it("serializes competing snapshots with one winner", async () => {
  const results = await Promise.allSettled([
    run((tx) => confirm(tx)),
    run((tx) => confirm(tx, base, binding, { state: "rejected", evidence: "rejected" })),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message,
  ).toContain("stale-record");
});
it.each([
  ["forged terms", () => ({ ...base, terms: "forged" }), binding, decision, "stale-record"],
  ["wrong owner", () => ({ ...base, owner: "user:bob" }), binding, decision, "corrupt-record"],
  ["wrong binding", () => base, { ...binding, snapshot: "wrong" }, decision, "stale-binding"],
  ["empty evidence", () => base, binding, { ...decision, evidence: "" }, "invalid-evidence"],
  [
    "delivered decision",
    () => base,
    binding,
    { state: "delivered", evidence: "x" },
    "invalid-evidence",
  ],
] as const)("rejects %s and rolls back companions", async (_label, row, b, d, reason) => {
  await expect(
    run((tx) => {
      companions(tx);
      confirm(tx, row(), b, d as SettlementDecision);
    }),
  ).rejects.toThrow(reason);
  expect(await api().read(key)).toEqual(base);
  expect(await companionRows()).toEqual([undefined, undefined, undefined]);
});
it("rejects missing target without inserting", async () => {
  await expect(
    run((tx) =>
      tx.compareSettleEntitlement("absent", { ...base, key: "absent" }, binding, decision),
    ),
  ).rejects.toThrow("missing-entitlement");
  expect(await api().read("absent")).toBeUndefined();
});
it("replays exact terminal decisions, rejects changed evidence and rejection", async () => {
  await run((tx) => confirm(tx));
  const terminal = (await api().read(key))!;
  await run((tx) => confirm(tx, terminal));
  for (const d of [
    { ...decision, evidence: "different" },
    { state: "rejected", evidence: "different" },
  ] as SettlementDecision[]) {
    await expect(run((tx) => confirm(tx, terminal, binding, d))).rejects.toThrow(
      "decision-conflict",
    );
  }
  expect(await api().read(key)).toEqual(terminal);
});
it("rejects duplicate target and reads after mutation", async () => {
  await expect(
    run((tx) => {
      confirm(tx);
      confirm(tx);
    }),
  ).rejects.toThrow("duplicate-write-target");
  await expect(
    run((tx) => {
      confirm(tx);
      tx.readEntitlement(key, () => {});
    }),
  ).rejects.toThrow("read-after-write");
  expect(await api().read(key)).toEqual(base);
});
it("captures caller inputs synchronously", async () => {
  const row = structuredClone(base),
    b = structuredClone(binding),
    d = structuredClone(decision);
  await run((tx) => {
    confirm(tx, row, b, d);
    row.terms = "mutated";
    b.snapshot = "mutated";
    d.evidence = "mutated";
  });
  const saved = (await api().read(key))!;
  expect(saved.terms).toBe(base.terms);
  expect(saved.attempts[0].binding).toEqual(binding);
  expect(saved.attempts[0].evidence).toBe(decision.evidence);
});
it("rejects async callbacks and account changes without writes", async () => {
  await expect(
    run(async (tx) => {
      confirm(tx);
    }),
  ).rejects.toThrow("async-transaction-callback");
  await expect(
    run((tx) => {
      confirm(tx);
      setActiveOwnerInternal("user:bob");
    }),
  ).rejects.toThrow("identity-changed");
  setActiveOwnerInternal(owner);
  expect(await api().read(key)).toEqual(base);
});
it("preserves past attempts and legacy confirmation semantics", async () => {
  await api().settle(key, binding, { state: "rejected", evidence: "first" });
  const nextBinding = { ...binding, operationId: "next" };
  const next = (await api().prepare({
    key,
    source: "local",
    terms: "unchanged",
    expected: binding,
    binding: nextBinding,
    legacy: true,
  }))!;
  await run((tx) => confirm(tx, next, nextBinding));
  const saved = (await api().read(key))!;
  expect(saved.attempts[0]).toEqual(next.attempts[0]);
  expect(saved.attempts[1].reward).toBe("delivery_pending");
});
it.each([
  { state: "confirmed", rewardDue: false, evidence: "not-due" },
  { state: "rejected", evidence: "rejection" },
] as SettlementDecision[])("retains not-due semantics for $state", async (d) => {
  await run((tx) => confirm(tx, base, binding, d));
  const saved = (await api().read(key))!;
  expect(saved.attempts[0]).toMatchObject({
    progress: d.state,
    reward: "not_due",
    evidence: d.evidence,
  });
});
it("allows read callback composition but refuses undefined expected insertion", async () => {
  await run((tx) => confirm(tx));
  const terminal = (await api().read(key))!;
  await expect(
    run((tx) =>
      tx.compareSettleEntitlement(key, undefined as unknown as Entitlement, binding, decision),
    ),
  ).rejects.toThrow("corrupt-record");
  await run((tx) =>
    tx.readEntitlement(key, (row) => {
      tx.compareSettleEntitlement(key, row!, binding, decision);
    }),
  );
  expect(await api().read(key)).toEqual(terminal);
});
