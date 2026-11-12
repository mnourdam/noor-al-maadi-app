// ============================================================
// Global pending-badges store
// ------------------------------------------------------------
// Single source of truth for unread/pending counters that drive
// numeric pills across the app (community tab, friends CTA,
// future home nav, etc.). Backed by the SECURITY DEFINER RPC
// `my_pending_badges`, refreshed on `irth:friends:updated` and
// `irth:notifications:updated`. Subscribers receive the latest
// snapshot — no per-component refetching.
// ============================================================

import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "@/lib/identity/owner";
import { useEffect, useSyncExternalStore } from "react";
import { fetchPendingBadges, type PendingBadges } from "@/lib/social";

const EMPTY: PendingBadges = { friend_requests: 0, notifications: 0, total: 0 };

let snapshot: PendingBadges = EMPTY;
let inflight: Promise<void> | null = null;
let booted = false;
let identitySubscribed = false;
let scope: string | null = null;
const identityScope = () => JSON.stringify([getActiveOwner(), getIdentityEpoch()]);
function alignIdentity(): boolean {
  const next = identityScope();
  if (scope === next) return false;
  scope = next;
  snapshot = EMPTY;
  inflight = null;
  return true;
}
function observeIdentity() {
  if (identitySubscribed) return;
  identitySubscribed = true;
  // A preceding owner listener may already have aligned via the getter.
  // Always notify here, never from a render-time snapshot read.
  onOwnerChange(() => { alignIdentity(); emit(); });
}
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export async function refreshPendingBadges(): Promise<PendingBadges> {
  observeIdentity();
  alignIdentity();
  const startedScope = scope;
  const current = () => identityScope() === startedScope;
  if (inflight) { await inflight; return current() ? snapshot : EMPTY; }
  const work = (async () => {
    try {
      const next = await fetchPendingBadges();
      if (!current()) return;
      snapshot = next;
      emit();
    } catch {
      // Preserve this owner's previous snapshot on failure, never another owner's.
    }
  })();
  inflight = work;
  const clear = () => { if (inflight === work) inflight = null; };
  void work.then(clear, clear);
  await work;
  return current() ? snapshot : EMPTY;
}

function ensureBoot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  const onUpdate = () => { void refreshPendingBadges(); };
  window.addEventListener("irth:friends:updated", onUpdate);
  window.addEventListener("irth:notifications:updated", onUpdate);
  window.addEventListener("irth:auth:changed", onUpdate);
  void refreshPendingBadges();
}

export function getPendingBadgesSnapshot(): PendingBadges {
  alignIdentity();
  return snapshot;
}

function subscribe(cb: () => void): () => void {
  ensureBoot();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Reactive snapshot of all pending badge counters. */
export function usePendingBadges(): PendingBadges {
  useEffect(() => { ensureBoot(); }, []);
  return useSyncExternalStore(subscribe, getPendingBadgesSnapshot, () => EMPTY);
}

/** Reactive count for a single badge key (e.g. "friend_requests"). */
export function usePendingBadge(key: keyof PendingBadges | string): number {
  const all = usePendingBadges();
  const v = (all as Record<string, number>)[key];
  return Number.isFinite(v) ? Number(v) : 0;
}
