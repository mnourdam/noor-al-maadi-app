// ============================================================
// Story Scene Card — standalone 1080×1920 renderer
// ------------------------------------------------------------
// NOT a screenshot. The card is rebuilt from the scene DATA on a
// detached canvas so the output is byte-stable across phones,
// tablets and desktop, and never contains a single pixel of app
// chrome (progress bar, close button, HUD, hints…).
//
// Guarantees:
//   * RTL + Arabic shaping/diacritics come from the same fonts
//     the app bundles (IBM Plex Sans Arabic → Cairo → Amiri);
//     `document.fonts.ready` is awaited before any measurement.
//   * Long text never clips: the body auto-shrinks in steps and,
//     if still too tall, the layout re-flows upward — the block
//     is measured before it is painted.
//   * Reveal scenes keep their signature treatment (black 80%
//     over a sharp image), reading/perspective/map scenes keep
//     the bottom scrim, documents keep the framed manuscript and
//     quotes/reflections keep the manuscript composition.
//   * Offline safe: artwork comes from the shared offline image
//     cache; the wordmark is drawn with vectors + text only, so
//     no network request is ever required to export.
// ============================================================

import type { StorySceneRow } from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";
import { resolveCachedStoryMediaUrl } from "@/lib/stories/media/url";
import { splitSentences } from "@/components/stories/player/timing";

export const CARD_W = 1080;
export const CARD_H = 1920;

const FONT_STACK = '"IBM Plex Sans Arabic", "Cairo", "Amiri", sans-serif';
const GOLD = "#e9c46a";

type LayoutKey = "A" | "B" | "C" | "D" | "E" | "F";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickLayout(scene: StorySceneRow): LayoutKey {
  const p = scene.payload as Record<string, unknown> | null | undefined;
  const tpl = typeof p?.["template"] === "string" ? (p["template"] as string) : null;
  if (tpl === "quote") return "F";
  if (tpl === "map") return "E";
  switch (scene.scene_type) {
    case "reading":
      return "A";
    case "perspective":
      return "B";
    case "reveal":
      return "C";
    case "document":
      return "D";
    case "reflection":
      return "F";
    default:
      return "A";
  }
}

/** Same narrative extraction the on-screen SceneStage performs. */
export function sceneCardText(scene: StorySceneRow): {
  title: string;
  sentences: string[];
  caption: string;
  speaker: string;
} {
  const p = (scene.payload ?? {}) as Record<string, unknown>;
  let sentences: string[];
  if (Array.isArray(p["body_ar"])) {
    sentences = (p["body_ar"] as unknown[]).flatMap((x) =>
      typeof x === "string" ? splitSentences(x) : [],
    );
  } else {
    const primary =
      str(p["body_ar"]) ||
      str(p["body"]) ||
      str(p["quote_ar"]) ||
      str(p["quote"]) ||
      str(p["truth_ar"]) ||
      str(p["truth"]);
    sentences = splitSentences(primary);
  }
  if (sentences.length === 0) {
    const prompt = str(p["prompt_ar"]) || str(p["prompt"]);
    if (prompt) sentences = splitSentences(prompt);
  }
  return {
    title: scene.title_ar ?? "",
    sentences,
    caption: str(p["caption_ar"]) || str(p["caption"]),
    speaker: str(p["speaker_ar"]) || str(p["speaker"]),
  };
}

// ─── low level helpers ─────────────────────────────────────────────────

/** Export pipeline stages, reported to the caller for diagnostics. */
export type SceneCardStage =
  | "fonts"
  | "resolve-image"
  | "load-image"
  | "draw"
  | "encode";

export class SceneCardError extends Error {
  constructor(public stage: SceneCardStage, message: string) {
    super(message);
    this.name = "SceneCardError";
  }
}

/** Never let a stage hang forever. Resolves to `fallback` on timeout. */
async function softTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => { t = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Decode an image without tainting the canvas.
 * 1) fetch → Blob → object URL (same-origin blob, always untainted)
 * 2) direct <img crossOrigin="anonymous"> as a fallback
 * Both paths are time-boxed.
 */
async function decodeImage(url: string): Promise<HTMLImageElement | null> {
  const viaBlob = await softTimeout(
    (async (): Promise<string | null> => {
      if (url.startsWith("blob:") || url.startsWith("data:")) return url;
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) return null;
        const b = await res.blob();
        return URL.createObjectURL(b);
      } catch {
        return null;
      }
    })(),
    8_000,
    null,
  );

  const attempt = (src: string, anonymous: boolean) =>
    softTimeout(
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        if (anonymous) img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }),
      8_000,
      null,
    );

  if (viaBlob) {
    const img = await attempt(viaBlob, false);
    if (viaBlob !== url && viaBlob.startsWith("blob:")) {
      setTimeout(() => { try { URL.revokeObjectURL(viaBlob); } catch { /* ignore */ } }, 10_000);
    }
    if (img) return img;
  }
  return await attempt(url, true);
}

