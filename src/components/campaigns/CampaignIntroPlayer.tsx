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
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { SceneStage } from "@/components/stories/player/sceneLayouts";
import { SegmentedProgress } from "@/components/stories/player/SegmentedProgress";
import { sceneDwellMs } from "@/components/stories/player/timing";
import { loadCampaignIntroBundle } from "@/lib/campaigns/intro/offline";
import { introDebug } from "@/lib/campaigns/intro/debug";
import type { CampaignIntroRef } from "@/lib/campaigns/intro/types";
import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";

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
  const [idx, setIdx] = useState(0);
  const resolvedRef = useRef(false);

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

  const scene = scenes?.[idx] ?? null;
  const dwellMs = useMemo(() => (scene ? sceneDwellMs(scene) : 4000), [scene]);

  const advance = useCallback(() => {
    setIdx((i) => {
      const total = scenes?.length ?? 0;
      if (i + 1 >= total) {
        finish("complete");
        return i;
      }
      return i + 1;
    });
  }, [scenes, finish]);

  // --- Auto-advance ---------------------------------------------
  useEffect(() => {
    if (!scene) return;
    const t = window.setTimeout(advance, dwellMs);
    return () => window.clearTimeout(t);
  }, [scene, dwellMs, advance]);

  if (!scenes || !scene) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black" dir="rtl">
      <button
        type="button"
        aria-label="التالي"
        className="absolute inset-0 z-10"
        onClick={advance}
      />

      <SceneStage scene={scene} media={media} epoch={scene.id} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[calc(env(safe-area-inset-top)+10px)]">
        <SegmentedProgress
          total={scenes.length}
          activeIndex={idx}
          activeMs={dwellMs}
          epoch={scene.id}
        />
      </div>

      <button
        type="button"
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
