import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { SETTLEMENT_DB, settlementForOwner, type Binding } from "@/lib/rewards/settlement";
import { getActiveOwner, setActiveOwnerInternal } from "@/lib/identity/owner";

const b: Binding = { operationId: "chapter:alice:c1", revision: "r1", snapshot: '{"score":1}' };
const b2: Binding = { ...b, revision: "r2", snapshot: '{"score":2}' };
const input = () => ({
  key: "chapter:c1",
  source: "local" as const,
  terms: "capped-reward-v1",
  binding: b,
  expected: null,
});
const ack = { state: "confirmed" as const, rewardDue: true, evidence: "rpc-result:r1" };
const latest = (row: any) => row.attempts.at(-1);
async function raw(write: (store: IDBObjectStore) => void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(SETTLEMENT_DB, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entitlements", "readwrite");
      write(tx.objectStore("entitlements"));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("external network forbidden");
    }),
  );
  setActiveOwnerInternal("user:alice");
});

describe("isolated durable entitlement foundation (no profile delivery)", () => {
  it("commits creation and survives module reload/cold context loss", async () => {
    await settlementForOwner(getActiveOwner()).prepare(input());
    vi.resetModules();
    const module = await import("@/lib/rewards/settlement");
    const owner = await import("@/lib/identity/owner");
    owner.setActiveOwnerInternal("user:alice");
    expect(latest(await module.settlementForOwner("user:alice").read(input().key)).progress).toBe(
      "pending",
    );
  });
  it("retries the same entitlement without adding attempts or delivery", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    const row = await api.prepare(input());
    expect(row?.attempts).toHaveLength(1);
    expect(latest(row).reward).toBe("awaiting_confirmation");
  });
  it("confirmation creates delivery_pending, never delivered, and is idempotent", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    await api.settle(input().key, b, ack);
    expect(latest(await api.settle(input().key, b, ack))).toMatchObject({
      progress: "confirmed",
      reward: "delivery_pending",
    });
    expect("deliver" in api).toBe(false);
    await expect(api.prepare({ ...input(), binding: b2, expected: b })).rejects.toThrow(
      "already-confirmed",
    );
  });
  it("retains permanent rejection and reason without deleting history", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    await api.settle(input().key, b, { state: "rejected", evidence: "invalid_campaign_id" });
    const row = await api.prepare({ ...input(), binding: b2, expected: b });
    expect(row?.attempts).toHaveLength(2);
    expect(row?.attempts[0]).toMatchObject({
      progress: "rejected",
      reward: "not_due",
      evidence: "invalid_campaign_id",
    });
  });
  it.each(["confirmed", "rejected"] as const)(
    "rejects stale %s against a newer revision",
    async (state) => {
      const api = settlementForOwner("user:alice");
      await api.prepare(input());
      await api.prepare({ ...input(), binding: b2, expected: b });
      await expect(
        api.settle(input().key, b, { state, rewardDue: true, evidence: "old" }),
      ).rejects.toThrow("stale-binding");
      expect(latest(await api.read(input().key)).binding).toEqual(b2);
    },
  );
  it("compares full snapshot even when revision is unchanged or absent in V17", async () => {
    const api = settlementForOwner("user:alice");
    const legacy = { ...b, revision: null };
    await api.prepare({ ...input(), binding: legacy, legacy: true });
    await expect(
      api.settle(input().key, { ...legacy, snapshot: "different" }, ack),
    ).rejects.toThrow("stale-binding");
    expect(latest(await api.read(input().key)).progress).toBe("legacy_unknown");
  });
  it("separates owners and invalidates old handles even after switch back", async () => {
    const alice = settlementForOwner("user:alice");
    await alice.prepare(input());
    setActiveOwnerInternal("user:bob");
    expect(await settlementForOwner("user:bob").read(input().key)).toBeUndefined();
    await expect(alice.settle(input().key, b, ack)).rejects.toThrow("identity-changed");
    setActiveOwnerInternal("user:alice");
    await expect(alice.read(input().key)).rejects.toThrow("identity-changed");
    expect(latest(await settlementForOwner("user:alice").read(input().key)).progress).toBe(
      "pending",
    );
  });
  it("fences an owner switch while opening storage", async () => {
    const api = settlementForOwner("user:alice");
    const writing = api.prepare(input());
    setActiveOwnerInternal("user:bob");
    await expect(writing).rejects.toThrow("identity-changed");
    setActiveOwnerInternal("user:alice");
    expect(await settlementForOwner("user:alice").read(input().key)).toBeUndefined();
  });
  it("serializes two independent module contexts with CAS: one conflicting writer wins", async () => {
    const one = settlementForOwner("user:alice");
    await one.prepare(input());
    vi.resetModules();
    const m = await import("@/lib/rewards/settlement");
    (await import("@/lib/identity/owner")).setActiveOwnerInternal("user:alice");
    const two = m.settlementForOwner("user:alice");
    const results = await Promise.allSettled([
      one.prepare({ ...input(), binding: b2, expected: b }),
      two.prepare({ ...input(), binding: { ...b2, revision: "r3" }, expected: b }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await one.read(input().key))?.attempts).toHaveLength(2);
  });
  it("serializes concurrent duplicate creation", async () => {
    const one = settlementForOwner("user:alice"),
      two = settlementForOwner("user:alice");
    await Promise.all([one.prepare(input()), two.prepare(input())]);
    expect((await one.read(input().key))?.attempts).toHaveLength(1);
  });
  it("quota abort preserves the existing record", async () => {
    const api = settlementForOwner("user:alice");
    const before = await api.prepare(input());
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await expect(api.settle(input().key, b, ack)).rejects.toThrow("full");
    spy.mockRestore();
    expect(await api.read(input().key)).toEqual(before);
  });
  it("read failure is not absence and cannot overwrite the existing record", async () => {
    const api = settlementForOwner("user:alice");
    const before = await api.prepare(input());
    const spy = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(() => {
      throw new Error("read-failed");
    });
    await expect(api.prepare(input())).rejects.toThrow("read-failed");
    spy.mockRestore();
    expect(await api.read(input().key)).toEqual(before);
  });
  it("corruption fails closed without replacing the record with empty history", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    const corrupt = { ...input(), attempts: [] };
    await raw((store) => store.put(corrupt, JSON.stringify(["user:alice", input().key])));
    await expect(api.read(input().key)).rejects.toThrow("corrupt-record");
    await expect(api.prepare(input())).rejects.toThrow("corrupt-record");
    await expect(api.settle(input().key, b, ack)).rejects.toThrow("corrupt-record");
  });
  it("does not inspect or erase V17 data or infer delivery from missing Outbox receipts", async () => {
    localStorage.setItem("irth.campaign.ledger.v1", "legacy-fixture");
    const api = settlementForOwner("user:alice");
    await api.prepare({ ...input(), legacy: true });
    expect(latest(await api.read(input().key))).toMatchObject({
      progress: "legacy_unknown",
      reward: "awaiting_confirmation",
    });
    expect(localStorage.getItem("irth.campaign.ledger.v1")).toBe("legacy-fixture");
    expect(await api.read("nonexistent")).toBeUndefined();
  });
  it("crash before recording leaves no success; crash after commit leaves resumable intent", async () => {
    const api = settlementForOwner("user:alice");
    expect(await api.read(input().key)).toBeUndefined();
    await api.prepare(input());
    expect(latest(await settlementForOwner("user:alice").read(input().key)).progress).toBe(
      "pending",
    );
  });
  it("abort during confirmation retains pending; commit before restart retains delivery_pending", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      this.transaction.abort();
      return req;
    });
    await expect(api.settle(input().key, b, ack)).rejects.toThrow();
    spy.mockRestore();
    expect(latest(await api.read(input().key)).progress).toBe("pending");
    await api.settle(input().key, b, ack);
    expect(latest(await settlementForOwner("user:alice").read(input().key)).reward).toBe(
      "delivery_pending",
    );
  });
  it.each(["server", "local", "guest"] as const)(
    "preserves %s source without applying a grant",
    async (source) => {
      const api = settlementForOwner("user:alice");
      expect((await api.prepare({ ...input(), source }))?.source).toBe(source);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("rejects conflicting decisions, changed terms and missing entitlement", async () => {
    const api = settlementForOwner("user:alice");
    await expect(api.settle(input().key, b, ack)).rejects.toThrow("missing-entitlement");
    await api.prepare(input());
    await api.settle(input().key, b, ack);
    await expect(
      api.settle(input().key, b, { state: "rejected", evidence: "late" }),
    ).rejects.toThrow("decision-conflict");
    await expect(api.prepare({ ...input(), terms: "different" })).rejects.toThrow(
      "entitlement-conflict",
    );
  });
  it("confirmation may explicitly establish no entitlement due, never delivery", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    expect(latest(await api.settle(input().key, b, { ...ack, rewardDue: false })).reward).toBe(
      "not_due",
    );
  });
  it("crash before creation commit preserves absence and permits safe retry", async () => {
    const api = settlementForOwner("user:alice");
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      this.transaction.abort();
      return req;
    });
    await expect(api.prepare(input())).rejects.toThrow();
    spy.mockRestore();
    expect(await api.read(input().key)).toBeUndefined();
    expect((await api.prepare(input()))?.attempts).toHaveLength(1);
  });
  it("owner switch after put aborts settlement and leaves the old owner's intent pending", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      setActiveOwnerInternal("user:bob");
      return req;
    });
    await expect(api.settle(input().key, b, ack)).rejects.toThrow("identity-changed");
    spy.mockRestore();
    expect(await settlementForOwner("user:bob").read(input().key)).toBeUndefined();
    setActiveOwnerInternal("user:alice");
    expect(latest(await settlementForOwner("user:alice").read(input().key)).progress).toBe(
      "pending",
    );
  });
  it("competing confirmations and rejections cannot overwrite the winning terminal decision", async () => {
    const one = settlementForOwner("user:alice"),
      two = settlementForOwner("user:alice");
    await one.prepare(input());
    const results = await Promise.allSettled([
      one.settle(input().key, b, ack),
      two.settle(input().key, b, { state: "rejected", evidence: "invalid" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await one.read(input().key))?.attempts).toHaveLength(1);
  });

  it("discovers resumable entitlements after restart without leaking another owner's rows", async () => {
    const alice = settlementForOwner("user:alice");
    await alice.prepare(input());
    await alice.settle(input().key, b, ack);
    await alice.prepare({ ...input(), key: "other" });
    setActiveOwnerInternal("user:bob");
    const bob = settlementForOwner("user:bob");
    expect(await bob.list()).toEqual([]);
    await bob.prepare(input());
    setActiveOwnerInternal("user:alice");
    const rows = await settlementForOwner("user:alice").list();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.owner === "user:alice")).toBe(true);
    expect(rows.map((row) => latest(row).reward).sort()).toEqual([
      "awaiting_confirmation",
      "delivery_pending",
    ]);
  });
  it("a corrupt owned record aborts the whole scan instead of returning an empty or partial list", async () => {
    const api = settlementForOwner("user:alice");
    await api.prepare(input());
    await raw((store) =>
      store.put({ owner: "user:alice" }, JSON.stringify(["user:alice", "broken"])),
    );
    await expect(api.list()).rejects.toThrow("corrupt-record");
    expect((await api.read(input().key))?.attempts).toHaveLength(1);
  });
});
