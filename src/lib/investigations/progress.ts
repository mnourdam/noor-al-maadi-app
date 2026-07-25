// ============================================================
// Canonical Investigation Progress (Phase G)
// ------------------------------------------------------------
// Server-authoritative completion + reward grant for investigations.
// Keyed by the immutable investigation UUID — never by slug.
//
// Design:
//   • recordInvestigationCompletion(row, score) enqueues one durable
//     outbox item with a STABLE id derived from
//     (userId, investigationId). Replays are no-ops on both client
//     (outbox `put` upsert) and server (complete_investigation_v2
//     ON CONFLICT + applied_profile_deltas idempotency).
//   • useInvestigationProgress() reads the server rows for the current
//     user and exposes a UUID set + a matcher that also accepts slugs
//     (so legacy call sites keep working while we migrate).
//   • Legacy migration: for every entry in
//     `profile.investigationsCompleted` that has not yet been backfilled
//     for the current user, enqueue an `investigation_backfill` item.
//     Fully idempotent, resumable, offline-safe.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InvestigationRow } from "@/lib/investigations-source";
import { enqueueWithId } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";

// ------------------------------------------------------------
// Stable idempotency keys
// ------------------------------------------------------------
// Deterministic UUID v5-ish stable key. We do not need a real UUIDv5 —
// the outbox accepts any stable string and the server uses it as the
// idempotency key inside applied_profile_deltas.delta_id (which is a
// UUID column). Hash → uuid formatted string so the DB accepts it.
async function stableDeltaId(userId: string, investigationId: string): Promise<string> {
  const input = `irth.inv.complete.v1:${userId}:${investigationId}`;
  try {
    if (typeof crypto !== "undefined" && "subtle" in crypto) {
      const enc = new TextEncoder().encode(input);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      const b = Array.from(new Uint8Array(buf)).map((n) => n.toString(16).padStart(2, "0")).join("");
      // Format as a UUID v4-ish string using the first 32 hex chars.
      return `${b.slice(0, 8)}-${b.slice(8, 12)}-4${b.slice(13, 16)}-8${b.slice(17, 20)}-${b.slice(20, 32)}`;
    }
  } catch { /* fall through */ }
  // Fallback — deterministic without crypto.subtle. Not cryptographic,
  // but the outbox `put` upsert already dedupes by this id client-side
  // and the server dedupes by the applied_profile_deltas unique key.
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
}

