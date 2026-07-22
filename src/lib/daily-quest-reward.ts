// ============================================================
// Daily Quest — canonical atomic reward grant
// ------------------------------------------------------------
// Rewards are granted through the same idempotent economy path
// used by campaigns, games and streak milestones:
//
//   RPC  `apply_profile_delta(p_delta_id, p_xp, p_dinars, ...)`
//   Table `applied_profile_deltas` PRIMARY KEY (delta_id)
//
// The RPC atomically INSERTs the idempotency row AND updates
// `profiles.xp + dinars` inside a single Postgres transaction.
// A conflict on the primary key returns `{applied:false}` and
// mutates nothing → the reward can never be double-granted, and
// XP/dinars can never partially grant (both columns move in the
// same UPDATE statement).
//
// The delta_id is a deterministic UUIDv5-shape hash of a stable
// reward key:  `daily_quest:<user_id>:<local_date>:<entity_id>`
// so every attempt for the same (user, day, quest) — online,
// offline-then-flushed, or from another device — maps to the
// same primary key. Repeats collapse into `already_applied`.
//
// Online:   RPC returns applied=true  → mirror locally
//           RPC returns applied=false → refresh authoritative
//                                        stats from `profiles`
// Offline:  enqueue in the outbox with the same stable delta_id
//           (see `outbox.enqueueWithId`). On reconnect the flush
//           driver calls the same RPC; the primary key still
//           blocks duplicates.
// Guest:    no cloud account exists yet — grant locally, keyed by
//           the localStorage `rewarded` flag. If guest progress
//           is later merged into a real account, the account's
//           first quest completion uses a `daily_quest:<uid>:...`
//           delta_id the RPC has never seen, so the guest's
//           historical local grant does not double-credit.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { enqueueWithId } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";

export type GrantOutcome =
  | "granted"          // RPC returned applied=true this call
  | "already_granted"  // RPC returned applied=false (idempotent no-op)
  | "queued"           // offline / RPC unreachable — outbox will retry
  | "unauthenticated"; // no user session

export interface RewardServerStats {
  xp: number | null;
  dinars: number | null;
  hearts: number | null;
  streak: number | null;
}

export interface CanonicalGrantResult {
  outcome: GrantOutcome;
  deltaId: string;
  /** Authoritative snapshot after any successful server confirmation. */
  serverStats?: RewardServerStats;
  serverStatsBefore?: RewardServerStats;
  serverStatsAfter?: RewardServerStats;
  rpcStatus: "not_called" | "success" | "error" | "queued";
  rpcBody?: { ok?: boolean; applied?: boolean; reason?: string };
  rpcError?: string | null;
  deltaRowExists?: boolean;
  deltaRowError?: string | null;
}

/** Text encoder cached across calls; SubtleCrypto is available in every
 *  Android WebView we support (Chromium ≥ 60). */
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

/** Deterministic UUIDv5-shape hash of `key`. Same input → same output on
 *  every device and every runtime, so the RPC primary key collapses all
 *  retries for a given (user, day, quest) into a single row. */
export async function deriveStableDeltaId(key: string): Promise<string> {
  if (!enc || typeof crypto === "undefined" || !crypto.subtle) {
    // Fallback: FNV-1a expanded to 16 bytes. Only reached on ancient
    // WebViews without SubtleCrypto — still deterministic per `key`.
    let h1 = 0x811c9dc5 >>> 0;
    let h2 = 0x01000193 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h1 = Math.imul(h1 ^ key.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ((key.charCodeAt(i) * 31) >>> 0), 0x85ebca6b) >>> 0;
    }
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) bytes[i]     = (h1 >>> (i * 4)) & 0xff;
    for (let i = 0; i < 8; i++) bytes[8 + i] = (h2 >>> (i * 4)) & 0xff;
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return formatUuid(bytes);
  }
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(key));
  const bytes = new Uint8Array(digest).slice(0, 16);
  // RFC 4122: set version (5 = name-based) and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function formatUuid(b: Uint8Array): string {
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildDailyQuestRewardKey(params: {
  userId: string;
  localDate: string;
  entityId: string;
}): string {
  return `daily_quest:${params.userId}:${params.localDate}:${params.entityId}`;
}

async function fetchAuthoritativeProfileStats(): Promise<RewardServerStats | undefined> {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error || !data) {
    if (error) console.warn("[daily-quest-reward] profile rehydrate failed", error.message);
    return undefined;
  }
  const row = data as { xp?: number | null; dinars?: number | null; hearts?: number | null; streak?: number | null };
  return {
    xp: row.xp ?? null,
    dinars: row.dinars ?? null,
    hearts: row.hearts ?? null,
    streak: row.streak ?? null,
  };
}

