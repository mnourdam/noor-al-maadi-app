// ============================================================
// StoryPlayer — cinematic fullscreen runtime (Post-Freeze Rev)
// ------------------------------------------------------------
// State machine:
//   playing(sceneIdx) → paused → reward → journey
// Contracts preserved:
//   * recordStoryProgress on every scene view (monotonic)
//   * completeStory once when leaving the last scene
//   * Reflection scenes: auto-advance disabled
// The legacy "intro" cover phase was retired — playback opens
// directly on Scene 1 because the catalog + landing surfaces
// already introduce the story with the cover artwork.
// ============================================================


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Pause, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/profile";
import type { StoryRow, StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { recordStoryProgress, completeStory } from "@/lib/stories/progress";
import type { StorySummary } from "@/lib/stories/summary";
import { SegmentedProgress } from "./SegmentedProgress";
import { SceneStage, resolveSceneTransition } from "./sceneLayouts";

import { RewardMoment } from "./RewardMoment";
import { ContinueYourJourney } from "./ContinueYourJourney";
import { sceneDwellMs } from "./timing";
import { guestHasCompleted, guestMarkCompleted } from "@/lib/stories/guestCompletions";

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

type Phase = "playing" | "reward" | "journey";



export function StoryPlayer({
  story, scenes, media, summary, initialSceneIndex, alreadyCompleted, onExit,
}: Props) {
  const ordered = useMemo(
    () => [...scenes].sort((a, b) => a.scene_index - b.scene_index),
    [scenes],
  );

  const [phase, setPhase] = useState<Phase>("playing");
  const [idx, setIdx] = useState(Math.min(initialSceneIndex, Math.max(0, ordered.length - 1)));
  const [paused, setPaused] = useState(false);
  const [rewardShown, setRewardShown] = useState(false);
  const [grantedXp, setGrantedXp] = useState<number | null>(null);
  const [grantedDinars, setGrantedDinars] = useState<number | null>(null);
  const completionFiredRef = useRef(false);
  const navigate = useNavigate();
  const { profile, addPoints, addDinars } = useProfile();
  const isGuest = !profile.loggedIn;

  const queryClient = useQueryClient();

  const scene = ordered[idx] ?? null;
  const dwellMs = useMemo(() => scene ? sceneDwellMs(scene) : 4000, [scene]);
  const autoAdvance = scene ? scene.scene_type !== "reflection" : false;
  const isReflectionScene = scene?.scene_type === "reflection";

  // Reference (silences unused-var lint) — media/summary still consumed downstream.
  void media; void summary; void navigate;


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

  // --- Sync long-press halo with pause state ---------------------
  useEffect(() => { if (!paused) setLongPressPulse(false); }, [paused]);



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
      // Sticky one-shot completion; server dedupes and returns the
      // authoritative granted reward. Apply to the local profile so
      // the HUD reflects the new balance immediately without waiting
      // for the next cloud reconciliation cycle.
      setPhase("reward");
      if (completionFiredRef.current) return;
      completionFiredRef.current = true;
      const res = await completeStory(story.id);
      const grantXp = res.result?.reward_granted_xp ?? 0;
      const grantDin = res.result?.reward_granted_dinars ?? 0;
      setGrantedXp(grantXp);
      setGrantedDinars(grantDin);
      if (grantXp > 0) addPoints(grantXp);
      if (grantDin > 0) addDinars(grantDin);
      return;
    }
    setIdx((n) => Math.min(n + 1, ordered.length - 1));
  }, [isLast, ordered.length, scene, story.id, addPoints, addDinars]);

  const goPrev = useCallback(() => {
    setIdx((n) => Math.max(0, n - 1));
  }, []);

  // --- Gesture layer: tap zones, long-press, swipe-down ----------
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  // Ephemeral touch-feedback marker — a subtle radial flash placed
  // at the tap point acknowledging the interaction.
  const [tapFlash, setTapFlash] = useState<{ x: number; y: number; kind: "next" | "prev" | "toggle"; key: number } | null>(null);
  const [longPressPulse, setLongPressPulse] = useState(false);

  const flashAt = (x: number, y: number, kind: "next" | "prev" | "toggle") => {
    setTapFlash({ x, y, kind, key: performance.now() });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== "playing") return;
    if (isReflectionScene) return; // reflection scenes own their own input
    touchRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setPaused(true);
      setLongPressPulse(true);
    }, 350);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    const start = touchRef.current;
    touchRef.current = null;
    if (isReflectionScene && phase === "playing") return; // ignore taps on reflection scene
    if (paused) { setPaused(false); setLongPressPulse(false); return; }

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
    if (phase !== "playing") return;

    const w = (e.currentTarget as HTMLElement).clientWidth;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zoneRight = e.clientX - rect.left;
    // RTL: left side = next; right side = previous.
    if (zoneRight < w * 0.25) { flashAt(e.clientX - rect.left, e.clientY - rect.top, "next"); void goNext(); }
    else if (zoneRight > w * 0.75) { flashAt(e.clientX - rect.left, e.clientY - rect.top, "prev"); goPrev(); }
    else { flashAt(e.clientX - rect.left, e.clientY - rect.top, "toggle"); setPaused((p) => !p); }
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

  const progressEpoch = `s${idx}`;
  // Suppress unused warnings — subtitle/era live on the intro layer that
  // was retired; kept as intentional void reference for future overlays.
  void story.era;


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
          activeIndex={idx}
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

      {/* Touch feedback — subtle radial flash at tap point + pause halo. */}
      <TapFeedback flash={tapFlash} />
      <PauseHalo active={longPressPulse && paused && phase === "playing"} />



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
      {phase === "reward" && !rewardShown && (() => {
        // Prefer authoritative granted values from the RPC when known.
        // Fall back to summary while the network request is in-flight so
        // the reward moment never blanks out on first-completion.
        const xp = grantedXp !== null
          ? grantedXp
          : (alreadyCompleted ? 0 : (summary?.xp_reward ?? story.xp_reward ?? 0));
        const din = grantedDinars !== null
          ? grantedDinars
          : (alreadyCompleted ? 0 : (summary?.dinar_reward ?? story.dinar_reward ?? 0));
        const silent = alreadyCompleted || (grantedXp === 0 && grantedDinars === 0);
        return (
          <RewardMoment
            xp={xp}
            dinars={din}
            silent={silent}
            onDone={() => { setRewardShown(true); setPhase("journey"); }}
          />
        );
      })()}


      {/* Continue Your Journey */}
      {phase === "journey" && (
        <ContinueYourJourney
          finished={summary}
          onReplay={() => {
            setIdx(0);
            setRewardShown(false);
            setGrantedXp(null);
            setGrantedDinars(null);
            completionFiredRef.current = false;
            setPhase("intro");
          }}

          onClose={() => onExit()}
        />
      )}

      {/* Reflection hint / journey-ending affordance —
          reflection scenes disable auto-advance so the reader must
          tap to leave. The last scene gets an emotional "closing"
          treatment (خاتمة) instead of a generic نص button. */}
      {phase === "playing" && scene?.scene_type === "reflection" && !paused && (
        isLast ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void goNext(); }}
            className="pointer-events-auto absolute inset-x-0 bottom-8 z-20 mx-auto flex w-max items-center gap-2 rounded-full border border-gold/60 bg-gradient-to-b from-black/70 to-black/40 px-6 py-3 text-[13px] font-semibold tracking-[0.24em] text-gold backdrop-blur"
            style={{
              boxShadow: "0 0 30px rgba(240,190,60,0.25), inset 0 0 0 1px rgba(240,190,60,0.15)",
              animation: "endpulse 2.6s ease-in-out infinite",
            }}
          >
            اختم الرحلة
            <style>{`@keyframes endpulse { 0%,100%{ box-shadow: 0 0 22px rgba(240,190,60,0.22), inset 0 0 0 1px rgba(240,190,60,0.15);} 50%{ box-shadow: 0 0 42px rgba(240,190,60,0.42), inset 0 0 0 1px rgba(240,190,60,0.3);} }`}</style>
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void goNext(); }}
            className="pointer-events-auto absolute inset-x-0 bottom-6 z-20 mx-auto w-max rounded-full border border-gold/40 bg-black/60 px-4 py-2 text-[12px] text-gold backdrop-blur"
          >
            متابعة
          </button>
        )
      )}
    </div>
  );
}

