import { getActiveOwner } from "@/lib/identity/owner";
import type { CampaignActivity } from "@/types/campaign";

/**
 * SOURCE OF TRUTH: Identity-partitioned localStorage.
 * Partitioned via `src/lib/identity/partition.ts`.
 */
const STORAGE_KEY = "irth.campaign.ordering.help.v2";

export interface OrderingHelpState {
  pinnedIds: string[];
  pending?: {
    itemId: string;
    txId: string;
    at: string;
  };
  fingerprint: string;
}

/** Stable fingerprint of the activity content to prevent cross-activity leakage or stale data. */
export function getOrderingFingerprint(activity: CampaignActivity): string {
  const parts = [
    activity.id,
    ...(activity.correctOrder ?? activity.options ?? []),
  ];
  return parts.join("|");
}

function getHelpStore(): Record<string, OrderingHelpState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return {};
}

function saveHelpStore(store: Record<string, OrderingHelpState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    // ignore
  }
}

export function getOrderingState(logicalKey: string, fingerprint: string): OrderingHelpState | null {
  const store = getHelpStore();
  const state = store[logicalKey];
  if (!state || state.fingerprint !== fingerprint) return null;
  return state;
}

export function clearOrderingHelp(logicalKey: string) {
  const store = getHelpStore();
  if (store[logicalKey]) {
    delete store[logicalKey];
    saveHelpStore(store);
  }
}

/**
 * ATOMIC HELP TRANSACTION (Intent-based)
 * 1. Select
 * 2. Persist Intent
 * 3. Pay
 * 4. Commit
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
  
  // Reset if fingerprint changed
  if (state && state.fingerprint !== fingerprint) {
    state = { pinnedIds: [], fingerprint };
  }
  
  if (!state) {
    state = { pinnedIds: [], fingerprint };
  }

  // Eligible = all items MINUS pinned MINUS currently correct
  const eligibleIds = currentOrder.filter(id => {
    const isPinned = state!.pinnedIds.includes(id);
    const isCorrect = correctIndexOf(id) === currentOrder.indexOf(id);
    return !isPinned && !isCorrect;
  });

  // Security: always leave at least one item for the player to solve
  const totalItems = currentOrder.length;
  if (eligibleIds.length === 0 || state.pinnedIds.length >= totalItems - 1) {
    return null;
  }

  // Random selection among eligible
  const selectedId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
  const txId = crypto.randomUUID();

  // 1. Persist Intent
  state.pending = {
    itemId: selectedId,
    txId,
    at: new Date().toISOString()
  };
  store[logicalKey] = state;
  saveHelpStore(store);

  // 2. Debit
  if (!helpers.pay(txId)) {
    // Transaction failed - cleanup intent immediately if possible (but recovery handles crash)
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
 * RECOVERY FLOW
 * Called on mount to handle crashes that happened between Debit and Commit.
 */
export function recoverPendingOrderingHelp(
  logicalKey: string,
  fingerprint: string,
  checkPaid: (txId: string) => boolean,
  onCommit: (itemId: string) => void
) {
  const store = getHelpStore();
  const state = store[logicalKey];
  if (!state || !state.pending || state.fingerprint !== fingerprint) return;

  const { itemId, txId } = state.pending;

  // We check if the payment went through
  if (checkPaid(txId)) {
    // Move to pinned and notify
    state.pinnedIds = [...new Set([...state.pinnedIds, itemId])];
    delete state.pending;
    saveHelpStore(store);
    onCommit(itemId);
  } else {
    // Payment didn't happen - just clear the intent
    delete state.pending;
    saveHelpStore(store);
  }
}
