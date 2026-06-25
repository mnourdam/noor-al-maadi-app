import { supabase } from "@/integrations/supabase/client";

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

export async function recordCompletion(
  gameId: string,
  stageIndex: number,
  score: number,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;
  const existing = await getMyProgress(gameId);
  const bestScore = Math.max(existing?.best_score ?? 0, score);
  await supabase.from("game_progress").upsert(
    {
      user_id: uid,
      game_id: gameId,
      stage_index: stageIndex,
      completed: true,
      best_score: bestScore,
      last_played_at: new Date().toISOString(),
    },
    { onConflict: "user_id,game_id" },
  );
}
