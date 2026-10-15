import { getIdentityEpoch } from "@/lib/identity/owner";
import { saveDeadline, saveUserId } from "@/lib/offline/gameplay-write";
import { peekAll } from "@/lib/offline/outbox";
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
  const uid = await saveUserId();
  if (!uid) return null;
  const { data } = await saveDeadline(supabase
    .from("game_progress")
    .select("*")
    .eq("user_id", uid)
    .eq("game_id", gameId)
    .maybeSingle());
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
const rewardedThisSession = new Set<string>();
export async function recordCompletion(
  gameId: string,
  stageIndex: number,
  score: number,
): Promise<{ firstTime: boolean; saved: boolean }> {
  const epoch = getIdentityEpoch();
  const uid = await saveUserId();
  if (!uid) return { firstTime: false, saved: false };
  let alreadyCompleted = false;
  try {
    const pending = (await peekAll(uid)).filter((row) => row.kind === "game_complete" && row.payload.gameId === gameId);
    alreadyCompleted = pending.length > 0;
    score = Math.max(score, ...pending.map((row) => Number(row.payload.score ?? 0)));
  } catch { return { firstTime: false, saved: false }; }
  try {
    const existing = await getMyProgress(gameId);
    alreadyCompleted = alreadyCompleted || !!existing?.completed;
    const bestScore = Math.max(existing?.best_score ?? 0, score);
    score = bestScore;
  } catch {
    /* offline — best_score falls back to the passed value */
  }
  if (getIdentityEpoch() !== epoch || await saveUserId() !== uid) return { firstTime: false, saved: false };
  const saved = await recordGameComplete({ gameId, stageIndex, score }, uid);
  if (getIdentityEpoch() !== epoch || await saveUserId() !== uid) return { firstTime: false, saved: false };
  if (!saved.acknowledged && !saved.queued) return { firstTime: false, saved: false };
  // Notify the Daily Quest system — only the first-time completion counts,
  // so replaying a challenge cannot re-complete "أكمل تحديًا واحدًا".
  const key = `${uid}:${gameId}`;
  const firstTime = !alreadyCompleted && !rewardedThisSession.has(key);
  if (firstTime) { rewardedThisSession.add(key); notifyQuestProgress("complete_challenge", 1); }
  return { firstTime, saved: true };
}
