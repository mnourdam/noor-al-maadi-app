// ============================================================
// SceneExportButton — "حمّل المشهد" affordance
// ------------------------------------------------------------
// Pauses playback, renders the scene into a standalone 1080×1920
// card (see lib/stories/export/sceneCard) and hands it to the
// share sheet / download path. Playback resumes exactly where it
// stopped. A busy ref plus the shareService job guard make
// repeated taps produce exactly one image.
// ============================================================

import { useCallback, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { renderSceneCard } from "@/lib/stories/export/sceneCard";
import { shareImage } from "@/lib/share/shareService";

export function SceneExportButton({
  scene,
  media,
  storyTitle,
  onPause,
  onResume,
  className,
}: {
  scene: StorySceneRow;
  media: StoryMediaRow[];
  storyTitle?: string;
  /** Called before rendering starts. */
  onPause?: () => void;
  /** Called once the share sheet resolves (or on failure). */
  onResume?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onPause?.();
    try {
      const blob = await renderSceneCard({ scene, media });
      if (!blob) {
        toast.error("تعذّر توليد صورة المشهد");
        return;
      }
      await shareImage({
        jobId: `story-scene-card-${scene.id}`,
        blob,
        filename: `irth-scene-${scene.scene_index + 1}.png`,
        title: storyTitle ?? "إرث",
        text: storyTitle ?? "إرث",
      });
    } catch {
      toast.error("تعذّر توليد صورة المشهد");
    } finally {
      busyRef.current = false;
      setBusy(false);
      onResume?.();
    }
  }, [scene, media, storyTitle, onPause, onResume]);

  return (
    <button
      type="button"
      aria-label="تحميل المشهد"
      disabled={busy}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void run();
      }}
      className={`pointer-events-auto grid size-9 place-items-center rounded-full border border-gold/30 bg-black/50 text-gold backdrop-blur disabled:opacity-60 ${className ?? ""}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
    </button>
  );
}
