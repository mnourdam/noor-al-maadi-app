import { supabase } from "@/integrations/supabase/client";
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { enqueueWithId, peekAll, remove, type OutboxItem, type OutboxKind } from "./outbox";
import { archiveRejected, isPermanentReason } from "./dead-letter";

/** Evidence of one accepted local enqueue, not current queue membership or server authority. */
export interface DurableSaveReceipt {
  readonly owner: string;
  readonly operationId: string;
  readonly revision: string;
  readonly kind: OutboxKind;
  readonly payloadSnapshot: string;
}
const durableReceipts = new WeakMap<DurableSaveReceipt, { owner: string; epoch: number }>();
/** Dormant adapter boundary: copied/altered objects and retired invocations are rejected. */
export function readDurableSaveReceipt(receipt: DurableSaveReceipt): DurableSaveReceipt {
  const scope = durableReceipts.get(receipt);
  if (!scope || getActiveOwner() !== scope.owner || getIdentityEpoch() !== scope.epoch)
    throw new Error("save-receipt:invalid-or-retired");
  return receipt;
}
async function acceptedReceipt(item: OutboxItem, epoch: number): Promise<DurableSaveReceipt | undefined> {
  const owner = `user:${item.userId}`;
  if (!item.revision || getActiveOwner() !== owner || getIdentityEpoch() !== epoch) return undefined;
  let rows: OutboxItem[];
  try { rows = await saveDeadline(peekAll(item.userId)); } catch { return undefined; }
  if (getActiveOwner() !== owner || getIdentityEpoch() !== epoch ||
      !rows.some(row => row.id === item.id && JSON.stringify(row) === JSON.stringify(item))) return undefined;
  const receipt = Object.freeze({ owner, operationId: item.id, revision: item.revision,
    kind: item.kind, payloadSnapshot: JSON.stringify(item.payload) });
  durableReceipts.set(receipt, { owner, epoch });
  return receipt;
}

export interface SaveOutcome<T = Record<string, unknown>> {
  durableReceipt?: DurableSaveReceipt;
  acknowledged: boolean;
  queued: boolean;
  dequeued?: boolean;
  /** Deadline elapsed without a confirmed storage result; not proof of loss. */
  storageState?: "unresolved";
  reason?: string;
  result?: T;
}
export function saveAccepted(outcome: SaveOutcome<any>): boolean {
  return (
    outcome.acknowledged || (outcome.queued && (!outcome.reason || outcome.reason === "queued"))
  );
}
export const SAVE_TIMEOUT_MS = 8000;