async function loadSceneImage(
  scene: StorySceneRow,
  media: StoryMediaRow[],
): Promise<HTMLImageElement | null> {
  const row = scene.primary_media_id
    ? (media.find((m) => m.id === scene.primary_media_id) ?? null)
    : null;
  if (!row) return null;
  const url = await softTimeout(
    resolveCachedStoryMediaUrl(row).catch(() => null),
    8_000,
    null,
  );
  if (!url) return null;
  return await decodeImage(url);
}


function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = w / h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (ir > tr) {
    sw = img.naturalHeight * tr;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / tr;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

interface Line {
  text: string;
  size: number;
  weight: number;
  color: string;
  lineHeight: number;
  gapBefore: number;
  italic?: boolean;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function fontOf(l: Pick<Line, "size" | "weight" | "italic">): string {
  return `${l.italic ? "italic " : ""}${l.weight} ${l.size}px ${FONT_STACK}`;
}

/** Build the text block at a given scale, returning laid-out lines + height. */
function layoutBlock(
  ctx: CanvasRenderingContext2D,
  parts: Line[],
  maxWidth: number,
): { lines: (Line & { text: string })[]; height: number } {
  const lines: (Line & { text: string })[] = [];
  let height = 0;
  for (const part of parts) {
    if (!part.text.trim()) continue;
    const wrapped = wrap(ctx, part.text, maxWidth, fontOf(part));
    height += part.gapBefore;
    wrapped.forEach((t, i) => {
      lines.push({ ...part, text: t, gapBefore: i === 0 ? part.gapBefore : 0 });
      height += part.size * part.lineHeight;
    });
  }
  return { lines, height };
}

function paintBlock(
  ctx: CanvasRenderingContext2D,
  lines: (Line & { text: string })[],
  x: number,
  top: number,
  align: "right" | "center",
) {
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  let y = top;
  for (const l of lines) {
    y += l.gapBefore;
    ctx.font = fontOf(l);
    ctx.fillStyle = l.color;
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 18;
    ctx.fillText(l.text, x, y + l.size * l.lineHeight * 0.78);
    ctx.shadowBlur = 0;
    y += l.size * l.lineHeight;
  }
}

/** Small, quiet Irth logo branding. Vector + image fallback ⇒ works offline. */
async function drawBranding(ctx: CanvasRenderingContext2D) {
  const margin = 72;
  const logoSize = 100; // Visual size for the square logo
  const x = CARD_W - margin - logoSize;
  const y = CARD_H - margin - logoSize - 10;

  ctx.save();
  
  // 1) Logo Image branding
  const logoUrl = "/assets/splash/irth-logo.png";
  const logoImg = await decodeImage(logoUrl).catch(() => null);
  
  if (logoImg) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 20;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logoImg, x, y, logoSize, logoSize);
    ctx.shadowBlur = 0;
  } else {
    // Fallback if image fails (legacy wordmark)
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.92;
    ctx.font = `700 40px ${FONT_STACK}`;
    ctx.fillStyle = GOLD;
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 14;
    ctx.fillText("إرث", CARD_W - margin, CARD_H - margin - 20);
  }
  
  ctx.restore();
}

function verticalGradient(
  ctx: CanvasRenderingContext2D,
  top: number,
  bottom: number,
  stops: [number, string][],
) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, CARD_W, bottom - top);
}

// ─── main renderer ─────────────────────────────────────────────────────

export interface SceneCardOptions {
  scene: StorySceneRow;
  media: StoryMediaRow[];
  /** Diagnostics hook — called as each stage starts. */
  onStage?: (stage: SceneCardStage) => void;
}

