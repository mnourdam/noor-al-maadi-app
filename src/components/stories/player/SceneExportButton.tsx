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
import {
  renderSceneCard,
  SceneCardError,
  type SceneCardStage,
} from "@/lib/stories/export/sceneCard";
import { shareImage, downloadImage } from "@/lib/share/shareService";

/** Arabic, player-facing message per failing stage. */
function stageMessage(stage: SceneCardStage | "share"): string {
  switch (stage) {
    case "resolve-image":
    case "load-image":
      return "تعذّر تحميل صورة المشهد — تأكد من الاتصال ثم حاول مجددًا";
    case "encode":
      return "تعذّر توليد صورة المشهد على هذا الجهاز";
    case "share":
      return "تعذّرت مشاركة الصورة — حاول مجددًا";
    default:
      return "تعذّر توليد صورة المشهد — حاول مجددًا";
  }
}


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
    let stage: SceneCardStage | "share" = "fonts";
    try {
      // Hard ceiling for the whole pipeline — the spinner can never hang.
      const OVERALL_MS = 25_000;
      const blob = await Promise.race([
        renderSceneCard({ scene, media, onStage: (s) => { stage = s; } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new SceneCardError(stage as SceneCardStage, "timeout")), OVERALL_MS),
        ),
      ]);
      if (!blob) throw new SceneCardError("encode", "no blob");

      stage = "share";
      const filename = `irth-scene-${scene.scene_index + 1}.png`;
      const res = await shareImage({
        jobId: `story-scene-card-${scene.id}`,
        blob,
        filename,
        title: storyTitle ?? "إرث",
        text: storyTitle ?? "إرث",
      });
      // Share unavailable / failed → direct download fallback.
      if (res.status === "failed") {
        const dl = await downloadImage({
          jobId: `story-scene-card-dl-${scene.id}`,
          blob,
          filename,
        });
        if (dl.status === "failed") {
          toast.error("تعذّر حفظ الصورة — حاول مجددًا");
        }
      }
    } catch (err) {
      console.warn("[scene-card] export failed at stage:", stage, err);
      toast.error(stageMessage(stage));
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
