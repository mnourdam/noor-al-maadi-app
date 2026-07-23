// ============================================================
// SceneStage — routes each scene to one of six cinematic layouts.
// Layout choice: scene_type → default; `payload.template` may
// override with "quote" | "map".
// ------------------------------------------------------------
// Phase 4 (typography & readability polish):
//   * Shared primitives (SceneTitle / SceneScrim / SceneReadingColumn /
//     Caption) so layouts A–F feel like one design system, not six.
//   * Reading column clamped to ~34rem so Arabic lines never stretch
//     wall-to-wall on tablets.
//   * Unified title hierarchy — fluid clamp() sizes, tracking, weight.
//   * Stronger bottom scrim behind narrative so body text stays legible
//     over bright artwork without dimming the image.
//   * Quotes (Layout F) rendered as manuscript-style display type with
//     matched opening/closing marks and generous vertical rhythm.
//   * Reflection panel enlarged, softened, and given breathing room so
//     it invites writing rather than resembling a form field.
// ============================================================

import { useMemo, useState } from "react";
import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { useStoryMediaUrl } from "@/lib/stories/media/url";
import { KenBurns } from "./KenBurns";
import { SentenceReveal } from "./SentenceReveal";
import { splitSentences } from "./timing";
import { computeVerticalLift } from "./typography";
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

export type SceneTransition = "dissolve" | "blur" | "paper" | "calm" | "cut";
const KNOWN_TRANSITIONS: SceneTransition[] = ["dissolve", "blur", "paper", "calm", "cut"];

/**
 * Resolve a scene's entry transition.
 *   1. explicit `payload.transition` always wins;
 *   2. reflection/document/reveal keep their signature motion;
 *   3. everything else rotates through dissolve/calm/blur based on
 *      scene_index so a long story never repeats the same transition
 *      three times in a row.
 */
export function resolveSceneTransition(scene: StorySceneRow): SceneTransition {
  const raw = (scene.payload as any)?.transition;
  if (typeof raw === "string" && (KNOWN_TRANSITIONS as string[]).includes(raw)) {
    return raw as SceneTransition;
  }
  switch (scene.scene_type) {
    case "document":   return "paper";
    case "reveal":     return "blur";
    case "reflection": return "calm";
    default: {
      const rotation: SceneTransition[] = ["dissolve", "calm", "dissolve", "blur"];
      return rotation[scene.scene_index % rotation.length];
    }
  }
}

// ------------------------------------------------------------------
// Shared primitives
// ------------------------------------------------------------------

/** Unified title hierarchy across every layout. */
function SceneTitle({
  children,
  align = "start",
  tone = "default",
}: {
  children: React.ReactNode;
  align?: "start" | "center";
  tone?: "default" | "gold";
}) {
  if (!children) return null;
  const alignCls = align === "center" ? "text-center" : "";
  const toneCls = tone === "gold" ? "text-gold" : "text-white";
  return (
    <h2
      className={`mb-4 font-display font-bold leading-[1.2] tracking-tight ${alignCls} ${toneCls}`}
      style={{
        fontSize: "clamp(22px, 5.6vw, 28px)",
        textShadow: "0 2px 14px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </h2>
  );
}

/** Small, quiet source/citation line rendered below narrative body. */
function Caption({ text, align = "start" }: { text: string; align?: "start" | "center" }) {
  if (!text.trim()) return null;
  return (
    <p
      className={`mt-5 border-t border-white/10 pt-3 text-[11px] leading-relaxed tracking-wide text-white/55 ${
        align === "center" ? "text-center" : ""
      }`}
      style={{ fontStyle: "italic" }}
    >
      — {text}
    </p>
  );
}

/**
 * Strong-yet-photographic scrim behind bottom narrative blocks. Keeps
 * text legible over bright imagery without flattening the artwork.
 */
function BottomScrim() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[62%]"
      style={{
        background:
          "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.78) 35%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0) 100%)",
      }}
      aria-hidden
    />
  );
}

/**
 * Comfortable Arabic reading column. Clamps line length so text never
 * stretches wall-to-wall on tablets.
 *   phone  → full padded width
 *   ≥ sm   → ~34rem (about 55–65 Arabic characters)
 */
