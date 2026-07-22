// ============================================================
// Stories — durable write contract (P1)
// ------------------------------------------------------------
// Local-first monotonic progress + sticky completion for stories.
// Mirrors the Priority-Zero contract already used for campaigns
// and tutorial completion:
//   1. Enqueue an outbox operation with a STABLE id so replays
//      cannot double-write.
//   2. Immediately attempt the awaited RPC when online.
//   3. On success remove the outbox item; on transient failure
//      leave it queued for the flush driver; on permanent
//      failure let the flush driver move it to dead-letter.
//
// Reward identity for completion is derived server-side via
// `stable_delta_uuid('story_completion:<uid>:<story_id>')` and is
// independent of `content_version`, so replaying a newer version
// grants zero and historical completion is sticky.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { enqueueWithId, remove as removeFromOutbox } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";
import type {
  StoryAccessBundle,
  StoryCompletionResult,
} from "./types";

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

/** Server-authorized bundle read. Works for anon on published stories. */
export async function fetchStoryAccess(storyId: string): Promise<StoryAccessBundle> {
  const { data, error } = await supabase.rpc(
    "get_story_access" as any,
    { p_story_id: storyId },
  );
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "empty" }) as StoryAccessBundle;
}

/**
 * Monotonic per-scene progress. Local-first: enqueues then attempts the RPC.
 * Safe to call repeatedly with the same or lower `sceneIndex`; the RPC uses
 * GREATEST() so historical high-water mark is never downgraded.
 */
export async function recordStoryProgress(
  storyId: string,
  sceneIndex: number,
): Promise<{ acknowledged: boolean; reason?: string }> {
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, reason: "unauthenticated" };
  const outboxId = `story_progress:${uid}:${storyId}:${sceneIndex}`;
  await enqueueWithId(uid, outboxId, "story_progress", { storyId, sceneIndex });
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc(
        "record_story_progress_v2" as any,
        { p_story_id: storyId, p_scene_index: sceneIndex },
      );
      if (!error) {
        const payload = (data ?? {}) as { ok?: boolean; reason?: string };
        if (payload.ok) {
          try { await removeFromOutbox(outboxId); } catch { /* ignore */ }
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("irth:story-progress:changed"));
            }
          } catch { /* ignore */ }
          return { acknowledged: true };
        }
        void flushOutbox(uid);
        return { acknowledged: false, reason: payload.reason ?? "rpc-not-ok" };
      }
    } catch { /* fall through */ }
  }
  void flushOutbox(uid);
  return { acknowledged: false, reason: "queued" };
}

/**
 * Sticky one-shot completion. Reward is granted at most once per
 * (user, story) regardless of `content_version`. Concurrent calls
 * are safe: the RPC uses ON CONFLICT DO NOTHING for the completion
 * row and apply_profile_delta's PK dedupes the reward.
 */
export async function completeStory(
  storyId: string,
): Promise<{ acknowledged: boolean; reason?: string; result?: StoryCompletionResult }> {
  const uid = await currentUserId();
  if (!uid) return { acknowledged: false, reason: "unauthenticated" };
  const outboxId = `story_completion:${uid}:${storyId}`;
  await enqueueWithId(uid, outboxId, "story_completion", { storyId });
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc(
        "complete_story_v2" as any,
        { p_story_id: storyId },
      );
      if (!error) {
        const payload = (data ?? {}) as StoryCompletionResult;
        if (payload.ok) {
          try { await removeFromOutbox(outboxId); } catch { /* ignore */ }
          try {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("irth:story-completions:changed"));
            }
          } catch { /* ignore */ }
          return { acknowledged: true, result: payload };
        }
        void flushOutbox(uid);
        return { acknowledged: false, reason: payload.reason ?? "rpc-not-ok" };
      }
    } catch { /* fall through */ }
  }
  void flushOutbox(uid);
  return { acknowledged: false, reason: "queued" };
}
