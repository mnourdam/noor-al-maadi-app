// ============================================================
// StoryPlayer — cinematic fullscreen runtime (Phase B Rev 2).
// ------------------------------------------------------------
// State machine:
//   intro → playing(sceneIdx) → paused → reward → journey
// Contracts preserved:
//   * recordStoryProgress on every scene view (monotonic)
//   * completeStory once when leaving the last scene
//   * Reflection scenes: auto-advance disabled
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StoryRow, StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { useStoryMediaUrl } from "@/lib/stories/media/url";
import { recordStoryProgress, completeStory } from "@/lib/stories/progress";
import type { StorySummary } from "@/lib/stories/summary";
import { SegmentedProgress } from "./SegmentedProgress";
import { SceneStage } from "./sceneLayouts";
import { KenBurns } from "./KenBurns";
import { RewardMoment } from "./RewardMoment";
import { ContinueYourJourney } from "./ContinueYourJourney";
import { sceneDwellMs } from "./timing";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  story: StoryRow;
  scenes: StorySceneRow[];
  media: StoryMediaRow[];
  summary: StorySummary | null;
  initialSceneIndex: number;
  alreadyCompleted: boolean;
  onExit: () => void;
}

type Phase = "intro" | "playing" | "reward" | "journey";

const INTRO_HOLD_MS = 1100;

export function StoryPlayer({
  story, scenes, media, summary, initialSceneIndex, alreadyCompleted, onExit,
}: Props) {
  const ordered = useMemo(
    () => [...scenes].sort((a, b) => a.scene_index - b.scene_index),
    [scenes],
  );
  const cover = story.cover_media_id
    ? media.find((m) => m.id === story.cover_media_id) ?? null
    : null;
  const coverUrl = useStoryMediaUrl(cover ?? null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(Math.min(initialSceneIndex, Math.max(0, ordered.length - 1)));
  const [paused, setPaused] = useState(false);
  const [rewardShown, setRewardShown] = useState(false);
  const navigate = useNavigate();

  const scene = ordered[idx] ?? null;
  const dwellMs = useMemo(() => scene ? sceneDwellMs(scene) : 4000, [scene]);
  const autoAdvance = scene ? scene.scene_type !== "reflection" : false;

  // --- Intro hold, then start ------------------------------------
  useEffect(() => {
    if (phase !== "intro") return;
    const t = window.setTimeout(() => setPhase("playing"), INTRO_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // --- Record scene view (monotonic) -----------------------------
  useEffect(() => {
    if (phase !== "playing" || !scene) return;
    void recordStoryProgress(story.id, scene.scene_index);
  }, [phase, scene, story.id]);

  // --- Auto advance ----------------------------------------------
  useEffect(() => {
    if (phase !== "playing" || !autoAdvance || paused) return;
    const t = window.setTimeout(() => { void goNext(); }, dwellMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, paused, dwellMs, autoAdvance]);

  // --- Reflection save contract (unchanged from P4 reader) -------
  const saveReflection = useCallback(async (text: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid || !scene) return;
    const sceneRef = scene.id ?? `scene-${scene.scene_index}`;
    await supabase.from("user_reflections").upsert(
      {
        user_id: uid,
        campaign_id: story.id,
        activity_id: sceneRef,
        source_type: "story",
        source_id: story.id,
        context_id: sceneRef,
        mode: "write",
        note: text,
      } as never,
      { onConflict: "user_id,campaign_id,activity_id" } as never,
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:reflections-changed"));
    }
  }, [scene, story.id]);

  // --- Navigation primitives -------------------------------------
  const isLast = idx === ordered.length - 1;

  const goNext = useCallback(async () => {
    if (!scene) return;
    if (isLast) {
      // Trigger the completion contract; RewardMoment renders regardless
      // (reward is server-idempotent — replays grant zero).
      void completeStory(story.id);
      setPhase("reward");
      return;
    }
    setIdx((n) => Math.min(n + 1, ordered.length - 1));
  }, [isLast, ordered.length, scene, story.id]);

  const goPrev = useCallback(() => {
    setIdx((n) => Math.max(0, n - 1));
  }, []);

  // --- Gesture layer: tap zones, long-press, swipe-down ----------
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== "playing") return;
    touchRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => setPaused(true), 350);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    const start = touchRef.current;
    touchRef.current = null;
    if (paused) { setPaused(false); return; }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = performance.now() - start.t;
    if (dt > 350) return; // was a long-press; already resolved
    if (Math.abs(dy) > 80 && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      onExit();
      return;
    }
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) return; // ignore drags
    if (phase === "intro") { setPhase("playing"); return; }
    if (phase !== "playing") return;
    const w = (e.currentTarget as HTMLElement).clientWidth;
    const zoneRight = e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left;
    // RTL: right side (higher x in LTR terms) = previous; left side = next
    // But player is fullscreen; use pointer x relative to element.
    if (zoneRight < w * 0.25) { void goNext(); }
    else if (zoneRight > w * 0.75) { goPrev(); }
    else { setPaused((p) => !p); }
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onExit(); return; }
      if (phase === "intro" && (e.key === "Enter" || e.key === " ")) { setPhase("playing"); return; }
      if (phase !== "playing") return;
      if (e.key === "ArrowLeft") { void goNext(); }
      else if (e.key === "ArrowRight") { goPrev(); }
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, goNext, goPrev, onExit]);

  // Prevent body scroll while player is mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const subtitle = story.era || null;
  const progressEpoch = phase === "intro" ? "intro" : `s${idx}`;

  return (
    <div
      className="fixed inset-0 z-[200] select-none bg-black text-white"
      dir="rtl"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20"
           style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <SegmentedProgress
          total={ordered.length}
          activeIndex={phase === "intro" ? -1 : idx}
          activeMs={autoAdvance ? dwellMs : 999_999}
          paused={paused || phase !== "playing"}
          epoch={progressEpoch}
        />
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <div className="pointer-events-none flex min-w-0 items-center gap-2">
            <span className="truncate text-[12px] text-white/80">{story.title_ar}</span>
            {paused && phase === "playing" && (
              <Pause className="size-3.5 text-gold" aria-label="متوقفة" />
            )}
          </div>
          <button
            type="button"
            className="pointer-events-auto grid size-9 place-items-center rounded-full bg-black/40 text-white/85 backdrop-blur"
            onClick={(e) => { e.stopPropagation(); onExit(); }}
            aria-label="إغلاق"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Stage */}
      {phase === "intro" && (
        <>
          <KenBurns src={coverUrl} alt={story.title_ar} seed={`cover:${story.id}`} overlay="vignette" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-8 pb-[calc(env(safe-area-inset-bottom)+96px)]"
               style={{ animation: "intro-fade 900ms 200ms ease-out both" }}>
            <p className="mb-2 text-[10px] tracking-[0.36em] text-gold/80">إرث</p>
            <h1 className="font-display text-[32px] font-bold leading-[1.15] text-white drop-shadow-lg">
              {story.title_ar}
            </h1>
            {subtitle && (
              <p className="mt-2 text-[13px] text-white/80">{subtitle}</p>
            )}
            {story.summary_ar && (
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-white/70">
                {story.summary_ar}
              </p>
            )}
          </div>
          <style>{`@keyframes intro-fade { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: translateY(0);} }`}</style>
        </>
      )}

      {(phase === "playing" || phase === "reward") && scene && (
        <TransitionShell scene={scene}>
          <SceneStage
            scene={scene}
            media={media}
            epoch={scene.id}
            paused={paused || phase !== "playing"}
            onReflectionSubmit={saveReflection}
          />
        </TransitionShell>
      )}

      {/* Reward moment */}
      {phase === "reward" && !rewardShown && (
        <RewardMoment
          xp={alreadyCompleted ? 0 : (summary?.xp_reward ?? story.xp_reward ?? 0)}
          dinars={alreadyCompleted ? 0 : (summary?.dinar_reward ?? story.dinar_reward ?? 0)}
          silent={alreadyCompleted}
          onDone={() => { setRewardShown(true); setPhase("journey"); }}
        />
      )}

      {/* Continue Your Journey */}
      {phase === "journey" && (
        <ContinueYourJourney
          finished={summary}
          onReplay={() => {
            setIdx(0);
            setRewardShown(false);
            setPhase("intro");
          }}
          onClose={() => onExit()}
        />
      )}

      {/* Reflection hint — reflection scenes disable auto-advance */}
      {phase === "playing" && scene?.scene_type === "reflection" && !paused && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void goNext(); }}
          className="pointer-events-auto absolute inset-x-0 bottom-6 z-20 mx-auto w-max rounded-full border border-gold/40 bg-black/60 px-4 py-2 text-[12px] text-gold backdrop-blur"
        >
          {isLast ? "أنهِ القصة" : "متابعة"}
        </button>
      )}
    </div>
  );
}

