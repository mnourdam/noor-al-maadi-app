/**
 * Server-authoritative claim RPC.
 *
 * The client sends the ids it believes are newly unlocked; the server
 * re-validates each id against its own registry mirror and canonical
 * snapshot, inserts `user_achievements` rows idempotently, and grants
 * rewards (xp, dinars, titles, museum items) inside a single transaction.
 *
 * This slice ships the plumbing; server-side revalidation and reward
 * grants will be filled in when we cut over from the legacy engine so
 * that the two systems never both grant rewards at the same time.
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
    const { ids, engineVersion } = data;
    const { supabase, userId } = context;

    if (ids.length === 0) {
      return { inserted: [], alreadyClaimed: [], rejected: [] };
    }

    // Idempotent insert. rewards_granted_at stays NULL for now — the reward
    // grant transaction is filled in in the cutover slice, so the legacy
    // engine remains the sole reward source until that switch.
    const rows = ids.map((id) => ({
      user_id: userId,
      achievement_id: id,
      engine_version: engineVersion,
    }));

    const { data: inserted, error } = await supabase
      .from("user_achievements")
      .upsert(rows, {
        onConflict: "user_id,achievement_id",
        ignoreDuplicates: true,
      })
      .select("achievement_id");

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[achievements] claim insert failed", error);
      return {
        inserted: [],
        alreadyClaimed: [],
        rejected: ids.map((id) => ({ id, reason: "db_error" })),
      };
    }

    const insertedIds = (inserted ?? []).map((r) => r.achievement_id);
    const alreadyClaimed = ids.filter((id) => !insertedIds.includes(id));
    return { inserted: insertedIds, alreadyClaimed, rejected: [] };
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
