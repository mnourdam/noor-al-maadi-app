// ============================================================
// StoryReader — shared player runtime (P4)
// ------------------------------------------------------------
// Renders one story: navigates scenes, records progress against
// the P1 durable write contract, calls the shared SceneRenderer.
// Used by /story/$id.
//
// Progress rules:
//   * Every scene view enqueues `recordStoryProgress(story, index)`
//     (monotonic; server GREATEST() prevents downgrades).
//   * Reaching the last scene triggers `completeStory(story)` once.
//   * Resume: initial scene = max(progress.last_scene_index,
//     progress.max_scene_index_reached).
// ============================================================

import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowRight, ArrowLeft, CheckCircle2, Trophy } from "lucide-react";
import type { StoryRow, StorySceneRow, StoryProgressRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { SceneRenderer } from "./scenes/SceneRenderer";
import { recordStoryProgress, completeStory } from "@/lib/stories/progress";
import { StoryMediaImage } from "./StoryMediaImage";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  story: StoryRow;
  scenes: StorySceneRow[];
  media: StoryMediaRow[];
  initialProgress?: StoryProgressRow | null;
  alreadyCompleted?: boolean;
  onCompleted?: () => void;
}

export function StoryReader({
  story, scenes, media, initialProgress, alreadyCompleted, onCompleted,
}: Props) {
  const ordered = useMemo(
    () => [...scenes].sort((a, b) => a.scene_index - b.scene_index),
    [scenes],
  );
  const initialIdx = useMemo(() => {
    if (!initialProgress) return 0;
    const from = Math.max(
      initialProgress.last_scene_index ?? 0,
      initialProgress.max_scene_index_reached ?? 0,
    );
    return Math.min(Math.max(0, from), Math.max(0, ordered.length - 1));
  }, [initialProgress, ordered.length]);

  const [idx, setIdx] = useState(initialIdx);
  const [completed, setCompleted] = useState(!!alreadyCompleted);

  const scene = ordered[idx];
  const isLast = idx === ordered.length - 1;

  // Record view of current scene (monotonic).
  useEffect(() => {
    if (!scene) return;
    void recordStoryProgress(story.id, scene.scene_index);
  }, [scene, story.id]);

  const cover = story.cover_media_id
    ? media.find((m) => m.id === story.cover_media_id) ?? null
    : null;

  const saveReflection = useCallback(async (text: string) => {
    // Reflection integration: write to user_reflections keyed by scene.
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase.from("user_reflections").insert({
      user_id: uid,
      body_ar: text,
      source: "story",
      source_id: `${story.id}:${scene?.id ?? "unknown"}`,
      metadata: { story_id: story.id, scene_index: scene?.scene_index ?? null },
    } as never);
  }, [story.id, scene]);

  const goNext = async () => {
    if (isLast) {
      const res = await completeStory(story.id);
      if (res.acknowledged) {
        setCompleted(true);
        onCompleted?.();
      }
      return;
    }
    setIdx((i) => Math.min(i + 1, ordered.length - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrev = () => {
    if (idx === 0) return;
    setIdx((i) => Math.max(0, i - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (ordered.length === 0) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm text-muted-foreground">
        هذه القصة لا تحتوي على مشاهد بعد.
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto flex min-h-[70vh] max-w-2xl flex-col">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{story.title_ar}</span>
          <span>{idx + 1} / {ordered.length}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((idx + 1) / ordered.length) * 100}%` }}
          />
        </div>
      </div>

      {idx === 0 && cover && (
        <div className="mx-4 mt-4 overflow-hidden rounded-xl border">
          <StoryMediaImage
            media={cover}
            alt={story.title_ar}
            className="h-48 w-full object-cover"
            priority
          />
        </div>
      )}

      <div className="flex-1">
        {scene && (
          <SceneRenderer
            scene={scene}
            media={media}
            onReflectionSubmit={saveReflection}
          />
        )}
      </div>

      {completed && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          <Trophy className="h-4 w-4" />
          <span>أنهيت القصة! تم منح المكافآت.</span>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background/95 p-3 backdrop-blur">
        <button
          onClick={goPrev}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          <ArrowRight className="h-4 w-4" /> السابق
        </button>
        <button
          onClick={() => void goNext()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground"
        >
          {isLast ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> أنهِ القصة
            </>
          ) : (
            <>
              التالي <ArrowLeft className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
