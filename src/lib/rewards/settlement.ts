/** Foundation only: no profile writes, RPC, Outbox inference or delivery API. */
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "@/lib/identity/owner";
import { openSettlementDatabase } from "./database";
export { SETTLEMENT_DB } from "./database";

export type ProgressState =
  "storage_pending" | "save_failed" | "pending" | "confirmed" | "rejected" | "legacy_unknown";
export type RewardState = "awaiting_confirmation" | "delivery_pending" | "delivered" | "not_due";
export type RewardSource = "server" | "local" | "guest";
export interface Binding {
  operationId: string;
  revision: string | null;
  snapshot: string;
}
export interface Attempt {
  binding: Binding;
  progress: "pending" | "confirmed" | "rejected" | "legacy_unknown";
  reward: RewardState;
  evidence?: string;
}
export interface Entitlement {
  version: 1;
  owner: string;
  key: string;
  source: RewardSource;
  /** Immutable authored/capped reward contract identifier, not a grant instruction. */
  terms: string;
  attempts: Attempt[];
}
const STORE = "entitlements";
function fail(message: string): never {
  throw new Error(`settlement:${message}`);
}
const nonempty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
function validBinding(b: Binding): boolean {
  return (
    !!b &&
    nonempty(b.operationId) &&
    (b.revision === null || nonempty(b.revision)) &&
    nonempty(b.snapshot)
  );
}
function token(b: Binding): string {
  return JSON.stringify([b.operationId, b.revision, b.snapshot]);
}
/** Internal validation shared by transactional readers; no repair or coercion. */
export function validateEntitlement(row: Entitlement, owner: string, key: string): void {
  if (
    !row ||
    row.version !== 1 ||
    row.owner !== owner ||
    row.key !== key ||
    !["server", "local", "guest"].includes(row.source) ||
    !nonempty(row.terms) ||
    !Array.isArray(row.attempts) ||
    !row.attempts.length
  )
    fail("corrupt-record");
  const seen = new Set<string>();
  for (const [index, a] of row.attempts.entries()) {
    if (
      !a ||
      !validBinding(a.binding) ||
      seen.has(token(a.binding)) ||
      // prepare forbids every successor after confirmation, even not_due.
      // Persisted history must obey that same terminal invariant; never repair it.
      (a.progress === "confirmed" && index !== row.attempts.length - 1) ||
      !["pending", "confirmed", "rejected", "legacy_unknown"].includes(a.progress) ||
      !["awaiting_confirmation", "delivery_pending", "delivered", "not_due"].includes(a.reward) ||
      (a.progress === "confirmed"
        ? !["delivery_pending", "delivered", "not_due"].includes(a.reward)
        : a.reward !== (a.progress === "rejected" ? "not_due" : "awaiting_confirmation")) ||
      ((a.progress === "confirmed" || a.progress === "rejected") && !nonempty(a.evidence))
    )
      fail("corrupt-record");
    seen.add(token(a.binding));
  }
}

export type SettlementDecision =
  | { state: "confirmed"; rewardDue: boolean; evidence: string }
  | { state: "rejected"; evidence: string };
/** Internal validation only; opaque evidence authenticity belongs to the trusted adapter. */
export function validateSettlementDecision(b: Binding, d: SettlementDecision): void {
  if (
    !validBinding(b) ||
    !nonempty(d.evidence) ||
    !["confirmed", "rejected"].includes(d.state) ||
    (d.state === "confirmed" && typeof d.rewardDue !== "boolean")
  )
    fail("invalid-evidence");
}
/** Pure existing confirmation transition, never delivery or economic admission. */
export function applySettlementDecision(
  current: Entitlement | undefined,
  b: Binding,
  d: SettlementDecision,
): Entitlement {
  validateSettlementDecision(b, d);
  const row = current === undefined ? undefined : structuredClone(current);
  if (!row) return fail("missing-entitlement");
  const a = row.attempts[row.attempts.length - 1];
  if (token(a.binding) !== token(b)) fail("stale-binding");
  const reward =
    d.state === "confirmed" ? (d.rewardDue ? "delivery_pending" : "not_due") : "not_due";
  if (a.progress === "confirmed" || a.progress === "rejected") {
    if (a.progress !== d.state || a.reward !== reward || a.evidence !== d.evidence)
      fail("decision-conflict");
    return row;
  }
  a.progress = d.state;
  a.reward = reward;
  a.evidence = d.evidence;
  return row;
}

