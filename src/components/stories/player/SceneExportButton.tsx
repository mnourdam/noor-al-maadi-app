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
    
    // Feature Flag / Environment Guard
    const isAndroid = typeof window !== "undefined" && (window as any).Capacitor?.getPlatform() === "android";
    const EXPORT_BUILD_VERSION = 4;
    
    console.log(`[IrthExport] click EXPORT_BUILD_VERSION=${EXPORT_BUILD_VERSION} isAndroid=${isAndroid}`);

    busyRef.current = true;
    setBusy(true);
    onPause?.();
    let stage: SceneCardStage | "share" | "save" = "fonts";
    
    try {
      // 1. Scene Card Generation
      const OVERALL_MS = 20_000;
      const blob = await Promise.race([
        renderSceneCard({ scene, media, onStage: (s) => { 
          stage = s;
          console.log(`[IrthExport] stage=${s}`);
        } }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), OVERALL_MS),
        ),
      ]);

      if (!blob) throw new Error("ENCODE_FAILED");
      console.log(`[IrthExport] blob_ready size=${blob.size}`);

      // 2. Android Native Path (Primary)
      if (isAndroid) {
        stage = "save";
        console.log(`[IrthExport] android_start_save`);
        const filename = `irth-scene-${scene.scene_index + 1}.png`;
        
        // Convert blob to base64 for native bridge
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const base64Data = await base64Promise;

        // Use Capacitor Filesystem + Share
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");

        const saveResult = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });

        console.log(`[IrthExport] android_save_ok uri=${saveResult.uri}`);
        
        await Share.share({
          title: storyTitle ?? "إرث",
          text: storyTitle ?? "إرث",
          url: saveResult.uri,
        });
        
        console.log(`[IrthExport] android_share_dispatched`);
      } else {
        // 3. Browser Path
        stage = "share";
        const filename = `irth-scene-${scene.scene_index + 1}.png`;
        const res = await shareImage({
          jobId: `story-scene-card-${scene.id}`,
          blob,
          filename,
          title: storyTitle ?? "إرث",
          text: storyTitle ?? "إرث",
        });
        if (res.status === "failed") {
          await downloadImage({
            jobId: `story-scene-card-dl-${scene.id}`,
            blob,
            filename,
          });
        }
      }
    } catch (err: any) {
      console.error(`[IrthExport] error stage=${stage}`, err);
      if (isAndroid) {
        toast.error(`تعذّر تصدير المشهد على هذا الجهاز حالياً (${stage})`);
      } else {
        toast.error(stageMessage(stage as any));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      onResume?.();
      console.log(`[IrthExport] finished`);
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
