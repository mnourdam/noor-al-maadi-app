import { getActiveOwner } from "@/lib/identity/owner";
import type { CampaignActivity } from "@/types/campaign";

/**
 * SOURCE OF TRUTH: Identity-partitioned localStorage.
 */
const STORAGE_KEY = "irth.campaign.ordering.help.v3";

export interface OrderingHelpState {
  pinnedIds: string[];
  pending?: {
    itemId: string;
    txId: string;
    at: string;
    /**
     * V16: set (and persisted) the moment the debit is confirmed, BEFORE the
     * pin is committed. Recovery only restores a pin when this marker exists,
     * so a crash before payment can never grant a free hint and a crash after
     * payment never loses a paid hint. Legacy entries without it are unpaid.
     */
    paidAt?: string;
  };
  fingerprint: string;
}


interface Store {
  [logicalKey: string]: OrderingHelpState;
}

/** Stable fingerprint of the activity content to prevent cross-activity leakage or stale data. */
export function getOrderingFingerprint(activity: CampaignActivity): string {
  const parts = [
    activity.id,
    ...(activity.correctOrder ?? activity.options ?? []),
  ];
  return parts.join("|");
}

function getHelpStore(): Store {
  const owner = getActiveOwner();
  if (!owner || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${owner}:${STORAGE_KEY}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHelpStore(store: Store) {
  const owner = getActiveOwner();
  if (!owner || typeof window === "undefined") return;
  window.localStorage.setItem(`${owner}:${STORAGE_KEY}`, JSON.stringify(store));
}

export function getOrderingState(logicalKey: string, fingerprint: string): OrderingHelpState | null {
  const store = getHelpStore();
  const state = store[logicalKey];
  if (state && state.fingerprint === fingerprint) return state;
  return null;
}

export function clearOrderingHelp(logicalKey: string) {
  const store = getHelpStore();
  delete store[logicalKey];
  saveHelpStore(store);
}

/**
 * ATOMIC HELP TRANSACTION (Intent-based)
 */
export function purchaseOrderingHelp(
  logicalKey: string,
  fingerprint: string,
  currentOrder: string[],
  correctIndexOf: (id: string) => number,
  helpers: { pay: (txId: string) => boolean }
): { itemId: string } | null {
  const store = getHelpStore();
  let state = store[logicalKey];

  if (!state || state.fingerprint !== fingerprint) {
    state = { pinnedIds: [], fingerprint };
  }

  // Eligible = all items MINUS previously help-revealed ones.
  // V17-01: eligibility MUST NOT consider whether an item currently sits in its
  // correct slot — that made hint availability leak live answer correctness.
  const eligibleIds = currentOrder.filter(id => !state!.pinnedIds.includes(id));


  // Security: always leave at least one item for the player to solve manually
  const totalItems = currentOrder.length;
  if (eligibleIds.length === 0 || state.pinnedIds.length >= totalItems - 1) {
    return null;
  }

  // Random selection among eligible items (without replacement, because pinnedIds is persistent)
  const selectedId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
  const txId = crypto.randomUUID();

  // 1. Persist Intent (Atomic start)
  state.pending = { itemId: selectedId, txId, at: new Date().toISOString() };
  store[logicalKey] = state;
  saveHelpStore(store);

  // 2. Debit
  if (!helpers.pay(txId)) {
    delete state.pending;
    saveHelpStore(store);
    return null;
  }

  // 2b. Persist the PAID marker before committing, so a crash in the window
  //     between debit and commit is recoverable — and only then.
  state.pending = { ...state.pending, paidAt: new Date().toISOString() };
  store[logicalKey] = state;
  saveHelpStore(store);

  // 3. Commit
  state.pinnedIds = [...state.pinnedIds, selectedId];
  delete state.pending;
  store[logicalKey] = state;
  saveHelpStore(store);

  return { itemId: selectedId };
}

/**
 * Recovery flow for crashes between debit and commit.
 *
 * V16 semantics (no backend dependency):
 * - pending WITH `paidAt`  → the debit was confirmed → recover exactly one pin.
 * - pending WITHOUT `paidAt` → payment was never confirmed → drop it, no free pin.
 * Already-committed pins are deduped, so recovery can never duplicate a hint.
 */
export function recoverPendingOrderingHelp(
  logicalKey: string,
  fingerprint: string,
  onRecovered: (itemId: string) => void,
) {
  const store = getHelpStore();
  const state = store[logicalKey];
  if (!state || state.fingerprint !== fingerprint || !state.pending) return;

  const { itemId, paidAt } = state.pending;
  delete state.pending;

  if (!paidAt) {
    // Unpaid / unknown (includes legacy entries): discard, grant nothing.
    store[logicalKey] = state;
    saveHelpStore(store);
    return;
  }

  const already = state.pinnedIds.includes(itemId);
  state.pinnedIds = [...new Set([...state.pinnedIds, itemId])];
  store[logicalKey] = state;
  saveHelpStore(store);
  if (!already) onRecovered(itemId);
}

