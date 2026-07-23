// ============================================================
// Shared scene renderer — the ONLY renderer for story scenes.
// ------------------------------------------------------------
// Used by:
//   * Admin editor "Live Preview" panel
//   * /story/$id player runtime
//
// Every scene type gets a small, self-contained renderer that
// reads `payload` and (optionally) `primary_media_id`. The
// contract is intentionally forgiving: unknown payload keys are
// ignored so content can evolve without breaking older stories.
// ============================================================

import type { StorySceneRow, StorySceneType } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { StoryMediaImage } from "../StoryMediaImage";
import { BookOpenText, Eye, FileText, Sparkles, MessageCircleHeart } from "lucide-react";

interface Props {
  scene: StorySceneRow;
  media: StoryMediaRow[];
  onReflectionSubmit?: (text: string) => Promise<void> | void;
}

const TYPE_ICON: Record<StorySceneType, typeof BookOpenText> = {
  reading: BookOpenText,
  perspective: Eye,
  document: FileText,
  reveal: Sparkles,
  reflection: MessageCircleHeart,
};

const TYPE_LABEL: Record<StorySceneType, string> = {
  reading: "قراءة",
  perspective: "منظور",
  document: "وثيقة",
  reveal: "كشف",
  reflection: "تأمل",
};

function pickMedia(id: string | null, media: StoryMediaRow[]) {
  if (!id) return null;
  return media.find((m) => m.id === id) ?? null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function paragraphs(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return v.split(/\n{2,}/g).map((s) => s.trim()).filter(Boolean);
  return [];
}

export function SceneRenderer({ scene, media, onReflectionSubmit }: Props) {
  const Icon = TYPE_ICON[scene.scene_type];
  const primary = pickMedia(scene.primary_media_id, media);

  return (
    <article dir="rtl" className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{TYPE_LABEL[scene.scene_type]}</span>
        <span className="opacity-50">·</span>
        <span>مشهد #{scene.scene_index + 1}</span>
      </header>

      {scene.title_ar && (
        <h1 className="font-display text-2xl font-bold leading-tight">{scene.title_ar}</h1>
      )}

      {scene.scene_type === "reading" && <Reading scene={scene} media={primary} />}
      {scene.scene_type === "perspective" && <Perspective scene={scene} media={primary} />}
      {scene.scene_type === "document" && <DocumentScene scene={scene} media={primary} />}
      {scene.scene_type === "reveal" && <Reveal scene={scene} media={primary} />}
      {scene.scene_type === "reflection" && (
        <Reflection scene={scene} onSubmit={onReflectionSubmit} />
      )}
    </article>
  );
}

// ------------------------------------------------------------------
function Reading({ scene, media }: { scene: StorySceneRow; media: StoryMediaRow | null }) {
  const paras = paragraphs(scene.payload?.["body_ar"] ?? scene.payload?.["body"]);
  return (
    <div className="space-y-3">
      {media && (
        <StoryMediaImage
          media={media}
          alt={scene.title_ar ?? ""}
          className="w-full rounded-lg border object-cover"
        />
      )}
      {paras.length > 0 ? (
        paras.map((p, i) => (
          <p key={i} className="text-base leading-relaxed">{p}</p>
        ))
      ) : (
        <EmptyBody />
      )}
    </div>
  );
}

function Perspective({ scene, media }: { scene: StorySceneRow; media: StoryMediaRow | null }) {
  const speaker = str(scene.payload?.["speaker_ar"] ?? scene.payload?.["speaker"]);
  const quote = str(scene.payload?.["quote_ar"] ?? scene.payload?.["quote"]);
  return (
    <div className="space-y-3">
      {media && (
        <StoryMediaImage
          media={media}
          alt={speaker}
          className="mx-auto w-32 rounded-full border object-cover"
        />
      )}
      {speaker && <div className="text-center text-sm font-semibold text-primary">{speaker}</div>}
      {quote ? (
        <blockquote className="rounded-lg border-r-4 border-primary bg-muted/40 p-4 text-lg italic leading-relaxed">
          «{quote}»
        </blockquote>
      ) : <EmptyBody />}
    </div>
  );
}

function DocumentScene({ scene, media }: { scene: StorySceneRow; media: StoryMediaRow | null }) {
  const caption = str(scene.payload?.["caption_ar"] ?? scene.payload?.["caption"]);
  const transcript = str(scene.payload?.["transcript_ar"] ?? scene.payload?.["transcript"]);
  return (
    <div className="space-y-3">
      {media ? (
        <StoryMediaImage
          media={media}
          alt={caption || (scene.title_ar ?? "وثيقة")}
          className="w-full rounded-lg border object-contain"
        />
      ) : <EmptyBody label="لم يتم رفع الوثيقة بعد." />}
      {caption && <div className="text-sm text-muted-foreground">{caption}</div>}
      {transcript && (
        <details className="rounded-md border bg-muted/40 p-3 text-sm">
          <summary className="cursor-pointer font-medium">النص المكتوب</summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed">{transcript}</p>
        </details>
      )}
    </div>
  );
}

function Reveal({ scene, media }: { scene: StorySceneRow; media: StoryMediaRow | null }) {
  const claim = str(scene.payload?.["claim_ar"] ?? scene.payload?.["claim"]);
  const truth = str(scene.payload?.["truth_ar"] ?? scene.payload?.["truth"]);
  return (
    <div className="space-y-3">
      {media && (
        <StoryMediaImage
          media={media}
          alt={scene.title_ar ?? ""}
          className="w-full rounded-lg border object-cover"
        />
      )}
      {claim && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-amber-700">الادعاء</div>
          <p>{claim}</p>
        </div>
      )}
      {truth ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
          <div className="mb-1 text-xs font-medium text-emerald-700">الحقيقة</div>
          <p className="leading-relaxed">{truth}</p>
        </div>
      ) : <EmptyBody />}
    </div>
  );
}

function Reflection({
  scene,
  onSubmit,
}: {
  scene: StorySceneRow;
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  const prompt = str(scene.payload?.["prompt_ar"] ?? scene.payload?.["prompt"]);
  return (
    <ReflectionForm
      prompt={prompt || "شارك تأمّلك حول هذا المشهد."}
      onSubmit={onSubmit}
    />
  );
}

// Local form so we can keep the renderer pure. Uses a hook, but only for
// this leaf component. Import kept inline to keep the module cohesive.
import { useState } from "react";
function ReflectionForm({
  prompt,
  onSubmit,
}: {
  prompt: string;
  onSubmit?: (text: string) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const submit = async () => {
    if (!text.trim() || !onSubmit) return;
    setBusy(true);
    try { await onSubmit(text.trim()); setSaved(true); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <p className="text-base font-medium">{prompt}</p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        rows={4}
        placeholder="اكتب تأمّلك هنا..."
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {saved ? "تم الحفظ في مذكرتك ✓" : "خاص بك، يُحفظ في مذكرة التأملات."}
        </div>
        <button
          onClick={() => void submit()}
          disabled={!onSubmit || busy || !text.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
        >
          {busy ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}

function EmptyBody({ label = "لا يوجد محتوى بعد." }: { label?: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