export async function saveDeadline<T>(operation: PromiseLike<T>, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { onTimeout?.(); reject(new Error("save-timeout")); }, SAVE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function saveUserId(strict = false): Promise<string | null> {
  const epoch = getIdentityEpoch();
  try {
    const { data, error } = await saveDeadline(supabase.auth.getSession());
    if (error) throw error;
    if (getIdentityEpoch() !== epoch) throw new Error("identity_changed");
    return data.session?.user?.id ?? null;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

// Keep the raw persistence lifetime separate from the finite UI deadline.
// A timed-out write stays fenced until cancellation/commit has actually settled.
const pendingWrites = new Map<string, Promise<OutboxItem>>();
const inflight = new Map<string, Promise<SaveOutcome<any>>>();
const receiptRequests = new Map<string, { requested: boolean }>();
const ordinaryViews = new WeakMap<Promise<SaveOutcome<any>>, Promise<SaveOutcome<any>>>();
/** Small caller adapter: receipt-bound ack, finite waits, and owner fencing. */
export function saveGameplay<T extends { ok?: boolean; reason?: string }>(p: {
  userId: string;
  /** Dormant receipt seam; default callers retain their exact result shape. */
  captureDurableReceipt?: boolean;
  id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  rpc: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}): Promise<SaveOutcome<T>> {
  const wantsReceipt = p.captureDurableReceipt === true;
  const view = (work: Promise<SaveOutcome<T>>): Promise<SaveOutcome<T>> => {
    if (wantsReceipt) return work;
    const existingView = ordinaryViews.get(work);
    if (existingView) return existingView;
    const ordinaryView = work.then(outcome => {
      if (!outcome.durableReceipt) return outcome;
      const { durableReceipt: _receipt, ...ordinary } = outcome;
      return ordinary;
    });
    ordinaryViews.set(work, ordinaryView);
    return ordinaryView;
  };
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(JSON.stringify(p.payload));
  } catch {
    return Promise.resolve({ acknowledged: false, queued: false, reason: "storage_error" });
  }
  const epoch = getIdentityEpoch();
  const key = JSON.stringify([epoch, p.userId, p.id, p.kind, payload]);
  const existing = inflight.get(key);
  if (existing) {
    if (wantsReceipt) { const request = receiptRequests.get(key); if (request) request.requested = true; }
    return view(existing);
  }
  const writeKey = JSON.stringify([epoch, p.userId, p.id]);
  if (pendingWrites.has(writeKey)) return Promise.resolve({
    acknowledged: false, queued: false, reason: "storage_pending", storageState: "unresolved",
  });
  const receiptRequest = { requested: wantsReceipt };
  receiptRequests.set(key, receiptRequest);
  const promise = run().finally(() => {
    if (inflight.get(key) === promise) { inflight.delete(key); receiptRequests.delete(key); }
  });
  inflight.set(key, promise);
  return view(promise);

  async function run(): Promise<SaveOutcome<T>> {
    let receipt: OutboxItem | undefined;
    const cancellation = new AbortController();
    const writing = enqueueWithId(p.userId, p.id, p.kind, payload, { signal: cancellation.signal });
    pendingWrites.set(writeKey, writing);
    const release = () => { if (pendingWrites.get(writeKey) === writing) pendingWrites.delete(writeKey); };
    void writing.then(release, release);
    try {
      receipt = await saveDeadline(writing, () => cancellation.abort());
    } catch (error) {
      // An obsolete intent must never reach RPC after a CAS/cancellation failure.
      // Generic storage failures retain the existing live-ack path.
      let cause: unknown = error;
      while (cause instanceof Error) {
        if (cause.message === "save-timeout") return {
          acknowledged: false, queued: false, reason: "storage_pending", storageState: "unresolved",
        };
        if (["outbox-stale-enqueue", "outbox-enqueue-cancelled", "outbox-revision-conflict", "outbox-fallback-changed-during-recovery"].includes(cause.message)) {
          return { acknowledged: false, queued: false, reason: "storage_conflict" };
        }
        cause = cause.cause;
      }
    }
    const durableReceipt = receipt && receiptRequest.requested ? await acceptedReceipt(receipt, epoch) : undefined;
    const receiptFields = durableReceipt ? { durableReceipt } : {};
    const pending = (): SaveOutcome<T> => ({
      ...receiptFields,
      acknowledged: false,
      queued: Boolean(receipt),
      reason: receipt ? "queued" : "storage_error",
    });
    const ownerMatches = async () =>
      getIdentityEpoch() === epoch &&
      (await saveUserId()) === p.userId &&
      getIdentityEpoch() === epoch;
    if (!(await ownerMatches())) return { ...pending(), reason: "identity_changed" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return pending();
    try {
      const { data, error } = await saveDeadline(p.rpc());
      if (!(await ownerMatches())) return { ...pending(), reason: "identity_changed" };
      if (error && !isPermanentReason(error.message)) return pending();
      const result = (error ? { ok: false, reason: error.message } : (data ?? {})) as T;
      if (result.ok !== true) {
        let queued = Boolean(receipt);
        if (receipt && isPermanentReason(result.reason)) {
          try {
            queued = !(await saveDeadline(archiveRejected(receipt, result.reason!)));
          } catch {
            /* Keep pending unless archive and dequeue both confirmed. */
          }
        }
        return { ...receiptFields, acknowledged: false, queued, reason: result.reason ?? "rpc-not-ok" };
      }
      let dequeued = false;
      if (receipt) {
        try {
          dequeued = await saveDeadline(remove(receipt.id, receipt));
        } catch {
          /* RPC acknowledged this snapshot, not its newer replacement. */
        }
      }
      // Recheck after storage awaits before exposing account-owned rewards.
      if (!(await ownerMatches())) return { ...pending(), reason: "identity_changed" };
      return { ...receiptFields, acknowledged: true, queued: Boolean(receipt) && !dequeued, dequeued, result };
    } catch {
      return pending();
    }
  }
}
