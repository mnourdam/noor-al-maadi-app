/** Internal, inactive storage primitive. No grant, delivered mutation or profile integration. */
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "@/lib/identity/owner";
import { openSettlementDatabase, SETTLEMENT_STORES } from "./database";
import { validateEntitlement, type Entitlement } from "./settlement";

export type WritableSettlementStore = "economy" | "appliedGrants" | "migrationState";
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface SettlementRecord {
  schema: 1;
  owner: string;
  key: string;
  revision: number;
  value: Json;
}
export interface SettlementTransaction {
  read(
    store: WritableSettlementStore,
    key: string,
    receive: (row: SettlementRecord | undefined) => void,
  ): void;
  readEntitlement(key: string, receive: (row: Entitlement | undefined) => void): void;
  /** Full-snapshot CAS; missing expected means insert-only. Revision is assigned here. */
  compareWrite(
    store: WritableSettlementStore,
    key: string,
    expected: SettlementRecord | undefined,
    value: Json,
  ): void;
  abort(): void;
}
function fail(reason: string): never {
  throw new Error(`settlement:${reason}`);
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (
      Object.keys(value).length !== value.length ||
      !Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean)
    )
      fail("invalid-json");
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return fail("invalid-json");
}
function validate(row: SettlementRecord, owner: string, key: string): void {
  if (
    !row ||
    row.schema !== 1 ||
    row.owner !== owner ||
    row.key !== key ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1
  )
    fail("corrupt-record");
  canonical(row.value);
}
/** Callbacks must only synchronously enqueue IDB work. Thenables are rejected. */
function synchronous(work: () => unknown): void {
  const result = work();
  if (result && typeof (result as PromiseLike<unknown>).then === "function") {
    // Observe a rejected async callback while refusing its transaction contract.
    void Promise.resolve(result).catch(() => {});
    fail("async-transaction-callback");
  }
}
export function transactionsForOwner(owner: string) {
  const epoch = getIdentityEpoch();
  if (!/^(user|guest):.+/.test(owner)) fail("invalid-owner");
  const guard = () => {
    if (getActiveOwner() !== owner || getIdentityEpoch() !== epoch) fail("identity-changed");
  };
  guard();
  return {
    async run(work: (scope: SettlementTransaction) => void): Promise<void> {
      guard();
      const db = await openSettlementDatabase();
      try {
        guard();
        await new Promise<void>((resolve, reject) => {
          // Shared store scope serializes comparisons and all writes across connections.
          const tx = db.transaction([...SETTLEMENT_STORES], "readwrite");
          let error: unknown;
          let active = true;
          const mutations = new Set<string>();
          const stop = (cause: unknown) => {
            error ??= cause;
            try {
              tx.abort();
            } catch {
              /* a completed transaction cannot be undone */
            }
          };
          const unsubscribe = onOwnerChange(() => stop(new Error("settlement:identity-changed")));
          const check = () => {
            if (!active || error) fail("transaction-inactive");
            guard();
          };
          const keyFor = (key: string) => {
            if (typeof key !== "string" || !key.length) fail("invalid-key");
            return JSON.stringify([owner, key]);
          };
          const storeFor = (name: WritableSettlementStore) => {
            if (!["economy", "appliedGrants", "migrationState"].includes(name))
              fail("store-not-writable");
            return tx.objectStore(name);
          };
          const caught = (work: () => void) => {
            try {
              check();
              synchronous(work);
            } catch (cause) {
              stop(cause);
            }
          };
          const scope: SettlementTransaction = {
            read(store, key, receive) {
              caught(() => {
                const address = JSON.stringify([store, keyFor(key)]);
                if (mutations.has(address)) fail("read-after-write");
                const req = storeFor(store).get(keyFor(key));
                req.onsuccess = () =>
                  caught(() => {
                    const row = req.result as SettlementRecord | undefined;
                    if (row !== undefined) validate(row, owner, key);
                    synchronous(() => receive(row));
                  });
              });
            },
            readEntitlement(key, receive) {
              caught(() => {
                const req = tx.objectStore("entitlements").get(keyFor(key));
                req.onsuccess = () =>
                  caught(() => {
                    const row = req.result as Entitlement | undefined;
                    if (row !== undefined) validateEntitlement(row, owner, key);
                    synchronous(() => receive(row));
                  });
              });
            },
            compareWrite(store, key, expected, value) {
              caught(() => {
                // Reject duplicate targets: queued reads must not both compare the pre-put value.
                const address = JSON.stringify([store, keyFor(key)]);
                if (mutations.has(address)) fail("duplicate-write-target");
                mutations.add(address);
                // Capture caller data before waiting for the comparison read.
                const base = expected === undefined ? undefined : structuredClone(expected);
                const nextValue = structuredClone(value);
                canonical(nextValue);
                if (base !== undefined) validate(base, owner, key);
                const target = storeFor(store);
                const req = target.get(keyFor(key));
                req.onsuccess = () =>
                  caught(() => {
                    const current = req.result as SettlementRecord | undefined;
                    if (current !== undefined) validate(current, owner, key);
                    if (
                      (base === undefined) !== (current === undefined) ||
                      (base !== undefined && canonical(base) !== canonical(current))
                    )
                      fail("stale-record");
                    const next: SettlementRecord = {
                      schema: 1,
                      owner,
                      key,
                      revision: (current?.revision ?? 0) + 1,
                      value: nextValue,
                    };
                    validate(next, owner, key);
                    guard();
                    target.put(next, keyFor(key));
                  });
              });
            },
            abort() {
              stop(new Error("settlement:transaction-aborted"));
            },
          };
          tx.oncomplete = () => {
            active = false;
            unsubscribe();
            try {
              guard();
              resolve();
            } catch (cause) {
              reject(cause);
            }
          };
          tx.onabort = () => {
            active = false;
            unsubscribe();
            reject(error ?? tx.error ?? new Error("settlement:storage-failed"));
          };
          caught(() => synchronous(() => work(scope)));
        });
      } finally {
        db.close();
      }
    },
  };
}