// ------------------------------------------------------------
// Public API — enqueue a completion.
// ------------------------------------------------------------
export interface InvestigationCompletionInput {
  investigationId: string; // MUST be the UUID
  investigationSlug?: string;
  score?: number;
  correctCount?: number;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

export interface InvestigationCompletionOutcome {
  /** true when the server acknowledged the completion in this call. */
  acknowledged: boolean;
  /** true when this call (or a previous one) granted the reward. */
  applied: boolean;
  xpEarned: number;
  dinarsEarned: number;
  heartsEarned: number;
  /** Queued for later flush (offline / signed-out / transient failure). */
  queued: boolean;
}

/**
 * Record a server-authoritative investigation completion.
 *
 * Durable write contract: the outbox item is enqueued FIRST (so a crash
 * or offline state can never lose the completion), then the RPC is
 * AWAITED while online. Awaiting matters because the reward lands on
 * `profiles.xp/dinars` server-side — callers must not mirror any local
 * economy totals until this resolves, otherwise a concurrent read of
 * the profile row (e.g. the streak RPC) returns pre-grant balances and
 * overwrites the freshly granted XP/Dinars locally.
 *
 * Safe to call more than once — the outbox and the RPC both dedupe.
 * Signed-out users are a no-op.
 */
export async function recordInvestigationCompletion(
  input: InvestigationCompletionInput,
): Promise<InvestigationCompletionOutcome> {
  const none: InvestigationCompletionOutcome = {
    acknowledged: false, applied: false,
    xpEarned: 0, dinarsEarned: 0, heartsEarned: 0, queued: false,
  };
  const uid = await currentUserId();
  if (!uid) return none;
  const investigationId = input.investigationId;
  if (!investigationId) return none;
  const deltaId = await stableDeltaId(uid, investigationId);
  await enqueueWithId(uid, deltaId, "investigation_complete", {
    investigationId,
    score: Math.max(0, input.score ?? 0),
    correctCount: Math.max(0, input.correctCount ?? 0),
  });

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) return { ...none, queued: true };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("complete_investigation_v2", {
      p_investigation_id: investigationId,
      p_delta_id: deltaId,
      p_score: Math.max(0, input.score ?? 0),
      p_correct_count: Math.max(0, input.correctCount ?? 0),
    });
    if (error) {
      console.warn("[investigation-complete] rpc-error", error.message);
      void flushOutbox(uid);
      return { ...none, queued: true };
    }
    const payload = (data ?? {}) as {
      ok?: boolean; reason?: string; applied?: boolean;
      xp_earned?: number; dinars_earned?: number; hearts_earned?: number;
      reward_granted?: boolean;
    };
    if (payload.ok !== true) {
      if (payload.reason === "investigation_not_found") {
        // Permanent refusal — drop the queued copy so it can't jam the queue.
        try {
          const { remove } = await import("@/lib/offline/outbox");
          await remove(deltaId);
        } catch { /* flush will drop it */ }
        return none;
      }
      void flushOutbox(uid);
      return { ...none, queued: true };
    }
    // Acknowledged — drop the queued copy, then notify readers.
    try {
      const { remove } = await import("@/lib/offline/outbox");
      await remove(deltaId);
    } catch { /* flush will drop it */ }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("irth:investigation-progress:changed"));
      }
    } catch { /* ignore */ }
    void flushOutbox(uid);
    return {
      acknowledged: true,
      applied: !!payload.applied || !!payload.reward_granted,
      xpEarned: Number(payload.xp_earned ?? 0),
      dinarsEarned: Number(payload.dinars_earned ?? 0),
      heartsEarned: Number(payload.hearts_earned ?? 0),
      queued: false,
    };
  } catch (e) {
    console.warn("[investigation-complete] rpc-exception", e);
    void flushOutbox(uid);
    return { ...none, queued: true };
  }


// ------------------------------------------------------------
// Legacy migration
// ------------------------------------------------------------
// A per-uid ledger of legacy keys we have already enqueued a backfill
// for. Prevents re-queueing on every render. Cleared on sign-out.
const BACKFILL_LEDGER_PREFIX = "irth.inv.backfilled.v1:";

function ledgerKey(uid: string): string { return `${BACKFILL_LEDGER_PREFIX}${uid}`; }

function readLedger(uid: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ledgerKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : []);
  } catch { return new Set(); }
}
function writeLedger(uid: string, set: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(ledgerKey(uid), JSON.stringify([...set])); } catch { /* quota */ }
}

/**
 * Batched, idempotent legacy backfill.
 *
 * Enqueues ONE outbox item carrying every not-yet-migrated legacy key for
 * the current user. The outbox id is deterministic in the set of pending
 * keys, so re-running with the same input (offline, then online, then a
 * second app open) collapses onto the same durable row and never re-grants.
 * The server RPC (`backfill_investigation_completions`) grants zero XP,
 * dinars, or hearts — completion is recorded with `legacy_key` set.
 *
 * A per-uid localStorage ledger of already-queued keys is kept purely as
 * a client-side optimisation to avoid re-enqueuing on every render. The
 * durable safety net is the server RPC + outbox stable-id, not the ledger.
 *
 * ---------------- Guest → Sign-in migration policy ----------------
 * Guest completions live only in `profile.investigationsCompleted`
 * (device-local). When a guest signs in, this function is invoked by
 * `<InvestigationLegacyBackfill />` and treats those local keys as
 * legacy keys of the newly-signed-in account. Contract:
 *
 *   • migrate exactly once — per-uid ledger + deterministic outbox id
 *     make repeated calls collapse onto the same durable row.
 *   • never duplicate — server RPC uses
 *     `ON CONFLICT (user_id, investigation_id) DO NOTHING`.
 *   • never replay rewards — RPC grants 0 XP, 0 dinars, 0 hearts and
 *     stamps `legacy_key` on the inserted row.
 *   • never migrate again after successful migration — the ledger
 *     records every enqueued key; the outbox item itself is stable-id
 *     upserted; and the server row is unique per (user_id,
 *     investigation_id).
 *   • preserve guest data after sign-out — this function does NOT
 *     mutate `profile.investigationsCompleted`. The device-local array
 *     stays intact so signing out restores the guest view. The account
 *     side keeps `user_investigation_progress` as its authoritative
 *     source.
 *   • account progress is always authoritative — the canonical service
 *     reads server rows first, then pending outbox items, then legacy;
 *     server rows always win.
 *
 * Safe when signed-out (no-op), safe offline (queued and flushed on
 * reconnect), safe for signed-in users with an empty legacy array.
 */
