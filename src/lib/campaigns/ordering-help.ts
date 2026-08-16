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
    const raw = window.localStorage.getItem(`${owner.id}:${STORAGE_KEY}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHelpStore(store: Store) {
  const owner = getActiveOwner();
  if (!owner || typeof window === "undefined") return;
  window.localStorage.setItem(`${owner.id}:${STORAGE_KEY}`, JSON.stringify(store));
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

  // Eligible = all items MINUS previously help-revealed MINUS currently correct items
  const eligibleIds = currentOrder.filter(id => {
    const isAlreadyPinned = state!.pinnedIds.includes(id);
    const isCurrentlyCorrect = correctIndexOf(id) === currentOrder.indexOf(id);
    return !isAlreadyPinned && !isCurrentlyCorrect;
  });

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

  // 3. Commit
  state.pinnedIds = [...state.pinnedIds, selectedId];
  delete state.pending;
  store[logicalKey] = state;
  saveHelpStore(store);

  return { itemId: selectedId };
}

/**
 * Recovery flow for crashes between debit and commit.
 */
export function recoverPendingOrderingHelp(
  logicalKey: string,
  fingerprint: string,
  isPaid: (txId: string) => boolean,
  onRecovered: (itemId: string) => void
) {
  const store = getHelpStore();
  const state = store[logicalKey];
  if (!state || state.fingerprint !== fingerprint || !state.pending) return;

  if (isPaid(state.pending.txId)) {
    const itemId = state.pending.itemId;
    state.pinnedIds = [...new Set([...state.pinnedIds, itemId])];
    delete state.pending;
    store[logicalKey] = state;
    saveHelpStore(store);
    onRecovered(itemId);
  }
}
