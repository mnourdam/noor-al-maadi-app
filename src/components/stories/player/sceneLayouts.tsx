// ============================================================
// SceneStage — routes each scene to one of six cinematic layouts.
// Layout choice: scene_type → default; `payload.template` may
// override with "quote" | "map".
// ============================================================

import { useMemo } from "react";
import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { useStoryMediaUrl } from "@/lib/stories/media/url";
import { KenBurns } from "./KenBurns";
import { SentenceReveal } from "./SentenceReveal";
import { splitSentences } from "./timing";
import { FileText, Sparkles } from "lucide-react";

interface StageProps {
  scene: StorySceneRow;
  media: StoryMediaRow[];
  epoch: string | number;
  paused?: boolean;
  onReflectionSubmit?: (text: string) => Promise<void> | void;
}

type LayoutKey = "A" | "B" | "C" | "D" | "E" | "F";

function pickLayout(scene: StorySceneRow): LayoutKey {
  const p = scene.payload as Record<string, unknown> | null | undefined;
  const tpl = typeof p?.["template"] === "string" ? (p!["template"] as string) : null;
  if (tpl === "quote") return "F";
  if (tpl === "map") return "E";
  switch (scene.scene_type) {
    case "reading": return "A";
    case "perspective": return "B";
    case "reveal": return "C";
    case "document": return "D";
    case "reflection": return "F";
    default: return "A";
  }
}

/**
 * Resolve the transition class for a scene.
 * Honors `payload.transition` when it is a known value, otherwise falls back
 * to a scene-type default. Returned as one of the `.anim-*` class names used
 * by TransitionShell in StoryPlayer.
 */
export type SceneTransition = "dissolve" | "blur" | "paper" | "calm" | "cut";
const KNOWN_TRANSITIONS: SceneTransition[] = ["dissolve", "blur", "paper", "calm", "cut"];
export function resolveSceneTransition(scene: StorySceneRow): SceneTransition {
  const raw = (scene.payload as any)?.transition;
  if (typeof raw === "string" && (KNOWN_TRANSITIONS as string[]).includes(raw)) {
    return raw as SceneTransition;
  }
  switch (scene.scene_type) {
    case "document":   return "paper";
    case "reveal":     return "blur";
    case "reflection": return "calm";
    default:           return "dissolve";
  }
}

/** Small, quiet source/citation line rendered below narrative body. */
function Caption({ text, align = "start" }: { text: string; align?: "start" | "center" }) {
  if (!text.trim()) return null;
  return (
    <p
      className={`mt-3 text-[10px] leading-relaxed tracking-wide text-white/55 ${
        align === "center" ? "text-center" : ""
      }`}
      style={{ fontStyle: "italic" }}
    >
      — {text}
    </p>
  );
}


function pickMedia(id: string | null, media: StoryMediaRow[]) {
  if (!id) return null;
  return media.find((m) => m.id === id) ?? null;
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }

