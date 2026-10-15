import { supabase } from "@/integrations/supabase/client";
import { getIdentityEpoch } from "@/lib/identity/owner";
import { enqueueWithId, remove, type OutboxItem, type OutboxKind } from "./outbox";
import { archiveRejected, isPermanentReason } from "./dead-letter";

export interface SaveOutcome<T = Record<string, unknown>> {
  acknowledged: boolean;
  queued: boolean;
  dequeued?: boolean;
  reason?: string;
  result?: T;
}
export function saveAccepted(outcome: SaveOutcome<any>): boolean {
  return (
    outcome.acknowledged || (outcome.queued && (!outcome.reason || outcome.reason === "queued"))
  );
}
export const SAVE_TIMEOUT_MS = 8000;

export async function saveDeadline<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("save-timeout")), SAVE_TIMEOUT_MS);
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

const inflight = new Map<string, Promise<SaveOutcome<any>>>();
/** Small caller adapter: receipt-bound ack, finite waits, and owner fencing. */
export function saveGameplay<T extends { ok?: boolean; reason?: string }>(p: {
  userId: string;
  id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  rpc: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}): Promise<SaveOutcome<T>> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(JSON.stringify(p.payload));
  } catch {
    return Promise.resolve({ acknowledged: false, queued: false, reason: "storage_error" });
  }
  const epoch = getIdentityEpoch();
  const key = JSON.stringify([epoch, p.userId, p.id, p.kind, payload]);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;

  async function run(): Promise<SaveOutcome<T>> {
    let receipt: OutboxItem | undefined;
    try {
      receipt = await saveDeadline(enqueueWithId(p.userId, p.id, p.kind, payload));
    } catch {
      /* A live acknowledgement may still prove persistence. */
    }
    const pending = (): SaveOutcome<T> => ({
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
        return { acknowledged: false, queued, reason: result.reason ?? "rpc-not-ok" };
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
      return { acknowledged: true, queued: Boolean(receipt) && !dequeued, dequeued, result };
    } catch {
      return pending();
    }
  }
}
