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

import { useEffect, useSyncExternalStore } from "react";
import { fetchPendingBadges, type PendingBadges } from "@/lib/social";

const EMPTY: PendingBadges = { friend_requests: 0, notifications: 0, total: 0 };

let snapshot: PendingBadges = EMPTY;
let inflight: Promise<void> | null = null;
let booted = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export async function refreshPendingBadges(): Promise<PendingBadges> {
  if (inflight) { await inflight; return snapshot; }
  inflight = (async () => {
    try {
      const next = await fetchPendingBadges();
      snapshot = next;
      emit();
    } catch {
      // Keep previous snapshot on failure (offline / unauthenticated).
    } finally {
      inflight = null;
    }
  })();
  await inflight;
  return snapshot;
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