/** Wraps the stage in a per-scene transition animation.
 *  Honors `payload.transition` when set (dissolve|blur|paper|calm|cut).
 */
function TransitionShell({ scene, children }: { scene: StorySceneRow; children: React.ReactNode }) {
  const t = resolveSceneTransition(scene);
  const cls = `anim-${t}`;
  return (
    <div key={scene.id} className={`absolute inset-0 ${cls}`}>
      <style>{`
        .anim-dissolve { animation: sc-dissolve 520ms cubic-bezier(0.16,1,0.3,1) both; }
        .anim-paper    { animation: sc-paper 620ms cubic-bezier(0.2,0.9,0.3,1) both; }
        .anim-blur     { animation: sc-blur 680ms cubic-bezier(0.16,1,0.3,1) both; }
        .anim-calm     { animation: sc-calm 820ms cubic-bezier(0.22,0.61,0.36,1) both; }
        .anim-cut      { animation: none; }
        @keyframes sc-dissolve { from { opacity: 0; transform: scale(1.015);} to { opacity: 1; transform: scale(1);} }
        @keyframes sc-paper    { from { opacity: 0; transform: translateY(24px) rotate(-0.6deg);} to { opacity: 1; transform: translateY(0) rotate(0);} }
        @keyframes sc-blur     { from { opacity: 0; filter: blur(14px);} to { opacity: 1; filter: blur(0);} }
        @keyframes sc-calm     { from { opacity: 0;} to { opacity: 1;} }
      `}</style>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------
// Touch feedback primitives — subtle, never flashy.
// ---------------------------------------------------------------

function TapFeedback({ flash }: { flash: { x: number; y: number; kind: "next" | "prev" | "toggle"; key: number } | null }) {
  if (!flash) return null;
  const size = flash.kind === "toggle" ? 140 : 200;
  const tint =
    flash.kind === "toggle"
      ? "rgba(255,255,255,0.18)"
      : "rgba(240,190,60,0.22)";
  return (
    <span
      key={flash.key}
      className="pointer-events-none absolute z-[25] rounded-full"
      style={{
        left: flash.x - size / 2,
        top: flash.y - size / 2,
        width: size,
        height: size,
        background: `radial-gradient(circle, ${tint} 0%, rgba(0,0,0,0) 70%)`,
        animation: "tap-flash 420ms cubic-bezier(0.22,0.61,0.36,1) forwards",
      }}
      aria-hidden
    >
      <style>{`@keyframes tap-flash { from { opacity: 0.9; transform: scale(0.6);} to { opacity: 0; transform: scale(1);} }`}</style>
    </span>
  );
}

function PauseHalo({ active }: { active: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[24] transition-opacity duration-500 ease-out"
      style={{
        opacity: active ? 1 : 0,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)",
      }}
      aria-hidden
    />
  );
}


