import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore, IDBTransaction } from "fake-indexeddb";
import { openSettlementDatabase, SETTLEMENT_DB, SETTLEMENT_STORES } from "@/lib/rewards/database";
import { transactionsForOwner, type SettlementRecord } from "@/lib/rewards/transaction";
import { settlementForOwner } from "@/lib/rewards/settlement";
import { setActiveOwnerInternal } from "@/lib/identity/owner";

const owner = "user:alice";
const physical = (key: string, who = owner) => JSON.stringify([who, key]);
const binding = { operationId: "op1", revision: "r2", snapshot: '{"scene":2}' };
const legacy = {
  version: 1,
  owner,
  key: "chapter:c1",
  source: "local",
  terms: "unchanged-terms",
  attempts: [
    {
      binding: { ...binding, revision: null, snapshot: '{"scene":1}' },
      progress: "rejected",
      reward: "not_due",
      evidence: "invalid",
    },
    { binding, progress: "pending", reward: "awaiting_confirmation" },
  ],
};
function openVersion(version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SETTLEMENT_DB, version);
    req.onupgradeneeded = () => upgrade?.(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function writeRaw(db: IDBDatabase, store: string, key: string, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
async function readRaw(store: string, key: string) {
  const db = await openSettlementDatabase();
  try {
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function seedV1() {
  const db = await openVersion(1, (db) => db.createObjectStore("entitlements"));
  await writeRaw(db, "entitlements", physical(legacy.key), legacy);
  const other = { ...legacy, owner: "user:bob", key: "story:s1", attempts: [legacy.attempts[0]] };
  await writeRaw(db, "entitlements", physical(other.key, other.owner), other);
  db.close();
  return other;
}
async function read(
  key = "balance",
  store: "economy" | "appliedGrants" | "migrationState" = "economy",
) {
  let result: SettlementRecord | undefined;
  await transactionsForOwner(owner).run((tx) =>
    tx.read(store, key, (row) => {
      result = row;
    }),
  );
  return result;
}
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("external network forbidden");
    }),
  );
  setActiveOwnerInternal(owner);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 3A inactive schema and shared transactions", () => {
  it("creates exactly four empty stores; schema existence is not migration readiness", async () => {
    const db = await openSettlementDatabase();
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames).sort()).toEqual([...SETTLEMENT_STORES].sort());
    db.close();
    expect(await read()).toBeUndefined();
    expect(await read("state", "migrationState")).toBeUndefined();
    expect(await settlementForOwner(owner).list()).toEqual([]);
  });
  it("upgrades v1 without changing any entitlement values, keys or attempt order", async () => {
    const other = await seedV1();
    const before = JSON.stringify(legacy);
    expect(JSON.stringify(await readRaw("entitlements", physical(legacy.key)))).toBe(before);
    expect(await readRaw("entitlements", physical(other.key, other.owner))).toEqual(other);
    expect((await settlementForOwner(owner).read(legacy.key))?.attempts).toEqual(legacy.attempts);
  });
  it("does not silently repair corrupted entitlement data during upgrade", async () => {
    await seedV1();
    const db = await openVersion(1);
    await writeRaw(db, "entitlements", physical("corrupt"), { raw: "keep-me" });
    db.close();
    expect(await readRaw("entitlements", physical("corrupt"))).toEqual({ raw: "keep-me" });
    await expect(settlementForOwner(owner).read("corrupt")).rejects.toThrow("corrupt-record");
  });
  it("rolls back a malformed v1 schema upgrade rather than replacing its store", async () => {
    const db = await openVersion(1, (db) =>
      db.createObjectStore("entitlements", { keyPath: "id" }),
    );
    db.close();
    await expect(openSettlementDatabase()).rejects.toThrow("invalid-schema");
    const unchanged = await openVersion(1);
    expect(unchanged.version).toBe(1);
    expect(Array.from(unchanged.objectStoreNames)).toEqual(["entitlements"]);
    unchanged.close();
  });
  it("commits synthetic records in three stores atomically while reading an unchanged entitlement", async () => {
    await seedV1();
    await transactionsForOwner(owner).run((tx) => {
      tx.readEntitlement(legacy.key, (row) => {
        expect(row).toEqual(legacy);
        tx.compareWrite("economy", "balance", undefined, { synthetic: 7 });
        tx.compareWrite("appliedGrants", "test-key", undefined, { synthetic: true });
        tx.compareWrite("migrationState", "state", undefined, { phase: "uninitialized" });
      });
    });
    expect((await read())?.value).toEqual({ synthetic: 7 });
    expect((await read("test-key", "appliedGrants"))?.value).toEqual({ synthetic: true });
    expect((await read("state", "migrationState"))?.value).toEqual({ phase: "uninitialized" });
    expect(await readRaw("entitlements", physical(legacy.key))).toEqual(legacy);
  });
  it("quota on a later store rolls back earlier successful requests", async () => {
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "appliedGrants") throw new DOMException("full", "QuotaExceededError");
      return real.apply(this, args);
    });
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("economy", "balance", undefined, { synthetic: 7 });
        tx.compareWrite("appliedGrants", "test-key", undefined, { synthetic: true });
      }),
    ).rejects.toThrow("full");
    expect(await read()).toBeUndefined();
    expect(await read("test-key", "appliedGrants")).toBeUndefined();
  });
  it("asynchronous request failure aborts all stores", async () => {
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "appliedGrants") {
        real.apply(this, args);
        return this.add(args[0], args[1]); // duplicate-key request error
      }
      return real.apply(this, args);
    });
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("economy", "balance", undefined, 7);
        tx.compareWrite("appliedGrants", "test-key", undefined, true);
      }),
    ).rejects.toThrow();
    expect(await read()).toBeUndefined();
    expect(await read("test-key", "appliedGrants")).toBeUndefined();
  });
  it("abort after put success but before commit leaves no partial creation", async () => {
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      req.onsuccess = () => this.transaction.abort();
      return req;
    });
    await expect(
      transactionsForOwner(owner).run((tx) => tx.compareWrite("economy", "balance", undefined, 7)),
    ).rejects.toThrow();
    expect(await read()).toBeUndefined();
  });
  it("commit survives loss of caller context and reopening after module restart", async () => {
    await transactionsForOwner(owner).run((tx) =>
      tx.compareWrite("economy", "balance", undefined, { synthetic: 9 }),
    );
    vi.resetModules();
    const module = await import("@/lib/rewards/transaction");
    (await import("@/lib/identity/owner")).setActiveOwnerInternal(owner);
    let value: unknown;
    await module.transactionsForOwner(owner).run((tx) =>
      tx.read("economy", "balance", (row) => {
        value = row?.value;
      }),
    );
    expect(value).toEqual({ synthetic: 9 });
  });
  it("same-owner concurrent contexts cannot both replace the same snapshot", async () => {
    await transactionsForOwner(owner).run((tx) =>
      tx.compareWrite("economy", "balance", undefined, 0),
    );
    const base = await read();
    vi.resetModules();
    const other = await import("@/lib/rewards/transaction");
    (await import("@/lib/identity/owner")).setActiveOwnerInternal(owner);
    const results = await Promise.allSettled([
      transactionsForOwner(owner).run((tx) => tx.compareWrite("economy", "balance", base, 1)),
      other.transactionsForOwner(owner).run((tx) => tx.compareWrite("economy", "balance", base, 2)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await read())?.revision).toBe(2);
  });
  it("two accounts in independent contexts commit distinct owner-bound records", async () => {
    const alice = transactionsForOwner(owner);
    vi.resetModules();
    const module = await import("@/lib/rewards/transaction");
    (await import("@/lib/identity/owner")).setActiveOwnerInternal("user:bob");
    const bob = module.transactionsForOwner("user:bob");
    await Promise.all([
      alice.run((tx) => tx.compareWrite("economy", "balance", undefined, 1)),
      bob.run((tx) => tx.compareWrite("economy", "balance", undefined, 2)),
    ]);
    expect((await readRaw("economy", physical("balance"))).value).toBe(1);
    expect((await readRaw("economy", physical("balance", "user:bob"))).value).toBe(2);
  });
  it("identity switch after put aborts the unfinished transaction", async () => {
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      setActiveOwnerInternal("user:bob");
      return req;
    });
    await expect(
      transactionsForOwner(owner).run((tx) => tx.compareWrite("economy", "balance", undefined, 1)),
    ).rejects.toThrow("identity-changed");
    setActiveOwnerInternal(owner);
    expect(await read()).toBeUndefined();
  });
  it("a commit completed before account switch stays with its original owner even if response is rejected", async () => {
    const realPut = IDBObjectStore.prototype.put;
    let target: IDBTransaction | undefined;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      target = this.transaction as unknown as IDBTransaction;
      return realPut.apply(this, args);
    });
    const realDispatch = IDBTransaction.prototype.dispatchEvent;
    vi.spyOn(IDBTransaction.prototype, "dispatchEvent").mockImplementation(function (
      this: IDBTransaction,
      ...args: Parameters<IDBTransaction["dispatchEvent"]>
    ) {
      if (this === target && args[0].type === "complete") setActiveOwnerInternal("user:bob");
      return realDispatch.apply(this, args);
    });
    await expect(
      transactionsForOwner(owner).run((tx) => tx.compareWrite("economy", "balance", undefined, 3)),
    ).rejects.toThrow("identity-changed");
    expect(await readRaw("economy", physical("balance", "user:bob"))).toBeUndefined();
    setActiveOwnerInternal(owner);
    expect((await read())?.value).toBe(3);
  });
  it("corruption and read errors cannot replace a record with a default or partial state", async () => {
    const db = await openSettlementDatabase();
    await writeRaw(db, "economy", physical("balance"), { corrupt: "preserve" });
    db.close();
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("migrationState", "state", undefined, { phase: "uninitialized" });
        tx.compareWrite("economy", "balance", undefined, 0);
      }),
    ).rejects.toThrow("corrupt-record");
    expect(await readRaw("economy", physical("balance"))).toEqual({ corrupt: "preserve" });
    expect(await read("state", "migrationState")).toBeUndefined();
  });
  it("failed reading rejects rather than treating the store as empty", async () => {
    await transactionsForOwner(owner).run((tx) =>
      tx.compareWrite("economy", "balance", undefined, 4),
    );
    const spy = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(() => {
      throw new Error("unreadable");
    });
    await expect(read()).rejects.toThrow("unreadable");
    spy.mockRestore();
    expect((await read())?.value).toBe(4);
  });
  it("rejects thenable callbacks and does not commit synchronous writes queued before them", async () => {
    await expect(
      transactionsForOwner(owner).run(async (tx) => {
        tx.compareWrite("economy", "balance", undefined, 4);
      }),
    ).rejects.toThrow("async-transaction-callback");
    expect(await read()).toBeUndefined();
    await expect(
      transactionsForOwner(owner).run((tx) => tx.read("economy", "balance", async () => {})),
    ).rejects.toThrow("async-transaction-callback");
  });
  it("does not expose entitlement writes, delivered operations, raw transactions or economic activation", async () => {
    await seedV1();
    await expect(
      transactionsForOwner(owner).run((tx) => {
        expect(Object.keys(tx).sort()).toEqual([
          "abort",
          "compareWrite",
          "read",
          "readEntitlement",
        ]);
        tx.compareWrite("entitlements" as any, legacy.key, undefined, { reward: "delivered" });
      }),
    ).rejects.toThrow("store-not-writable");
    expect(await readRaw("entitlements", physical(legacy.key))).toEqual(legacy);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects stale complete snapshots even if a caller forges the same revision", async () => {
    await transactionsForOwner(owner).run((tx) =>
      tx.compareWrite("economy", "balance", undefined, 1),
    );
    const base = (await read())!;
    await expect(
      transactionsForOwner(owner).run((tx) =>
        tx.compareWrite("economy", "balance", { ...base, value: 99 }, 3),
      ),
    ).rejects.toThrow("stale-record");
    expect((await read())?.value).toBe(1);
  });
  it("closes idle connections on versionchange and exposes VersionError to old code", async () => {
    const db = await openSettlementDatabase();
    const next = await openVersion(3);
    next.close();
    expect(() => db.transaction("entitlements")).toThrow();
    await expect(openVersion(1)).rejects.toMatchObject({ name: "VersionError" });
    await expect(openSettlementDatabase()).rejects.toMatchObject({ name: "VersionError" });
  });
  it("reports blocked old connections without a hidden late upgrade; explicit retry preserves data", async () => {
    await seedV1();
    const old = await openVersion(1);
    await expect(openSettlementDatabase()).rejects.toThrow("database-blocked");
    old.close();
    // The abandoned open's upgrade is aborted; the explicit retry is the only accepted success.
    const db = await openSettlementDatabase();
    expect(db.version).toBe(2);
    db.close();
    expect(await readRaw("entitlements", physical(legacy.key))).toEqual(legacy);
  });
  it("two writes to the same key within one transaction cannot bypass CAS through queued reads", async () => {
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("economy", "balance", undefined, 1);
        tx.compareWrite("economy", "balance", undefined, 2);
      }),
    ).rejects.toThrow("duplicate-write-target");
    expect(await read()).toBeUndefined();
  });
  it("rejects a misleading read after a queued write instead of returning a pre-write snapshot", async () => {
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("economy", "balance", undefined, 1);
        tx.read("economy", "balance", () => {});
      }),
    ).rejects.toThrow("read-after-write");
    expect(await read()).toBeUndefined();
  });
  it("uses the latest in-transaction read for sequential concurrent changes", async () => {
    await transactionsForOwner(owner).run((tx) =>
      tx.compareWrite("economy", "balance", undefined, 0),
    );
    const increment = () =>
      transactionsForOwner(owner).run((tx) =>
        tx.read("economy", "balance", (row) => {
          tx.compareWrite("economy", "balance", row, Number(row!.value) + 1);
        }),
      );
    await Promise.all([increment(), increment()]);
    expect((await read())?.value).toBe(2);
    expect((await read())?.revision).toBe(3);
  });
  it("invalid non-JSON data aborts the whole write set", async () => {
    await expect(
      transactionsForOwner(owner).run((tx) => {
        tx.compareWrite("migrationState", "state", undefined, { phase: "uninitialized" });
        tx.compareWrite("economy", "balance", undefined, new Array(1));
      }),
    ).rejects.toThrow("invalid-json");
    expect(await read()).toBeUndefined();
    expect(await read("state", "migrationState")).toBeUndefined();
  });
  it("a cooperative v1 connection releases upgrade on versionchange without rewriting its records", async () => {
    await seedV1();
    const old = await openVersion(1);
    const changed = vi.fn(() => old.close());
    old.onversionchange = changed;
    const next = await openSettlementDatabase();
    next.close();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await readRaw("entitlements", physical(legacy.key))).toEqual(legacy);
  });
  it("does not resolve a write transaction on request success before oncomplete", async () => {
    const real = IDBObjectStore.prototype.put;
    let completed = false,
      acknowledged = false;
    const requestStates: boolean[] = [];
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      this.transaction.addEventListener("complete", () => {
        completed = true;
      });
      const request = real.apply(this, args);
      request.addEventListener("success", () => {
        requestStates.push(acknowledged);
      });
      return request;
    });
    await transactionsForOwner(owner)
      .run((tx) => tx.compareWrite("economy", "balance", undefined, 7))
      .then(() => {
        acknowledged = true;
        expect(completed).toBe(true);
      });
    expect(requestStates).toEqual([false]);
    expect(acknowledged).toBe(true);
  });
});
