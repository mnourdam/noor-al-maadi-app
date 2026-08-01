// ============================================================
// Story unlock notices — durable "already announced" ledger
// ------------------------------------------------------------
// The unlock celebration is a ONE-TIME notification per story.
// Local storage alone is not enough: it is owner-partitioned and
// wiped on identity change, so signing out and back in used to
// replay every celebration.
//
// Truth for signed-in players lives in
// `public.user_story_unlock_notices` (user_id, story_id). Guests
// keep the local ledger only; on sign-in the server set is merged
// in before any celebration can fire.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

const TABLE = "user_story_unlock_notices";

/** Story ids this user has already been notified about (server truth). */
export async function fetchSeenUnlockNotices(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE as never)
      .select("story_id")
      .eq("user_id", userId);
    if (error || !data) return [];
    return (data as unknown as { story_id: string }[])
      .map((r) => r.story_id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Idempotently record that these stories were announced to the user. */
export async function markUnlockNoticesSeen(
  userId: string,
  storyIds: string[],
): Promise<void> {
  const ids = Array.from(new Set(storyIds.filter(Boolean)));
  if (ids.length === 0) return;
  try {
    await supabase
      .from(TABLE as never)
      .upsert(
        ids.map((story_id) => ({ user_id: userId, story_id })) as never,
        { onConflict: "user_id,story_id", ignoreDuplicates: true },
      );
  } catch {
    /* offline — the local ledger still suppresses the replay */
  }
}
