/**
 * Server-authoritative claim + reward-grant RPC.
 *
 * Client submits achievement ids only. The server validates each id
 * against `public.achievement_registry` (immutable server-side source
 * of reward truth), inserts `user_achievements` rows idempotently, and
 * grants XP + dinars + titles atomically inside a single transaction
 * via the `claim_achievement_rewards` SECURITY DEFINER function.
 *
 * The client never dictates reward amounts.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const claimSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).max(64),
  engineVersion: z.number().int().min(1).max(1000),
});

const presentationSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).max(64),
  origin: z.string().min(1).max(64).default("live_gameplay_unlock"),
});

const repairSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).max(128),
  metadata: z.record(z.unknown()).default({}),
});

export interface ClaimResult {
  inserted: string[];
  alreadyClaimed: string[];
  rejected: { id: string; reason: string }[];
}

export interface HistoricalRepairResult {
  repaired: string[];
  existing: string[];
  rejected: string[];
}

export const claimAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => claimSchema.parse(data))
  .handler(async ({ data, context }): Promise<ClaimResult> => {
    const { ids } = data;
    const { supabase } = context;

    if (ids.length === 0) {
      return { inserted: [], alreadyClaimed: [], rejected: [] };
    }

    const { data: rows, error } = await supabase.rpc(
      "claim_achievement_rewards",
      { _ids: ids },
    );

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] claim rpc failed", error);
      return {
        inserted: [],
        alreadyClaimed: [],
        rejected: ids.map((id) => ({ id, reason: "rpc_error" })),
      };
    }

    // The RPC returns a single row (table function) with three text[] columns.
    const row = Array.isArray(rows) ? rows[0] : rows;
    const inserted: string[] = row?.inserted ?? [];
    const already: string[] = row?.already_claimed ?? [];
    const rejected: string[] = row?.rejected ?? [];

    return {
      inserted,
      alreadyClaimed: already,
      rejected: rejected.map((id) => ({ id, reason: "unknown_or_retired_id" })),
    };
  });

/**
 * Fetch the current server-side user_achievements mirror for the signed-in
 * user. Used by the client on boot and after each successful claim.
 */
export const fetchUserAchievements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_achievements")
      .select(
        "achievement_id, unlocked_at, rewards_granted_at, engine_version, definition_version, presented_at, notified_at, presentation_origin, repair_origin",
      )
      .eq("user_id", userId);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] fetch mirror failed", error);
      return [];
    }
    return data ?? [];
  });

export const markAchievementsPresented = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => presentationSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return { updated: [] as string[] };
    const { data: updated, error } = await (context.supabase.rpc as any)(
      "mark_achievement_presented",
      { _ids: data.ids, _origin: data.origin },
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] mark presented failed", error);
      return { updated: [] as string[], error: "mark_presented_failed" };
    }
    return { updated: Array.isArray(updated) ? updated as string[] : [] };
  });

export const repairHistoricalAchievements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => repairSchema.parse(data))
  .handler(async ({ data, context }): Promise<HistoricalRepairResult> => {
    if (data.ids.length === 0) return { repaired: [], existing: [], rejected: [] };
    const { data: rows, error } = await (context.supabase.rpc as any)(
      "repair_historical_achievements",
      { _ids: data.ids, _metadata: data.metadata },
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] historical repair failed", error);
      return { repaired: [], existing: [], rejected: data.ids };
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      repaired: row?.repaired ?? [],
      existing: row?.existing ?? [],
      rejected: row?.rejected ?? [],
    };
  });
