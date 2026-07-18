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

import { useEffect, useState } from "react";
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

/**
 * Enqueue a server-authoritative investigation completion. Safe to call
 * more than once — the outbox and the server RPC both dedupe. Signed-
 * out users are a no-op (legacy local profile array still records the
 * slug for local UX; the sign-in flow later triggers backfill).
 */
export async function recordInvestigationCompletion(
  input: InvestigationCompletionInput,
): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const investigationId = input.investigationId;
  if (!investigationId) return;
  const deltaId = await stableDeltaId(uid, investigationId);
  await enqueueWithId(uid, deltaId, "investigation_complete", {
    investigationId,
    score: Math.max(0, input.score ?? 0),
    correctCount: Math.max(0, input.correctCount ?? 0),
  });
  void flushOutbox(uid);
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

export function useInvestigationProgress(): ProgressState {
  const [state, setState] = useState<ProgressState>(EMPTY_STATE);

  useEffect(() => {
    let alive = true;
    let currentUid: string | null = null;

    const reload = async () => {
      if (!currentUid) {
        if (alive) setState({ uid: null, ready: true, byId: new Map(), completedIds: new Set() });
        return;
      }
      const next = await fetchProgress(currentUid);
      if (alive) setState(next);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      currentUid = data.session?.user?.id ?? null;
      void reload();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      currentUid = session?.user?.id ?? null;
      void reload();
    });

    const onChanged = () => { void reload(); };
    if (typeof window !== "undefined") {
      window.addEventListener("irth:investigation-progress:changed", onChanged as EventListener);
      window.addEventListener("irth:outbox:flushed", onChanged as EventListener);
    }

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("irth:investigation-progress:changed", onChanged as EventListener);
        window.removeEventListener("irth:outbox:flushed", onChanged as EventListener);
      }
    };
  }, []);

  return state;
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
