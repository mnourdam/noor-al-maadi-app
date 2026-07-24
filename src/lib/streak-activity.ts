/**
 * Phase 3A — Canonical qualifying-activity recorder.
 *
 * Every qualifying activity (campaign chapter, game, investigation) must
 * call `recordStreakActivity(source, sourceId)` for authenticated users.
 * The server is authoritative:
 *   - canonical day is `Asia/Riyadh`
 *   - at most one increment per canonical day
 *   - milestone rewards granted transactionally
 *   - final XP / Dinars / streak / longest_streak returned
 *
 * Guests do NOT hit the server. The route callers keep calling
 * `touchStreak()` locally for guest fallback (no server economy grants).
 */
import { supabase } from "@/integrations/supabase/client";

export type StreakSource =
  | "campaign_chapter"
  | "game"
  | "investigation"
  | "unknown";

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
  grants: StreakGrant[];
  xp_total: number;
  dinar_balance: number;
}

export interface StreakActivityFailure {
  ok: false;
  reason: "unauthenticated" | "offline" | "rpc_error";
  error?: string;
}

export type StreakActivityOutcome = StreakActivityResult | StreakActivityFailure;

/**
 * Fire-and-await server call. Returns a structured outcome — callers
 * must NOT grant XP / Dinars locally; use the returned totals instead.
 */
export async function recordStreakActivity(
  source: StreakSource,
  sourceId?: string | null,
): Promise<StreakActivityOutcome> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return { ok: false, reason: "unauthenticated" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, reason: "offline" };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("record_streak_activity", {
      p_source: source,
      p_source_id: sourceId ?? null,
    });
    if (error) {
      console.warn("[streak] record_streak_activity rpc error", error.message);
      return { ok: false, reason: "rpc_error", error: error.message };
    }
    const payload = (data ?? {}) as Partial<StreakActivityResult>;
    if (payload.ok !== true) {
      return { ok: false, reason: "rpc_error", error: "invalid_payload" };
    }
    return {
      ok: true,
      already_recorded_today: !!payload.already_recorded_today,
      current_streak: Number(payload.current_streak ?? 0),
      longest_streak: Number(payload.longest_streak ?? 0),
      last_active_day: String(payload.last_active_day ?? ""),
      grants: Array.isArray(payload.grants) ? (payload.grants as StreakGrant[]) : [],
      xp_total: Number(payload.xp_total ?? 0),
      dinar_balance: Number(payload.dinar_balance ?? 0),
    };
  } catch (e) {
    console.warn("[streak] record_streak_activity threw", e);
    return { ok: false, reason: "rpc_error", error: String(e) };
  }
}
