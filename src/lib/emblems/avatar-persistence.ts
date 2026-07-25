// ============================================================
// Premium Emblem selection — durable write contract
// ------------------------------------------------------------
// Historical bug this file fixes:
//
//   Picking an emblem only mutated local profile state
//   (`setAvatar(id)`), and relied on a *debounced* `pushPublicStats`
//   / `pushSave` to eventually reach the server. If the app was
//   backgrounded, killed, or offline before that debounce fired,
//   the selection existed nowhere but this device's localStorage.
//   Worse, on the next sign-in `mergeCloudSave` spreads the (stale)
//   `cloud_saves` blob over local state — so the emblem visibly
//   reverted to the previously synced one.
//
// The contract now:
//
//   1. Local state is updated optimistically (instant UI).
//   2. The selection is enqueued to the DURABLE OUTBOX under a
//      stable idempotency key, so it survives process death and
//      airplane mode and is replayed on reconnect.
//   3. A best-effort immediate flush runs so the common (online)
//      case lands within one round-trip.
//   4. On hydration, `profiles.avatar_id` (server truth) wins over
//      the `cloud_saves` blob — UNLESS this device has an
//      un-flushed pending selection, in which case the local pick
//      wins and is re-pushed.
//
// Guests have no server row; steps 2–4 are no-ops and the local
// mirror alone is the source of truth.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

/** Local marker for a pick that has not been confirmed by the server yet. */
const PENDING_KEY = "irth.profile.avatar.pending.v1";

interface PendingAvatar {
  uid: string;
  avatarId: string;
  at: number;
}

function ls(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readPendingAvatar(uid: string | null | undefined): string | null {
  const store = ls();
  if (!store || !uid) return null;
  try {
    const raw = store.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingAvatar;
    return p && p.uid === uid && typeof p.avatarId === "string" ? p.avatarId : null;
  } catch {
    return null;
  }
}

function writePendingAvatar(uid: string, avatarId: string): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(PENDING_KEY, JSON.stringify({ uid, avatarId, at: Date.now() } as PendingAvatar));
  } catch {
    /* quota / private mode — the outbox is still the durable path */
  }
}

export function clearPendingAvatar(uid?: string | null): void {
  const store = ls();
  if (!store) return;
  try {
    if (uid && readPendingAvatar(uid) === null) return;
    store.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function currentUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Server-authoritative emblem for the signed-in user.
 * `profiles.avatar_id` is written by `sync_my_public_stats` and is the same
 * value every other player sees on the public profile / friends list, so it
 * is the correct tiebreaker against a stale `cloud_saves` snapshot.
 */
export async function fetchServerAvatarId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("get_my_profile" as never);
    if (error || !data) return null;
    const row = data as { avatar_id?: string | null };
    const id = row?.avatar_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Durably persist an emblem selection.
 *
 * Returns `"synced"` when the server confirmed within this call,
 * `"queued"` when it is safely in the outbox (offline / transient failure),
 * and `"local"` for guests.
 *
 * Never throws — emblem selection must never surface an error dialog.
 */
export async function persistAvatarSelection(
  avatarId: string,
): Promise<"synced" | "queued" | "local"> {
  const uid = await currentUid();
  if (!uid) return "local";

  // 1. Durable first: the queue entry outlives this process.
  writePendingAvatar(uid, avatarId);
  try {
    const { enqueueWithId } = await import("@/lib/offline/outbox");
    // Stable id → repeated picks collapse to a single pending write, and a
    // replay can never produce duplicate rows.
    await enqueueWithId(uid, `avatar_select:${uid}`, "avatar_select", { avatarId });
  } catch {
    /* enqueue failed (quota) — the direct attempt below is the fallback */
  }

  // 2. Best-effort immediate flush so the online case is instant.
  try {
    const { flushOutbox } = await import("@/lib/offline/flush");
    await flushOutbox(uid);
  } catch {
    /* ignore */
  }

  return readPendingAvatar(uid) === null ? "synced" : "queued";
}

/**
 * Resolve the emblem to display after cloud hydration.
 *
 * Priority: un-flushed local pick → server `profiles.avatar_id` → whatever
 * the merged cloud save produced. Called by the account hydration path.
 */
export async function reconcileAvatarOnHydrate(
  uid: string,
  mergedAvatarId: string | null | undefined,
): Promise<string | null> {
  const pending = readPendingAvatar(uid);
  if (pending) {
    // This device has a newer pick than anything the server knows about.
    // Re-drive the durable path instead of letting the server value win.
    void persistAvatarSelection(pending);
    return pending;
  }
  const server = await fetchServerAvatarId();
  return server ?? mergedAvatarId ?? null;
}
