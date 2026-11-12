import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openSettlementDatabase, SETTLEMENT_STORES } from "@/lib/rewards/database";
import { settlementForOwner, type Attempt, type Entitlement } from "@/lib/rewards/settlement";
import { confirmationTransactionsForOwner, transactionsForOwner } from "@/lib/rewards/transaction";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";

const owner = "user:history-alice", key = "synthetic-history";
const binding = (operationId: string) => ({ operationId, revision: "r1", snapshot: "synthetic" });
const evidence = "synthetic-evidence-not-authority";
const api = () => settlementForOwner(owner);
const confirmed = (reward: "delivery_pending" | "delivered" | "not_due", id = "first"): Attempt => ({
  binding: binding(id), progress: "confirmed", reward, evidence,
});
function row(attempts: Attempt[]): Entitlement {
  return { version: 1, owner, key, source: "local", terms: "unchanged-synthetic-terms", attempts };
}
async function putRaw(value: Entitlement) {
  const db = await openSettlementDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entitlements", "readwrite");
      tx.objectStore("entitlements").put(value, JSON.stringify([value.owner, value.key]));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function rawSnapshot() {
  const db = await openSettlementDatabase();
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const tx = db.transaction([...SETTLEMENT_STORES], "readonly");
      const records: Record<string, unknown> = {};
      for (const store of SETTLEMENT_STORES) {
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => { records[store] = request.result; };
      }
      tx.oncomplete = () => resolve(records);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("no-network"); }));
  localStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal(owner);
});
afterEach(() => { vi.unstubAllGlobals(); });
const following: Attempt[] = [
  { binding: binding("next"), progress: "pending", reward: "awaiting_confirmation" },
  { binding: binding("next"), progress: "legacy_unknown", reward: "awaiting_confirmation" },
  { binding: binding("next"), progress: "rejected", reward: "not_due", evidence },
  confirmed("delivery_pending", "next"),
];
for (const reward of ["delivery_pending", "delivered", "not_due"] as const) {
  for (const next of following) {
    for (const operation of ["read", "list", "settle", "transaction-read", "atomic-confirm"] as const) {
      it(`${operation} rejects ${reward} confirmation followed by ${next.progress}, preserving raw records`, async () => {
        const corrupt = row([confirmed(reward), next]);
        await putRaw(corrupt);
        const before = await rawSnapshot();
        let action: Promise<unknown>;
        if (operation === "read") action = api().read(key);
        else if (operation === "list") action = api().list();
        else if (operation === "settle") action = api().settle(key, next.binding, { state: "confirmed", rewardDue: true, evidence });
        else if (operation === "transaction-read") action = transactionsForOwner(owner).run(tx => {
          tx.compareWrite("economy", "synthetic-marker", undefined, { synthetic: true });
          tx.readEntitlement(key, () => {});
        });
        else action = confirmationTransactionsForOwner(owner).run(tx => {
          for (const store of ["economy", "appliedGrants", "migrationState"] as const)
            tx.compareWrite(store, "synthetic-marker", undefined, { synthetic: true });
          tx.compareSettleEntitlement(key, corrupt, next.binding, { state: "confirmed", rewardDue: true, evidence });
        });
        await expect(action).rejects.toThrow("settlement:corrupt-record");
        expect(await rawSnapshot()).toEqual(before);
      });
    }
  }
}
it.each(["pending", "rejected", "legacy_unknown"] as const)("keeps legitimately superseded %s history and final confirmation", async progress => {
  await api().prepare({ key, source: "local", terms: "unchanged-synthetic-terms", binding: binding("first"), expected: null, legacy: progress === "legacy_unknown" });
  if (progress === "rejected") await api().settle(key, binding("first"), { state: "rejected", evidence });
  const prepared = (await api().prepare({ key, source: "local", terms: "unchanged-synthetic-terms", binding: binding("next"), expected: binding("first") }))!;
  await confirmationTransactionsForOwner(owner).run(tx => {
    tx.compareSettleEntitlement(key, prepared, binding("next"), { state: "confirmed", rewardDue: true, evidence });
    tx.compareWrite("appliedGrants", "synthetic-marker", undefined, { synthetic: true });
  });
  const saved = (await api().read(key))!;
  expect(saved.attempts[0]).toEqual(prepared.attempts[0]);
  expect(saved.attempts[1]).toEqual(confirmed("delivery_pending", "next"));
  expect(await api().list()).toEqual([saved]);
});
it.each(["delivery_pending", "delivered", "not_due"] as const)("preserves a final %s confirmation without introducing delivery", async reward => {
  const saved = row([{ binding: binding("old"), progress: "pending", reward: "awaiting_confirmation" }, confirmed(reward)]);
  await putRaw(saved);
  expect(await api().read(key)).toEqual(saved);
  expect(await api().list()).toEqual([saved]);
  await transactionsForOwner(owner).run(tx => tx.readEntitlement(key, value => { expect(value).toEqual(saved); }));
  expect(await api().prepare({ key, source: "local", terms: saved.terms, binding: binding("first"), expected: null })).toEqual(saved);
  await expect(api().prepare({ key, source: "local", terms: saved.terms, binding: binding("new"), expected: binding("first") })).rejects.toThrow("already-confirmed");
  if (reward === "delivered") await expect(api().settle(key, binding("first"), { state: "confirmed", rewardDue: true, evidence })).rejects.toThrow("decision-conflict");
  expect((await rawSnapshot()).entitlements).toEqual([saved]);
});
