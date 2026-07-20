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

export interface ClaimResult {
  inserted: string[];
  alreadyClaimed: string[];
  rejected: { id: string; reason: string }[];
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
        "achievement_id, unlocked_at, rewards_granted_at, engine_version, definition_version",
      )
      .eq("user_id", userId);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] fetch mirror failed", error);
      return [];
    }
    return data ?? [];
  });