async function fetchDeltaRowExists(deltaId: string): Promise<{ exists?: boolean; error?: string | null }> {
  const { data, error } = await supabase
    .from("applied_profile_deltas")
    .select("delta_id")
    .eq("delta_id", deltaId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { exists: !!data, error: null };
}

/**
 * Account-authoritative completion probe for Daily Reading.
 *
 * Returns `true` iff the server already has a matching row in
 * `applied_profile_deltas` for the stable `(user, local_date, entity_id)`
 * delta_id. Used on mount after reinstall to restore the completed UI
 * without re-granting the reward.
 */
export async function isDailyQuestRewardedOnServer(params: {
  userId: string;
  localDate: string;
  entityId: string;
}): Promise<boolean> {
  const key = buildDailyQuestRewardKey(params);
  const deltaId = await deriveStableDeltaId(key);
  const row = await fetchDeltaRowExists(deltaId);
  return row.exists === true;
}

/**
 * Attempt the canonical atomic reward grant. Never throws — every failure
 * mode is captured in the returned `outcome`. Safe to call from mount-time
 * reconciliation, event handlers, and outbox-flush listeners; the RPC's
 * primary-key idempotency makes any number of calls equivalent to one.
 */
export async function grantDailyQuestReward(params: {
  userId: string;
  localDate: string;
  entityId: string;
  xp: number;
  dinars: number;
}): Promise<CanonicalGrantResult> {
  const { userId, localDate, entityId, xp, dinars } = params;
  const key = buildDailyQuestRewardKey({ userId, localDate, entityId });
  const deltaId = await deriveStableDeltaId(key);

  // Safety: never call when offline. Skip straight to the outbox with the
  // stable id; the flush driver will call the same RPC on reconnect.
  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  if (online) {
    const serverStatsBefore = await fetchAuthoritativeProfileStats();
    try {
      const { data, error } = await supabase.rpc("apply_profile_delta", {
        p_delta_id: deltaId,
        p_xp: xp,
        p_dinars: dinars,
        p_hearts: 0,
        p_source: "daily_quest",
      });
      if (!error) {
        const payload = (data ?? {}) as { ok?: boolean; applied?: boolean; reason?: string };
        const serverStatsAfter = await fetchAuthoritativeProfileStats();
        const deltaRow = await fetchDeltaRowExists(deltaId);
        if (payload.ok === false && payload.reason === "unauthenticated") {
          return {
            outcome: "unauthenticated",
            deltaId,
            rpcStatus: "success",
            rpcBody: payload,
            serverStatsBefore,
            serverStatsAfter,
            deltaRowExists: deltaRow.exists,
            deltaRowError: deltaRow.error,
          };
        }
        if (payload.applied) {
          return {
            outcome: "granted",
            deltaId,
            rpcStatus: "success",
            rpcBody: payload,
            serverStats: serverStatsAfter,
            serverStatsBefore,
            serverStatsAfter,
            deltaRowExists: deltaRow.exists,
            deltaRowError: deltaRow.error,
          };
        }
        // already_applied — server already granted this reward on some
        // earlier call (this device, another device, or a previous flush).
        return {
          outcome: "already_granted",
          deltaId,
          rpcStatus: "success",
          rpcBody: payload,
          serverStats: serverStatsAfter,
          serverStatsBefore,
          serverStatsAfter,
          deltaRowExists: deltaRow.exists,
          deltaRowError: deltaRow.error,
        };
      }
      console.warn("[daily-quest-reward] rpc error, queueing", error.message);
      await enqueueWithId(userId, deltaId, "profile_delta", {
        xp,
        dinars,
        hearts: 0,
        source: "daily_quest",
      });
      void flushOutbox(userId);
      return {
        outcome: "queued",
        deltaId,
        rpcStatus: "error",
        rpcError: error.message,
        serverStatsBefore,
      };
    } catch (err) {
      console.warn("[daily-quest-reward] rpc threw, queueing", err);
      const message = err instanceof Error ? err.message : String(err);
      try {
        await enqueueWithId(userId, deltaId, "profile_delta", {
          xp,
          dinars,
          hearts: 0,
          source: "daily_quest",
        });
        void flushOutbox(userId);
      } catch (enqueueErr) {
        console.warn("[daily-quest-reward] enqueue failed", enqueueErr);
      }
      return {
        outcome: "queued",
        deltaId,
        rpcStatus: "error",
        rpcError: message,
        serverStatsBefore,
      };
    }
  }

  // Offline / RPC transport failure — durable queue with the SAME stable id.
  // The outbox flush driver calls `apply_profile_delta` with `p_delta_id =
  // <this deltaId>`, so a later online attempt cannot double-grant.
  try {
    await enqueueWithId(userId, deltaId, "profile_delta", {
      xp,
      dinars,
      hearts: 0,
      source: "daily_quest",
    });
    // Fire-and-forget flush; safe if offline (early-returns).
    void flushOutbox(userId);
  } catch (err) {
    console.warn("[daily-quest-reward] enqueue failed", err);
  }
  return { outcome: "queued", deltaId, rpcStatus: "queued" };
}