function SceneReadingColumn({
  children,
  align = "start",
}: {
  children: React.ReactNode;
  align?: "start" | "center";
}) {
  const alignCls = align === "center" ? "mx-auto text-center" : "";
  return (
    <div className={`w-full max-w-[34rem] ${alignCls}`}>{children}</div>
  );
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function pickMedia(id: string | null, media: StoryMediaRow[]) {
  if (!id) return null;
  return media.find((m) => m.id === id) ?? null;
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }

// ------------------------------------------------------------------
// SceneStage
// ------------------------------------------------------------------

export function SceneStage({ scene, media, epoch, paused, onReflectionSubmit }: StageProps) {
  const layout = pickLayout(scene);
  const primary = pickMedia(scene.primary_media_id, media);
  const primaryUrl = useStoryMediaUrl(primary ?? null);

  const sentences = useMemo(() => {
    const p = scene.payload as Record<string, unknown> | null | undefined;
    const primaryText =
      str(p?.["body_ar"]) || str(p?.["body"]) ||
      str(p?.["quote_ar"]) || str(p?.["quote"]) ||
      str(p?.["truth_ar"]) || str(p?.["truth"]);
    if (Array.isArray(p?.["body_ar"])) {
      return (p!["body_ar"] as unknown[]).flatMap((x) =>
        typeof x === "string" ? splitSentences(x) : [],
      );
    }
    return splitSentences(primaryText);
  }, [scene]);

  const title = scene.title_ar ?? "";
  const caption = str((scene.payload as any)?.["caption_ar"] ?? (scene.payload as any)?.["caption"]);

  // Consistent bottom padding for phones with home indicators.
  const bottomPad = "pb-[calc(env(safe-area-inset-bottom)+88px)]";
  // Vertical rebalance — sparse scenes float slightly higher so they
  // never feel glued to the artwork's bottom edge.
  const lift = computeVerticalLift(sentences.length);
  const bottomStyle: React.CSSProperties = {
    paddingBottom: `calc(env(safe-area-inset-bottom) + 88px + ${lift})`,
  };

  if (layout === "A") {
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={title} seed={scene.id} />
        <BottomScrim />
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pt-20 sm:px-10" style={bottomStyle}>
          <SceneReadingColumn>
            <SceneTitle>{title}</SceneTitle>
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
            <Caption text={caption} />
          </SceneReadingColumn>
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "B") {
    const speaker = str((scene.payload as any)?.["speaker_ar"] ?? (scene.payload as any)?.["speaker"]);
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={speaker || title} seed={scene.id} blur={8} overlay="vignette" />
        <BottomScrim />
        <div
          className="absolute inset-0 z-10 flex flex-col items-stretch justify-end gap-5 px-6 pt-20 sm:flex-row sm:items-center sm:justify-center sm:gap-10 sm:px-10 sm:pb-24"
          style={bottomStyle}
        >
          {primaryUrl && (
            <img
              src={primaryUrl}
              alt={speaker}
              className="mx-auto size-40 flex-none rounded-2xl border border-gold/40 object-cover shadow-2xl sm:size-56"
            />
          )}
          <SceneReadingColumn>
            {speaker && (
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.32em] text-gold/85">
                {speaker}
              </div>
            )}
            <SceneTitle>{title}</SceneTitle>
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
            <Caption text={caption} />
          </SceneReadingColumn>
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "C") {
    return (
      <LayoutFrame>
        <KenBurns src={primaryUrl} alt={title} seed={scene.id} blur={16} overlay="vignette" />
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.85) 80%)" }}
          aria-hidden
        />
        <div className="absolute inset-0 z-10 grid place-items-center px-6 sm:px-10">
          <SceneReadingColumn align="center">
            <Sparkles className="mx-auto mb-5 size-6 text-gold/80" />
            <SceneTitle align="center">{title}</SceneTitle>
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} className="text-center" />
            <Caption text={caption} align="center" />
          </SceneReadingColumn>
        </div>
      </LayoutFrame>
    );
  }

  if (layout === "D") {
    // Document — dark ambient, framed manuscript, slow zoom on the doc itself
    return (
      <LayoutFrame>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a1206_0%,_#000_75%)]" />
        <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6 pt-16 ${bottomPad} sm:px-10`}>
          {primaryUrl ? (
            <div
              className="max-h-[52vh] max-w-[92%] overflow-hidden rounded-md border border-gold/30 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
              style={{ animation: "doc-zoom 14s ease-out both" }}
            >
              <img src={primaryUrl} alt={title} className="max-h-[52vh] w-auto object-contain" />
            </div>
          ) : (
            <div className="grid size-40 place-items-center rounded-md border border-dashed border-gold/40 text-gold/60">
              <FileText className="size-8" />
            </div>
          )}
          <SceneReadingColumn align="center">
            <SceneTitle align="center" tone="gold">{title}</SceneTitle>
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} className="text-center" />
            <Caption text={caption} align="center" />
          </SceneReadingColumn>
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
        <BottomScrim />
        <div
          className="pointer-events-none absolute inset-0 z-[6]"
          style={{
            background: "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 60%)",
            animation: "map-sweep 2.4s ease-out both",
          }}
        />
        <style>{`@keyframes map-sweep { 0%{ transform: translateX(0);} 100%{ transform: translateX(-100%);} }`}</style>
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pt-16 sm:px-10" style={bottomStyle}>
          <SceneReadingColumn>
            <SceneTitle>{title}</SceneTitle>
            <SentenceReveal sentences={sentences} epoch={epoch} paused={paused} />
            <Caption text={caption} />
          </SceneReadingColumn>
        </div>
      </LayoutFrame>
    );
  }

  // Layout F — manuscript-style quote / reflection composition
  const prompt = str((scene.payload as any)?.["prompt_ar"] ?? (scene.payload as any)?.["prompt"]);
  const composed = sentences.length > 0
    ? sentences
    : (prompt ? [prompt] : (title ? [title] : []));
  const isReflection = scene.scene_type === "reflection";
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
      <div className={`absolute inset-0 z-10 grid place-items-center px-8 pt-16 ${bottomPad} sm:px-12`}>
        <div className="w-full max-w-[30rem] text-center">
          {title && !isReflection && (
            <div
              className="mb-4 text-[11px] font-medium uppercase tracking-[0.36em] text-gold/70"
            >
              {title}
            </div>
          )}
          <div className="mb-6 select-none text-[56px] leading-none text-gold/50" aria-hidden>
            «
          </div>
          <SentenceReveal
            sentences={composed}
            epoch={epoch}
            paused={paused}
            variant="quote"
            className="text-center"
          />
          <div className="mt-4 select-none text-[40px] leading-none text-gold/40" aria-hidden>
            »
          </div>
          <Caption text={caption} align="center" />
          {isReflection && onReflectionSubmit && (
            <div className="mt-8">
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
// Reflection composer — Phase 4: calmer, roomier, invites writing.
// ------------------------------------------------------------------
function ReflectionInline({ onSubmit }: { onSubmit: (t: string) => Promise<void> | void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const submit = async (value: string) => {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    // Optimistically mark saved so the user gets instant feedback even if
    // the network write is slow. Errors surface via the async catch below.
    setSaved(true);
    try { await onSubmit(t); }
    catch { setSaved(false); }
    finally { setBusy(false); }
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      dir="rtl"
      className="rounded-2xl border border-gold/20 bg-black/45 p-5 text-start shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <label className="mb-3 block text-[12px] font-medium tracking-wide text-white/60">
        تأمُّلك
      </label>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        rows={5}
        placeholder="خُذ لحظة. اكتب ما شعرت به…"
        className="w-full resize-none rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-[15px] leading-[1.85] text-white placeholder:text-white/35 focus:border-gold/40 focus:outline-none"
        onPointerDown={stop}
        onClick={stop}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-white/55">
          {saved ? "تم الحفظ ✓" : "خاص بك — يُحفظ في تأمّلاتك."}
        </span>
        <button
          type="button"
          // Fire on pointerdown so a single tap always commits — mobile
          // Safari/Android WebViews often swallow the first click when
          // the textarea currently owns focus.
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); void submit(text); }}
          onClick={(e) => { e.stopPropagation(); }}
          disabled={busy || !text.trim()}
          className="rounded-full bg-gold px-5 py-2 text-[13px] font-bold text-black shadow disabled:opacity-40"
        >
          {busy ? "..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}
