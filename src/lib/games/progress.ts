import { supabase } from "@/integrations/supabase/client";
import { recordGameComplete } from "@/lib/offline/record";
import { notifyQuestProgress } from "@/lib/daily-quest";

export interface GameProgressRow {
  id: string;
  user_id: string;
  game_id: string;
  stage_index: number;
  completed: boolean;
  best_score: number;
  last_played_at: string;
}

export async function getMyProgress(
  gameId: string,
): Promise<GameProgressRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from("game_progress")
    .select("*")
    .eq("user_id", uid)
    .eq("game_id", gameId)
    .maybeSingle();
  return (data as unknown as GameProgressRow) ?? null;
}

/**
 * Idempotent completion record. Returns `firstTime: true` only when this is
 * the first time the user completes this game — callers should award XP/coins
 * only when `firstTime` is true to avoid double-rewards on refresh/replay.
 *
 * Offline-safe: enqueues the completion in the durable outbox so it is
 * flushed automatically on reconnect. Local `firstTime` detection reads
 * the current server row when online; when offline the local profile
 * arrays (missionsCompleted / investigationsCompleted / campaignsCompleted)
 * still gate reward re-issue.
 */
export async function recordCompletion(
  gameId: string,
  stageIndex: number,
  score: number,
): Promise<{ firstTime: boolean }> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { firstTime: false };
  let alreadyCompleted = false;
  try {
    const existing = await getMyProgress(gameId);
    alreadyCompleted = !!existing?.completed;
    const bestScore = Math.max(existing?.best_score ?? 0, score);
    score = bestScore;
  } catch {
    /* offline — best_score falls back to the passed value */
  }
  await recordGameComplete({ gameId, stageIndex, score });
  // Notify the Daily Quest system — only the first-time completion counts,
  // so replaying a challenge cannot re-complete "أكمل تحديًا واحدًا".
  if (!alreadyCompleted) notifyQuestProgress("complete_challenge", 1);
  return { firstTime: !alreadyCompleted };
}