/** Wraps the stage in a per-scene transition animation. */
function TransitionShell({ scene, children }: { scene: StorySceneRow; children: React.ReactNode }) {
  const cls = (() => {
    switch (scene.scene_type) {
      case "document":   return "anim-paper";
      case "reveal":     return "anim-blur";
      case "reflection": return "anim-calm";
      case "perspective":return "anim-dissolve";
      default:           return "anim-dissolve";
    }
  })();
  return (
    <div key={scene.id} className={`absolute inset-0 ${cls}`}>
      <style>{`
        .anim-dissolve { animation: sc-dissolve 460ms ease-out both; }
        .anim-paper    { animation: sc-paper 520ms cubic-bezier(0.2,0.9,0.3,1) both; }
        .anim-blur     { animation: sc-blur 620ms ease-out both; }
        .anim-calm     { animation: sc-calm 720ms ease-out both; }
        @keyframes sc-dissolve { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sc-paper    { from { opacity: 0; transform: translateY(24px) rotate(-0.6deg);} to { opacity: 1; transform: translateY(0) rotate(0);} }
        @keyframes sc-blur     { from { opacity: 0; filter: blur(14px);} to { opacity: 1; filter: blur(0);} }
        @keyframes sc-calm     { from { opacity: 0;} to { opacity: 1;} }
      `}</style>
      {children}
    </div>
  );
}
