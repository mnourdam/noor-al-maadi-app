/**
 * V16 — Durable qualifying-activity recorder.
 *
 * Every qualifying activity (campaign chapter, game, investigation, story
 * completion) calls `recordStreakActivity(source, sourceId)`.
 *
 * Contract:
 *   1. The canonical activity day is captured on the CLIENT as an
 *      `Asia/Riyadh` day key (`irthDayKey()`), never a device-local day.
 *   2. The mutation is durably enqueued to the offline outbox FIRST
 *      (stable id `streak_activity:<uid>:<day>` → idempotent per day).
 *   3. A live `record_streak_activity_v16` RPC is attempted with a finite
 *      timeout. On success the queued item is acknowledged and removed.
 *      On offline/timeout/error the item stays queued and is retried by
 *      the normal flush pipeline, replaying the ORIGINAL activity day.
 *   4. The server is authoritative for streak / longest_streak / rewards.
 *
 * Guests never reach the server; route callers keep their local fallback.
 */
import { supabase } from "@/integrations/supabase/client";
import { irthDayKey } from "@/lib/irth-day";
import { enqueueWithId, remove as removeFromOutbox } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";

export type StreakSource =
  | "campaign_chapter"
  | "game"
  | "investigation"
  | "story"
  | "unknown";

/** Finite RPC budget — a hanging call must never block gameplay. */
export const STREAK_RPC_TIMEOUT_MS = 8000;

export interface StreakGrant {
  reward_key: string;
  milestone_days: number;
  reward_version: number;
  xp_granted: number;
  dinars_granted: number;
  badge_id: string | null;
  title_id: string | null;
  artifact_id: string | null;
}

export interface StreakActivityResult {
  ok: true;
  already_recorded_today: boolean;
  current_streak: number;
  longest_streak: number;
  last_active_day: string;
  activity_day: string;
  grants: StreakGrant[];
  xp_total: number;
  dinar_balance: number;
}

export interface StreakActivityFailure {
  ok: false;
  reason: "unauthenticated" | "queued" | "rpc_error";
  /** True when the mutation is safely persisted in the durable outbox. */
  queued?: boolean;
  error?: string;
}

export type StreakActivityOutcome = StreakActivityResult | StreakActivityFailure;

export function streakOutboxId(userId: string, activityDay: string): string {
  return `streak_activity:${userId}:${activityDay}`;
}

export interface StreakActivityPayload {
  source: StreakSource;
  sourceId: string | null;
  activityDay: string;
  clientKey: string;
}

/**
 * Calls the additive V16 RPC. Shared by the live path and the outbox flush
 * driver so a replay uses exactly the same contract and original day.
 */
export async function callRecordStreakActivityV16(
  p: StreakActivityPayload,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("record_streak_activity_v16", {
      p_source: p.source,
      p_source_id: p.sourceId,
      p_activity_day: p.activityDay,
      p_client_key: p.clientKey,
    });
    if (error) return { ok: false, error: error.message };
    const payload = (data ?? {}) as Record<string, unknown>;
    if (payload["ok"] !== true) return { ok: false, error: "invalid_payload" };
    return { ok: true, data: payload };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(onTimeout), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(onTimeout); });
  });
}

export async function recordStreakActivity(
  source: StreakSource,
  sourceId?: string | null,
): Promise<StreakActivityOutcome> {
  let uid: string | null = null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    uid = userData?.user?.id ?? null;
  } catch { uid = null; }
  if (!uid) return { ok: false, reason: "unauthenticated" };

  const activityDay = irthDayKey();
  const clientKey = streakOutboxId(uid, activityDay);
  const payload: StreakActivityPayload = {
    source,
    sourceId: sourceId ?? null,
    activityDay,
    clientKey,
  };

  // 1. DURABLE FIRST — survives offline, kill, restart, RPC failure.
  let durable = true;
  try {
    await enqueueWithId(uid, clientKey, "streak_activity", { ...payload });
  } catch (e) {
    // Storage unavailable (private mode / quota). We still try the live RPC,
    // but we must NOT later claim the activity is safely queued.
    durable = false;
    console.warn("[streak] enqueue failed", e);
  }


  // 2. Live attempt (never gated on navigator.onLine — the queue already holds it).
  const res = await withTimeout(
    callRecordStreakActivityV16(payload),
    STREAK_RPC_TIMEOUT_MS,
    { ok: false as const, error: "timeout" },
  );

  if (!res.ok || !res.data) {
    void flushOutbox(uid);
    return { ok: false, reason: "queued", queued: true, error: res.error };
  }

  // 3. Acknowledge — the day is now durably recorded server-side.
  try { await removeFromOutbox(clientKey); } catch { /* ignore */ }

  const d = res.data;
  return {
    ok: true,
    already_recorded_today: !d["newly_recorded_day"],
    current_streak: Number(d["current_streak"] ?? 0),
    longest_streak: Number(d["longest_streak"] ?? 0),
    last_active_day: String(d["last_active_day"] ?? activityDay),
    activity_day: String(d["activity_day"] ?? activityDay),
    grants: Array.isArray(d["grants"]) ? (d["grants"] as StreakGrant[]) : [],
    xp_total: Number(d["xp_total"] ?? 0),
    dinar_balance: Number(d["dinar_balance"] ?? 0),
  };
}