export async function migrateLegacyInvestigationCompletions(
  legacyKeys: string[],
): Promise<void> {
  const uid = await currentUserId();
  if (!uid || !legacyKeys?.length) return;
  const ledger = readLedger(uid);
  const pending: string[] = [];
  for (const raw of legacyKeys) {
    if (typeof raw !== "string" || !raw) continue;
    if (ledger.has(raw)) continue;
    pending.push(raw);
  }
  if (pending.length === 0) return;
  // Stable batch id — hash of the sorted pending set. Repeated calls with
  // the same pending set collapse onto the same outbox row.
  const sorted = [...pending].sort().join("|");
  const batchId = await stableDeltaId(uid, `backfill_batch:${sorted}`);
  await enqueueWithId(uid, batchId, "investigation_backfill_batch", {
    legacyKeys: pending,
  });
  for (const k of pending) ledger.add(k);
  writeLedger(uid, ledger);
  void flushOutbox(uid);
}


// ------------------------------------------------------------
// Read side — server progress hook.
// ------------------------------------------------------------
export interface ServerInvestigationProgress {
  investigation_id: string;
  status: "unlocked" | "completed";
  completed_at: string | null;
  xp_earned: number;
  dinars_earned: number;
  hearts_earned: number;
  score: number;
}

interface ProgressState {
  uid: string | null;
  ready: boolean;
  byId: Map<string, ServerInvestigationProgress>;
  completedIds: Set<string>;
}

const EMPTY_STATE: ProgressState = {
  uid: null,
  ready: false,
  byId: new Map(),
  completedIds: new Set(),
};

async function fetchProgress(uid: string): Promise<ProgressState> {
  const { data, error } = await supabase
    .from("user_investigation_progress" as any)
    .select("investigation_id,status,completed_at,xp_earned,dinars_earned,hearts_earned,score")
    .eq("user_id", uid);
  if (error || !Array.isArray(data)) {
    return { uid, ready: true, byId: new Map(), completedIds: new Set() };
  }
  const byId = new Map<string, ServerInvestigationProgress>();
  const completed = new Set<string>();
  for (const row of data as any[]) {
    const r: ServerInvestigationProgress = {
      investigation_id: String(row.investigation_id),
      status: row.status,
      completed_at: row.completed_at,
      xp_earned: Number(row.xp_earned ?? 0),
      dinars_earned: Number(row.dinars_earned ?? 0),
      hearts_earned: Number(row.hearts_earned ?? 0),
      score: Number(row.score ?? 0),
    };
    byId.set(r.investigation_id, r);
    if (r.status === "completed") completed.add(r.investigation_id);
  }
  return { uid, ready: true, byId, completedIds: completed };
}

// ------------------------------------------------------------
// Shared session uid (module-level cache + single auth subscription).
// ------------------------------------------------------------
// Multiple canonical-progress consumers must share ONE auth listener and
// ONE uid state, otherwise React Query's queryKey would flap per mount
// and we'd lose the shared-cache guarantee. A module-level pub/sub
// gives every hook consumer the same uid reference.
type UidListener = (uid: string | null) => void;
let currentAuthUid: string | null | undefined = undefined; // undefined = not-yet-resolved
const uidListeners = new Set<UidListener>();
let uidSubscriptionStarted = false;

