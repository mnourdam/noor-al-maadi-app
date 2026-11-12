/** Isolated synthetic native-browser acceptance. Never imported by the app. */
import { transactionsForOwner, type SettlementRecord, type Json } from "@/lib/rewards/transaction";
import { openSettlementDatabase } from "@/lib/rewards/database";
import { getActiveOwner, setActiveOwnerInternal } from "@/lib/identity/owner";

function owner(id: string) { setActiveOwnerInternal(id); }
async function read(key = "synthetic", store: "economy" | "appliedGrants" | "migrationState" = "economy") {
  let value: SettlementRecord | undefined;
  await transactionsForOwner(getActiveOwner()).run(tx => tx.read(store, key, row => { value = row; }));
  return value ?? null;
}
async function write(base: SettlementRecord | undefined, value: Json) {
  try {
    await transactionsForOwner(getActiveOwner()).run(tx => tx.compareWrite("economy", "synthetic", base, value));
    return { status: "committed" };
  } catch (error) {
    return { status: "rejected", reason: error instanceof Error ? error.message : "unknown" };
  }
}
async function abortAfterNativePut(base: SettlementRecord) {
  const original = IDBObjectStore.prototype.put;
  const reached = new Set<string>();
  let abort: (() => void) | undefined;
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
    const request = original.apply(this, args);
    const store = this.name;
    if (["economy", "appliedGrants", "migrationState"].includes(store)) request.addEventListener("success", () => {
      reached.add(store);
      if (reached.size === 3) abort!();
    }, { once: true });
    return request;
  };
  let reason = "";
  try {
    await transactionsForOwner(getActiveOwner()).run(tx => {
      abort = () => tx.abort();
      tx.compareWrite("economy", "synthetic", base, { synthetic: "must-abort" });
      tx.compareWrite("appliedGrants", "abort-marker", undefined, { synthetic: true });
      tx.compareWrite("migrationState", "abort-marker", undefined, { synthetic: true });
    });
  } catch (error) { reason = error instanceof Error ? error.message : "unknown"; }
  finally { IDBObjectStore.prototype.put = original; }
  return { reached: [...reached].sort(), reason };
}
async function rawOverwrite(row: SettlementRecord) {
  // Deliberately bypass the primitive. This demonstrates its limited boundary:
  // it cannot exclude uncooperative/old code with raw same-origin IDB access.
  const db = await openSettlementDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("economy", "readwrite");
      tx.objectStore("economy").put(row, JSON.stringify([row.owner, row.key]));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
Object.assign(window, { settlementNative: { owner, read, write, abortAfterNativePut, rawOverwrite } });