export function SceneStage({ scene, media, epoch, paused, onReflectionSubmit }: StageProps) {
  const layout = pickLayout(scene);
  const primary = pickMedia(scene.primary_media_id, media);
  const primaryUrl = useStoryMediaUrl(primary ?? null);

  const sentences = useMemo(() => {
    const p = scene.payload as Record<string, unknown> | null | undefined;
    const primaryText =
      str(p?.["body_ar"]) || str(p?.["body"]) ||
      str(p?.["quote_ar"]) || str(p?.["quote"]) ||
      str(p?.["truth_ar"]) || str(p?.["truth"]) ||
      str(p?.["caption_ar"]) || str(p?.["caption"]);
    if (Array.isArray(p?.["body_ar"])) {
      return (p!["body_ar"] as unknown[]).flatMap((x) =>
        typeof x === "string" ? splitSentences(x) : [],
      );
    }
    return splitSentences(primaryText);
  }, [scene]);

  const title = scene.title_ar ?? "";

  if (layout === "A") {
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={title} seed={scene.id} />
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[calc(env(safe-area-inset-bottom)+72px)] pt-16">
          {title && (
            <h2 className="mb-3 font-display text-2xl font-bold leading-tight text-white drop-shadow">
              {title}
            </h2>
          )}
          <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "B") {
    const speaker = str((scene.payload as any)?.["speaker_ar"] ?? (scene.payload as any)?.["speaker"]);
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={speaker || title} seed={scene.id} blur={8} overlay="vignette" />
        <div className="absolute inset-0 z-10 flex flex-col items-stretch justify-end gap-4 px-6 pb-[calc(env(safe-area-inset-bottom)+72px)] pt-20 sm:flex-row sm:items-center sm:justify-center sm:gap-8 sm:pb-24">
          {primaryUrl && (
            <img
              src={primaryUrl}
              alt={speaker}
              className="mx-auto size-40 flex-none rounded-2xl border border-gold/40 object-cover shadow-2xl sm:size-56"
            />
          )}
          <div className="max-w-md flex-1">
            {speaker && (
              <div className="mb-2 text-[11px] tracking-[0.3em] text-gold/80">{speaker}</div>
            )}
            {title && <h2 className="mb-3 font-display text-xl font-bold text-white">{title}</h2>}
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
          </div>
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "C") {
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={title} seed={scene.id} blur={16} overlay="vignette" />
        <div className="absolute inset-0 z-10 grid place-items-center px-6">
          <div className="max-w-md text-center">
            <Sparkles className="mx-auto mb-4 size-6 text-gold/80" />
            {title && <h2 className="mb-4 font-display text-2xl font-bold text-white">{title}</h2>}
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} className="text-center" />
          </div>
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "D") {
    // Document — dark ambient, framed manuscript, slow zoom on the doc itself
    return (
      <LayoutFrame>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a1206_0%,_#000_75%)]" />
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6 pt-16 pb-[calc(env(safe-area-inset-bottom)+72px)]">
          {primaryUrl ? (
            <div
              className="max-h-[55vh] max-w-[92%] overflow-hidden rounded-md border border-gold/30 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
              style={{ animation: "doc-zoom 14s ease-out both" }}
            >
              <img src={primaryUrl} alt={title} className="max-h-[55vh] w-auto object-contain" />
            </div>
          ) : (
            <div className="grid size-40 place-items-center rounded-md border border-dashed border-gold/40 text-gold/60">
              <FileText className="size-8" />
            </div>
          )}
          <div className="max-w-lg text-center">
            {title && <h2 className="mb-2 font-display text-lg font-bold text-gold">{title}</h2>}
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} className="text-center" />
          </div>
        </div>
        <style>{`@keyframes doc-zoom { 0%{ transform: scale(1.02);} 100%{ transform: scale(1.08);} }`}</style>
      </LayoutFrame>
    );
  }

  if (layout === "E") {
    // Map reveal — canvas sweep + ken burns
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={title} seed={scene.id} overlay="bottom-fade" />
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 60%)",
            animation: "map-sweep 2.4s ease-out both",
          }}
        />
        <style>{`@keyframes map-sweep { 0%{ transform: translateX(0);} 100%{ transform: translateX(-100%);} }`}</style>
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[calc(env(safe-area-inset-bottom)+72px)] pt-14">
          {title && <h2 className="mb-3 font-display text-2xl font-bold text-white">{title}</h2>}
          <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
        </div>
      </LayoutFrame>
    );
  }

  // Layout F — minimal quote / reflection composition
  const prompt = str((scene.payload as any)?.["prompt_ar"] ?? (scene.payload as any)?.["prompt"]);
  const composed = sentences.length > 0
    ? sentences
    : (prompt ? [prompt] : (title ? [title] : []));
  return (
    <LayoutFrame>
      <div className="absolute inset-0 bg-gradient-to-b from-black via-neutral-950 to-black" />
      {primaryUrl && (
        <img
          src={primaryUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          style={{ filter: "blur(20px)" }}
        />
      )}
      <div className="absolute inset-0 z-10 grid place-items-center px-8">
        <div className="max-w-md text-center">
          <div className="mb-6 text-5xl leading-none text-gold/60" aria-hidden>»</div>
          <SentenceReveal
            sentences={composed}
            epoch={epoch}
            paused={paused}
            className="text-center [&_p]:text-[18px] [&_p]:leading-[2] [&_p]:font-display"
          />
          {scene.scene_type === "reflection" && onReflectionSubmit && (
            <div className="mt-6">
              <ReflectionInline onSubmit={onReflectionSubmit} />
            </div>
          )}
        </div>
      </div>
    </LayoutFrame>
  );
}

function LayoutFrame({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 overflow-hidden">{children}</div>;
}

// ------------------------------------------------------------------
import { useState } from "react";
function ReflectionInline({ onSubmit }: { onSubmit: (t: string) => Promise<void> | void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onSubmit(text.trim()); setSaved(true); }
    finally { setBusy(false); }
  };
  return (
    <div dir="rtl" className="rounded-xl border border-gold/25 bg-black/40 p-3 backdrop-blur">
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        rows={3}
        placeholder="اكتب تأمّلك…"
        className="w-full resize-none rounded-md border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-white/60">
          {saved ? "تم الحفظ ✓" : "خاص بك — يُحفظ في تأمّلاتك."}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void submit(); }}
          disabled={busy || !text.trim()}
          className="rounded-full bg-gold px-3 py-1 text-[12px] font-bold text-black disabled:opacity-40"
        >
          {busy ? "..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}