function startUidSubscription(): void {
  if (uidSubscriptionStarted) return;
  uidSubscriptionStarted = true;
  supabase.auth.getSession().then(({ data }) => {
    const next = data.session?.user?.id ?? null;
    currentAuthUid = next;
    uidListeners.forEach((l) => l(next));
  }).catch(() => {
    currentAuthUid = null;
    uidListeners.forEach((l) => l(null));
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    const next = session?.user?.id ?? null;
    currentAuthUid = next;
    uidListeners.forEach((l) => l(next));
  });
}

function useAuthUid(): string | null {
  const [uid, setUid] = useState<string | null>(
    currentAuthUid === undefined ? null : currentAuthUid,
  );
  useEffect(() => {
    startUidSubscription();
    const listener: UidListener = (next) => setUid(next);
    uidListeners.add(listener);
    // If resolution already happened before this effect ran, sync now.
    if (currentAuthUid !== undefined && currentAuthUid !== uid) {
      setUid(currentAuthUid);
    }
    return () => { uidListeners.delete(listener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return uid;
}

// ------------------------------------------------------------
// Shared TanStack Query — one server read per uid regardless of
// how many canonical-progress consumers mount.
// ------------------------------------------------------------
// Query key contract:
//   ["investigation-progress", uid]  — signed-in
//   ["investigation-progress", null] — guest (never fetched, disabled)
//
// Race protection:
//   • queryKey encodes uid; a stale account-A response resolves into
//     the ["investigation-progress", A] slot and can NEVER overwrite
//     ["investigation-progress", B]. React Query gc collects unused
//     slots.
//   • fetchProgress() itself performs no cross-mount writes, so there
//     is no shared mutable state that can leak between accounts.
//
// Invalidation: outbox events (irth:outbox:flushed and the canonical
// irth:investigation-progress:changed) trigger a single
// invalidateQueries call which every subscribed consumer sees.
const INVESTIGATION_PROGRESS_QUERY_KEY = "investigation-progress" as const;

const EMPTY_READY_STATE: ProgressState = {
  uid: null,
  ready: true,
  byId: new Map(),
  completedIds: new Set(),
};

export function useInvestigationProgress(): ProgressState {
  const uid = useAuthUid();
  const queryClient = useQueryClient();

  const { data, isSuccess } = useQuery<ProgressState>({
    queryKey: [INVESTIGATION_PROGRESS_QUERY_KEY, uid],
    // fetchProgress() is only ever invoked when enabled → uid is a string.
    queryFn: () => fetchProgress(uid as string),
    enabled: !!uid,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    // Do NOT refetch on window focus for this — outbox events already
    // invalidate the cache authoritatively.
    refetchOnWindowFocus: false,
  });

  // One invalidation listener per hook instance is fine; React Query
  // dedupes the invalidate calls and only re-runs the query once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: [INVESTIGATION_PROGRESS_QUERY_KEY] });
    };
    window.addEventListener("irth:investigation-progress:changed", invalidate as EventListener);
    window.addEventListener("irth:outbox:flushed", invalidate as EventListener);
    return () => {
      window.removeEventListener("irth:investigation-progress:changed", invalidate as EventListener);
      window.removeEventListener("irth:outbox:flushed", invalidate as EventListener);
    };
  }, [queryClient]);

  // Guest: no query is ever fired.
  if (!uid) return EMPTY_READY_STATE;

  // Signed-in but first fetch not yet resolved — surface not-ready so
  // canonical service knows to fall back to legacy while loading.
  if (!isSuccess || !data) {
    return { uid, ready: false, byId: new Map(), completedIds: new Set() };
  }

  return data;
}

/**
 * Legacy-tolerant matcher. Accepts either a UUID or a slug, and
 * returns true when the current user has a completion row for the
 * corresponding investigation.
 */
export function makeInvestigationCompletionMatcher(
  server: ProgressState,
  slugToId: Map<string, string>,
): (idOrSlug: string) => boolean {
  return (raw: string) => {
    if (!raw) return false;
    if (server.completedIds.has(raw)) return true;
    const mapped = slugToId.get(raw);
    if (mapped && server.completedIds.has(mapped)) return true;
    return false;
  };
}

// ============================================================
// Canonical Investigation Progress (Phase G1)
// ------------------------------------------------------------
// The ONE progress hook every consumer (Worlds, Home hero,
// Achievements, Statistics, investigation player, list page,
// museum stats) MUST read from.
//
// Signed-in truth source:
//   1. server rows in `user_investigation_progress`
//   2. + pending offline outbox items (`investigation_complete`
//      and `investigation_backfill_batch`) so an offline
//      completion counts immediately
//   3. + the legacy `profile.investigationsCompleted` array,
//      resolved via the local snapshot slug↔id map (final
//      safety net until the batched backfill lands)
//
// Guest truth source:
//   • the legacy `profile.investigationsCompleted` array only,
//     resolved via slug↔id.  No server writes for guests.
//
// The hook returns:
//   • completedIds     — canonical UUID set
//   • completedSlugs   — canonical slug set (same completions)
//   • completedKeys    — union of both — cheap `.has(rawKey)`
//                        matcher for legacy call sites
//   • count            — the ONE number all counters must use
//   • ready            — false during initial hydration
//   • source           — 'server' when the uid is present,
//                        'local' for guests
// ============================================================

import { useProfile } from "@/lib/profile";
import { ensureLocalSnapshotLoaded, localInvestigations } from "@/lib/local-first-store";
import { peekAll } from "@/lib/offline/outbox";

export interface CanonicalInvestigationProgress {
  ready: boolean;
  source: "server" | "local";
  uid: string | null;
  completedIds: Set<string>;
  completedSlugs: Set<string>;
  completedKeys: Set<string>;
  count: number;
  matches: (idOrSlug: string) => boolean;
}

interface InvIdSlugMaps {
  idToSlug: Map<string, string>;
  slugToId: Map<string, string>;
}

function useInvestigationIdSlugMaps(): InvIdSlugMaps {
  const [maps, setMaps] = useState<InvIdSlugMaps>({ idToSlug: new Map(), slugToId: new Map() });
  useEffect(() => {
    let alive = true;
    ensureLocalSnapshotLoaded().then(() => {
      if (!alive) return;
      const invs = localInvestigations() as Array<{ id?: string; slug?: string }>;
      const idToSlug = new Map<string, string>();
      const slugToId = new Map<string, string>();
      for (const inv of invs) {
        if (inv?.id && inv?.slug) {
          idToSlug.set(String(inv.id), String(inv.slug));
          slugToId.set(String(inv.slug), String(inv.id));
        }
      }
      setMaps({ idToSlug, slugToId });
    });
    return () => { alive = false; };
  }, []);
  return maps;
}

/**
 * Pending outbox contributions — used only to keep the canonical set
 * consistent with what has already been queued locally. Read on flush /
 * outbox-change events.
 */
function usePendingCompletionInvestigationIds(uid: string | null): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!uid) { setIds(new Set()); return; }
    let alive = true;
    const reload = async () => {
      try {
        const items = await peekAll(uid);
        const next = new Set<string>();
        for (const it of items) {
          if (it.kind === "investigation_complete") {
            const invId = (it.payload as { investigationId?: string })?.investigationId;
            if (invId) next.add(String(invId));
          }
        }
        if (alive) setIds(next);
      } catch { /* ignore */ }
    };
    void reload();
    const onChange = () => { void reload(); };
    if (typeof window !== "undefined") {
      window.addEventListener("irth:outbox:changed", onChange as EventListener);
      window.addEventListener("irth:outbox:flushed", onChange as EventListener);
    }
    return () => {
      alive = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("irth:outbox:changed", onChange as EventListener);
        window.removeEventListener("irth:outbox:flushed", onChange as EventListener);
      }
    };
  }, [uid]);
  return ids;
}