/** Capture anew per account session; epochs fence calls, never invalidate durable rows. */
export function settlementForOwner(owner: string) {
  const epoch = getIdentityEpoch();
  if (!/^(user|guest):.+/.test(owner)) fail("invalid-owner");
  const guard = () => {
    if (getActiveOwner() !== owner || getIdentityEpoch() !== epoch) fail("identity-changed");
  };
  guard();
  async function open(): Promise<IDBDatabase> {
    guard();
    const db = await openSettlementDatabase();
    try {
      guard();
    } catch (e) {
      db.close();
      throw e;
    }
    return db;
  }
  async function access(
    key: string,
    change?: (row: Entitlement | undefined) => Entitlement,
  ): Promise<Entitlement | undefined> {
    if (!nonempty(key)) fail("invalid-key");
    const db = await open();
    try {
      return await new Promise<Entitlement | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, change ? "readwrite" : "readonly");
        const store = tx.objectStore(STORE);
        let result: Entitlement | undefined;
        let error: unknown;
        const unsubscribe = onOwnerChange(() => {
          error = new Error("settlement:identity-changed");
          try {
            tx.abort();
          } catch {
            /* already committed: durable owner stays pinned */
          }
        });
        let req: IDBRequest;
        try {
          req = store.get(JSON.stringify([owner, key]));
        } catch (e) {
          unsubscribe();
          tx.abort();
          reject(e);
          return;
        }
        req.onsuccess = () => {
          try {
            guard();
            result = req.result as Entitlement | undefined;
            if (result !== undefined) validateEntitlement(result, owner, key);
            if (change) {
              result = change(result);
              validateEntitlement(result, owner, key);
              guard();
              store.put(result, JSON.stringify([owner, key]));
            }
          } catch (e) {
            error = e;
            tx.abort();
          }
        };
        tx.oncomplete = () => {
          unsubscribe();
          try {
            guard();
            resolve(result);
          } catch (e) {
            reject(e);
          }
        };
        tx.onabort = () => {
          unsubscribe();
          reject(error ?? tx.error ?? new Error("settlement:storage-failed"));
        };
      });
    } finally {
      db.close();
    }
  }
  async function list(): Promise<Entitlement[]> {
    const db = await open();
    try {
      return await new Promise<Entitlement[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const rows: Entitlement[] = [];
        let error: unknown;
        const unsubscribe = onOwnerChange(() => {
          error = new Error("settlement:identity-changed");
          try {
            tx.abort();
          } catch {
            /* completion guard still applies */
          }
        });
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          try {
            guard();
            const cursor = req.result;
            if (!cursor) return;
            const key: unknown = JSON.parse(String(cursor.key));
            if (!Array.isArray(key) || key.length !== 2 || !nonempty(key[0]) || !nonempty(key[1]))
              fail("corrupt-key");
            if (key[0] === owner) {
              const row = cursor.value as Entitlement;
              validateEntitlement(row, owner, key[1]);
              rows.push(row);
            }
            cursor.continue();
          } catch (e) {
            error = e;
            tx.abort();
          }
        };
        tx.oncomplete = () => {
          unsubscribe();
          try {
            guard();
            resolve(rows);
          } catch (e) {
            reject(e);
          }
        };
        tx.onabort = () => {
          unsubscribe();
          reject(error ?? tx.error ?? new Error("settlement:storage-failed"));
        };
      });
    } finally {
      db.close();
    }
  }
  return {
    list,
    read: (key: string) => access(key),
    /** expected=null means create only; a changed binding needs an explicit CAS token. */
    prepare(input: {
      key: string;
      source: RewardSource;
      terms: string;
      binding: Binding;
      expected: Binding | null;
      legacy?: boolean;
      /** Dormant correlation adapter: check history atomically with prepare. */
      pendingOnly?: boolean;
    }) {
      const p = structuredClone(input);
      if (!validBinding(p.binding) || (p.expected !== null && !validBinding(p.expected)))
        fail("invalid-binding");
      return access(p.key, (row) => {
        if (p.pendingOnly && (p.legacy || row?.attempts.some(a => a.progress !== "pending")))
          fail("non-pending-history");
        if (!row) {
          if (p.expected !== null) fail("stale-binding");
          return {
            version: 1,
            owner,
            key: p.key,
            source: p.source,
            terms: p.terms,
            attempts: [
              {
                binding: p.binding,
                progress: p.legacy ? "legacy_unknown" : "pending",
                reward: "awaiting_confirmation",
              },
            ],
          };
        }
        if (row.source !== p.source || row.terms !== p.terms) fail("entitlement-conflict");
        const current = row.attempts[row.attempts.length - 1];
        if (token(current.binding) === token(p.binding)) return row;
        if (p.expected === null || token(current.binding) !== token(p.expected))
          fail("stale-binding");
        if (row.attempts.some((a) => a.progress === "confirmed")) fail("already-confirmed");
        if (row.attempts.some((a) => token(a.binding) === token(p.binding)))
          fail("obsolete-binding");
        row.attempts.push({
          binding: p.binding,
          progress: p.legacy ? "legacy_unknown" : "pending",
          reward: "awaiting_confirmation",
        });
        return row;
      });
    },
    /** Trusted adapter evidence only; never infer this from missing receipts or flush counters. */
    settle(key: string, binding: Binding, decision: SettlementDecision) {
      const b = structuredClone(binding),
        d = structuredClone(decision);
      validateSettlementDecision(b, d);
      return access(key, (row) => applySettlementDecision(row, b, d));
    },
  };
}