/** Render one story scene as a 1080×1920 PNG blob. */
export async function renderSceneCard({
  scene,
  media,
  onStage,
}: SceneCardOptions): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const stage = (s: SceneCardStage) => {
    try { onStage?.(s); } catch { /* diagnostics must never break export */ }
  };

  stage("fonts");
  // Fonts must never block the export: 4s cap, then draw with whatever
  // the platform has (Android WebView can leave `fonts.ready` pending).
  try {
    await softTimeout(
      Promise.resolve((document as Document & { fonts?: FontFaceSet }).fonts?.ready).then(
        () => true,
      ),
      4_000,
      false,
    );
  } catch {
    /* fonts API unavailable — system fallback is acceptable */
  }

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new SceneCardError("draw", "2d context unavailable");
  ctx.direction = "rtl";

  const layout = pickLayout(scene);
  const { title, sentences, caption, speaker } = sceneCardText(scene);
  stage("resolve-image");
  // A missing image is NOT fatal — the card still renders text + wordmark.
  const img = await loadSceneImage(scene, media).catch(() => null);
  stage("draw");


  // 1) Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const centered = layout === "C" || layout === "D" || layout === "F";
  const padX = 88;
  const maxWidth = CARD_W - padX * 2;

  if (layout === "F") {
    // Manuscript composition: dark field with a soft, blurred echo.
    const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
    g.addColorStop(0, "#000000");
    g.addColorStop(0.5, "#0a0a0a");
    g.addColorStop(1, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    if (img) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.filter = "blur(26px)";
      drawCover(ctx, img, -40, -40, CARD_W + 80, CARD_H + 80);
      ctx.restore();
      ctx.filter = "none";
    }
  } else if (layout === "D") {
    // Document — dark ambient field, framed manuscript in the upper half.
    const rg = ctx.createRadialGradient(
      CARD_W / 2, CARD_H / 2, 60, CARD_W / 2, CARD_H / 2, CARD_H * 0.72,
    );
    rg.addColorStop(0, "#1a1206");
    rg.addColorStop(1, "#000000");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    if (img) {
      const fw = CARD_W - 180;
      const fh = Math.round(CARD_H * 0.42);
      const fx = 90;
      const fy = 190;
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx, fy, fw, fh);
      ctx.clip();
      drawCover(ctx, img, fx, fy, fw, fh);
      ctx.restore();
      ctx.strokeStyle = "rgba(233,196,106,0.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(fx, fy, fw, fh);
    }
  } else if (img) {
    drawCover(ctx, img, 0, 0, CARD_W, CARD_H);
  }

  // 2) Scene-specific visual treatment
  if (layout === "C") {
    // Reveal — sharp artwork under a flat black 80% veil (no blur).
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else if (layout === "B" && img) {
    // Perspective — softened backdrop, matching the on-screen blur.
    ctx.save();
    ctx.filter = "blur(14px)";
    drawCover(ctx, img, -30, -30, CARD_W + 60, CARD_H + 60);
    ctx.restore();
    ctx.filter = "none";
    verticalGradient(ctx, 0, CARD_H, [
      [0, "rgba(0,0,0,0.35)"],
      [0.5, "rgba(0,0,0,0.25)"],
      [1, "rgba(0,0,0,0.6)"],
    ]);
  }

  if (layout === "A" || layout === "B" || layout === "E") {
    // Bottom scrim, same ramp as the runtime.
    verticalGradient(ctx, CARD_H * 0.32, CARD_H, [
      [0, "rgba(0,0,0,0)"],
      [0.3, "rgba(0,0,0,0.35)"],
      [0.65, "rgba(0,0,0,0.78)"],
      [1, "rgba(0,0,0,0.92)"],
    ]);
  }

  // 3) Text block — auto-shrinks until it fits its zone (never clipped).
  const reserveTop = layout === "D" ? 190 + Math.round(CARD_H * 0.42) + 60 : 150;
  const reserveBottom = 190; // wordmark zone
  const available = CARD_H - reserveTop - reserveBottom;

  const scales = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.54, 0.48, 0.42];
  let laid: { lines: (Line & { text: string })[]; height: number } | null = null;
  for (const s of scales) {
    const parts: Line[] = [];
    if (speaker && layout === "B") {
      parts.push({
        text: speaker,
        size: Math.round(26 * s),
        weight: 600,
        color: "rgba(233,196,106,0.9)",
        lineHeight: 1.6,
        gapBefore: 0,
      });
    }
    if (title) {
      parts.push({
        text: title,
        size: Math.round(54 * s),
        weight: 700,
        color: layout === "D" ? GOLD : "#ffffff",
        lineHeight: 1.3,
        gapBefore: parts.length ? 18 : 0,
      });
    }
    for (const sen of sentences) {
      parts.push({
        text: sen,
        size: Math.round(38 * s),
        weight: 400,
        color: "rgba(255,255,255,0.94)",
        lineHeight: 1.85,
        gapBefore: 10,
      });
    }
    if (caption) {
      parts.push({
        text: `— ${caption}`,
        size: Math.round(24 * s),
        weight: 400,
        color: "rgba(255,255,255,0.6)",
        lineHeight: 1.7,
        gapBefore: 34,
        italic: true,
      });
    }
    const attempt = layoutBlock(ctx, parts, maxWidth);
    laid = attempt;
    if (attempt.height <= available) break;
  }

  if (laid && laid.lines.length > 0) {
    const x = centered ? CARD_W / 2 : CARD_W - padX;
    const align: "right" | "center" = centered ? "center" : "right";
    let top: number;
    if (layout === "D") {
      top = reserveTop;
    } else if (centered) {
      top = Math.max(reserveTop, (CARD_H - laid.height) / 2);
    } else {
      top = Math.max(reserveTop, CARD_H - reserveBottom - laid.height);
    }
    paintBlock(ctx, laid.lines, x, top, align);
  }

  // 4) Wordmark
  drawWordmark(ctx);

  // 5) Encode — `toBlob` can silently never fire in some WebViews, and a
  //    tainted canvas throws SecurityError. Both are handled explicitly.
  stage("encode");
  const blob = await softTimeout(
    new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), "image/png", 0.96);
      } catch (err) {
        console.warn("[scene-card] toBlob threw", err);
        resolve(null);
      }
    }),
    8_000,
    null,
  );
  if (blob && blob.size > 512) return blob;

  // Fallback: data URL → Blob (works when toBlob is unimplemented).
  try {
    const dataUrl = canvas.toDataURL("image/png");
    const res = await fetch(dataUrl);
    const b = await res.blob();
    if (b && b.size > 512) return b;
  } catch (err) {
    console.warn("[scene-card] toDataURL fallback failed", err);
    throw new SceneCardError("encode", "canvas encode failed (possibly tainted)");
  }
  throw new SceneCardError("encode", "empty image");
}