const EMPTY_CANONICAL: CanonicalInvestigationProgress = {
  ready: false,
  source: "local",
  uid: null,
  completedIds: new Set(),
  completedSlugs: new Set(),
  completedKeys: new Set(),
  count: 0,
  matches: () => false,
};

export function useCanonicalInvestigationProgress(): CanonicalInvestigationProgress {
  const server = useInvestigationProgress();
  const pending = usePendingCompletionInvestigationIds(server.uid);
  const { profile } = useProfile();
  const { idToSlug, slugToId } = useInvestigationIdSlugMaps();

  return useMemo(() => {
    const isSignedIn = !!server.uid;
    const ready = isSignedIn ? (server.ready && (idToSlug.size > 0 || slugToId.size > 0 || true)) : true;

    const ids = new Set<string>();
    const slugs = new Set<string>();

    // 1. server completions (signed-in truth).
    if (isSignedIn) {
      for (const id of server.completedIds) {
        ids.add(id);
        const s = idToSlug.get(id);
        if (s) slugs.add(s);
      }
      // 2. pending offline completions — treat as complete for UI.
      for (const id of pending) {
        ids.add(id);
        const s = idToSlug.get(id);
        if (s) slugs.add(s);
      }
    }

    // 3. legacy profile array — final safety net.
    //    For guests this is the ONLY source.  For signed-in users it
    //    covers the window before the batched backfill lands.
    const legacy = Array.isArray(profile?.investigationsCompleted)
      ? (profile!.investigationsCompleted as string[])
      : [];
    for (const raw of legacy) {
      if (typeof raw !== "string" || !raw) continue;
      // UUID → keep as id, resolve slug.
      if (slugToId.get(raw)) {
        // raw is a slug; also record its id.
        slugs.add(raw);
        const mapped = slugToId.get(raw);
        if (mapped) ids.add(mapped);
        continue;
      }
      const mappedSlug = idToSlug.get(raw);
      if (mappedSlug) {
        ids.add(raw);
        slugs.add(mappedSlug);
        continue;
      }
      // Unknown mapping — count it under both sets so legacy strings
      // still gate UI ("done" chips) even before snapshot resolves.
      ids.add(raw);
      slugs.add(raw);
    }

    const keys = new Set<string>();
    for (const s of ids) keys.add(s);
    for (const s of slugs) keys.add(s);

    // Canonical count: use the union of canonical ids and any legacy
    // keys we could not map — collapsed via the keys set so the same
    // completion cannot double-count when it appears in both forms.
    const canonicalCount = (() => {
      const seen = new Set<string>();
      for (const id of ids) seen.add(`id:${id}`);
      for (const s of slugs) {
        // If this slug has a mapped id already counted, skip.
        const mid = slugToId.get(s);
        if (mid && ids.has(mid)) continue;
        seen.add(`slug:${s}`);
      }
      return seen.size;
    })();

    const matches = (raw: string) => {
      if (!raw) return false;
      if (keys.has(raw)) return true;
      const mid = slugToId.get(raw);
      if (mid && ids.has(mid)) return true;
      const ms = idToSlug.get(raw);
      if (ms && slugs.has(ms)) return true;
      return false;
    };

    return {
      ready,
      source: isSignedIn ? "server" : "local",
      uid: server.uid,
      completedIds: ids,
      completedSlugs: slugs,
      completedKeys: keys,
      count: canonicalCount,
      matches,
    } as CanonicalInvestigationProgress;
  }, [server.uid, server.ready, server.completedIds, pending, profile?.investigationsCompleted, idToSlug, slugToId]);
}


// Voluntary EMPTY export so callers can render a zero-state without
// having to construct the empty shape themselves.
export function emptyCanonicalInvestigationProgress(): CanonicalInvestigationProgress {
  return EMPTY_CANONICAL;
}
