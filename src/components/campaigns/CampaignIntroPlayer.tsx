// ============================================================
// CampaignIntroPlayer — passive cinematic intro (pilot)
// ------------------------------------------------------------
// Plays the authored intro story from the OFFLINE bundle only.
//  * No rewards, no progress writes, no completion records — the
//    intro is not a story the player "finishes"; it is an opening.
//  * No audio ownership: the surrounding CampaignAudioScope owns
//    the ambience; this component never touches audioManager.
//  * Any load failure resolves as "skip" so the campaign always
//    opens — an intro can never block gameplay.
//
// Interaction (Post-Freeze pass): hold-to-pause, RTL tap zones
// (right = previous, left = next), swipe (→ next, ← previous)
// and a fade transition between every scene. All of it lives in
// the pure `IntroPlaybackMachine`; this file only renders it.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { SceneStage } from "@/components/stories/player/sceneLayouts";
import { SegmentedProgress } from "@/components/stories/player/SegmentedProgress";
import { sceneDwellMs } from "@/components/stories/player/timing";
import { loadCampaignIntroBundle } from "@/lib/campaigns/intro/offline";
import { introDebug } from "@/lib/campaigns/intro/debug";
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  IntroPlaybackMachine,
  REDUCED_FADE_MS,
  type IntroSnapshot,
} from "@/lib/campaigns/intro/interaction";
import { signStoryMediaUrl } from "@/lib/stories/media/url";
import type { CampaignIntroRef } from "@/lib/campaigns/intro/types";
import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

export function CampaignIntroPlayer({
  intro,
  onComplete,
  onSkip,
}: {
  intro: CampaignIntroRef;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [scenes, setScenes] = useState<StorySceneRow[] | null>(null);
  const [media, setMedia] = useState<StoryMediaRow[]>([]);
  const [snap, setSnap] = useState<IntroSnapshot>({
    state: "playing",
    index: 0,
    opacity: 1,
    paused: false,
    transitioning: false,
  });
  const resolvedRef = useRef(false);
  const machineRef = useRef<IntroPlaybackMachine | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const finish = useCallback(
    (how: "complete" | "skip") => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      introDebug(`player:${how}`, { campaignId: intro.campaignId });
      if (how === "complete") onComplete();
      else onSkip();
    },
    [intro.campaignId, onComplete, onSkip],
  );

  // --- Load the offline bundle (never a network call) -----------
  useEffect(() => {
    let alive = true;
    void (async () => {
      const bundle = await loadCampaignIntroBundle(intro);
      if (!alive) return;
      const rows = (bundle?.scenes ?? []) as unknown as StorySceneRow[];
      if (!bundle || rows.length === 0) {
        finish("skip"); // assets unavailable ⇒ start the campaign directly
        return;
      }
      setMedia((bundle.media ?? []) as unknown as StoryMediaRow[]);
      setScenes(rows);
    })();
    return () => {
      alive = false;
    };
  }, [intro, finish]);

  // --- Playback machine ------------------------------------------
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;
    const machine = new IntroPlaybackMachine({
      total: scenes.length,
      reducedMotion,
      dwellMsFor: (i) => (scenes[i] ? sceneDwellMs(scenes[i]) : 4000),
      onComplete: () => finish("complete"),
      onChange: (s) => setSnap(s),
    });
    machineRef.current = machine;
    machine.start();
    setSnap(machine.getSnapshot());
    return () => {
      machine.destroy();
      machineRef.current = null;
    };
  }, [scenes, reducedMotion, finish]);

  const scene = scenes?.[snap.index] ?? null;
  const dwellMs = useMemo(() => (scene ? sceneDwellMs(scene) : 4000), [scene]);

  // --- Preload the neighbouring scene artwork --------------------
  useEffect(() => {
    if (!scenes || typeof window === "undefined") return;
    let alive = true;
    for (const i of [snap.index + 1, snap.index - 1]) {
      const target = scenes[i];
      if (!target?.primary_media_id) continue;
      const row = media.find((m) => m.id === target.primary_media_id);
      if (!row) continue;
      void signStoryMediaUrl(row).then((url) => {
        if (!alive || !url) return;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      });
    }
    return () => {
      alive = false;
    };
  }, [scenes, media, snap.index]);

  // --- Pointer handling (unified: no touch + mouse duplication) ---
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    machineRef.current?.pointerDown(e.clientX);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    machineRef.current?.pointerMove(e.clientX);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const width = surfaceRef.current?.clientWidth ?? window.innerWidth;
    machineRef.current?.pointerUp(e.clientX, width);
  }, []);
  const onPointerCancel = useCallback(() => {
    machineRef.current?.pointerCancel();
  }, []);

  if (!scenes || !scene) return null;

  const fadeMs = reducedMotion
    ? REDUCED_FADE_MS
    : snap.opacity === 0
      ? FADE_OUT_MS
      : FADE_IN_MS;

  const noSelect: React.CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    // @ts-expect-error vendor property, not in React's CSS typings
    WebkitTouchCallout: "none",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <div
      className="fixed inset-0 z-[200] select-none bg-black"
      dir="rtl"
      style={noSelect}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        data-testid="intro-fade-layer"
        className="pointer-events-none absolute inset-0 select-none"
        style={{
          ...noSelect,
          opacity: snap.opacity,
          transition: `opacity ${fadeMs}ms ease-in-out`,
        }}
      >
        <SceneStage
          scene={scene}
          media={media}
          epoch={scene.id}
          paused={snap.paused || snap.transitioning}
        />
      </div>

      {/* Interaction surface: sits ABOVE every scene layer so a long
          press anywhere — artwork, scrim, text box, reveal slide — is a
          pause gesture and never a text selection. */}
      <div
        ref={surfaceRef}
        data-testid="intro-interaction-surface"
        role="presentation"
        className="absolute inset-0 z-20 touch-none select-none"
        style={{ ...noSelect, pointerEvents: snap.transitioning ? "none" : "auto" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />


      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
        <SegmentedProgress
          total={scenes.length}
          activeIndex={snap.index}
          activeMs={dwellMs}
          paused={snap.paused || snap.transitioning}
          epoch={scene.id}
        />
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={() => finish("skip")}
        className="absolute z-30 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-black/55 px-3 py-1.5 text-[11px] font-bold text-gold backdrop-blur-sm"
        style={{
          insetInlineStart: "1rem",
          top: "calc(env(safe-area-inset-top) + 34px)",
        }}
      >
        <SkipForward className="size-3.5" /> تخطي والبدء
      </button>
    </div>
  );
}
