// ============================================================
// Social Reactions — "استزدتُ" (P6 Step 1)
// ------------------------------------------------------------
// Single reaction primitive across Irth. Anchor-agnostic:
// today "story", tomorrow "entity", later others — the client
// contract never changes.
//
// Contract (frozen):
//   * ONE mutation: toggleReaction(anchorType, anchorId).
//     Never expose addReaction / removeReaction.
//   * Counts and active-state are read from the SOURCE OF TRUTH
//     (`social_reactions`) via the batch RPC. `stories.reaction_count`
//     is only a cache; if drift is ever suspected admins run
//     `rebuild_reaction_counters()`.
//   * Reactions are online-only. Callers must gate on `useOnline()`.
//     There is no outbox and no optimistic success.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

/** Anchor types the reaction primitive supports. Extend via migration. */
export type SocialAnchorType = "story";

export interface ToggleReactionResult {
  ok: boolean;
  reason?: string;
  /** After the toggle: is the current user's reaction active? */
  active?: boolean;
  /** After the toggle: authoritative count (from source of truth). */
  count?: number;
}

export interface ReactionState {
  anchorId: string;
  count: number;
  active: boolean;
}

/**
 * The ONLY reaction mutation. Idempotent and atomic on the server.
 * Callers must ensure the user is signed in and online before calling.
 */
export async function toggleReaction(
  anchorType: SocialAnchorType,
  anchorId: string,
): Promise<ToggleReactionResult> {
  try {
    const { data, error } = await supabase.rpc("toggle_reaction_v2" as never, {
      p_anchor_type: anchorType,
      p_anchor_id: anchorId,
    } as never);
    if (error) return { ok: false, reason: error.message };
    const payload = (data ?? {}) as ToggleReactionResult;
    return payload;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Batch read for lists. Returns authoritative { count, active } per
 * anchor, sourced from `social_reactions` (not the cache). Signed-in
 * only; guests receive counts of 0 / active false.
 */
export async function fetchReactionStates(
  anchorType: SocialAnchorType,
  anchorIds: string[],
): Promise<ReactionState[]> {
  if (anchorIds.length === 0) return [];
  try {
    const { data, error } = await supabase.rpc(
      "get_reactions_for_anchors_v2" as never,
      { p_anchor_type: anchorType, p_anchor_ids: anchorIds } as never,
    );
    if (error) return anchorIds.map((id) => ({ anchorId: id, count: 0, active: false }));
    return ((data ?? []) as Array<{ anchor_id: string; count: number; active: boolean }>).map(
      (r) => ({ anchorId: r.anchor_id, count: r.count ?? 0, active: !!r.active }),
    );
  } catch {
    return anchorIds.map((id) => ({ anchorId: id, count: 0, active: false }));
  }
}
