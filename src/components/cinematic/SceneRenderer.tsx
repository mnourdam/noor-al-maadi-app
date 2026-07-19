// ============================================================
// Cinematic Opening — Scene Renderer
// ------------------------------------------------------------
// Renders a single scene: image (optional Ken Burns), overlay,
// particles, title/subtitle with configurable fade-in/out.
// Purely presentational — driven entirely by the scene object.
// ============================================================

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CinematicScene, RichTextSegment, SceneTransition } from "@/lib/cinematic-opening/types";
import { ParticleLayer } from "./ParticleLayer";

const GOLD = "#F4D98B";

/** Detect the Capacitor Android WebView at runtime. Web/desktop are false. */
function isAndroidWebView(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "android";
  } catch { return false; }
}

function androidDiag(scope: string, event: string, data?: Record<string, unknown>) {
  if (!isAndroidWebView()) return;
  try {
    console.info(`[Irth Cinematic Android][${scope}] ${event}`, {
      t: Math.round(performance.now()),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
      ...(data ?? {}),
    });
  } catch { /* diagnostics must never affect playback */ }
}

function imageMetrics(el: HTMLImageElement | null) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const parent = el.parentElement?.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  return {
    naturalWidth: el.naturalWidth,
    naturalHeight: el.naturalHeight,
    complete: el.complete,
    renderedWidth: Math.round(rect.width),
    renderedHeight: Math.round(rect.height),
    parentWidth: parent ? Math.round(parent.width) : null,
    parentHeight: parent ? Math.round(parent.height) : null,
    objectFit: cs.objectFit,
    objectPosition: cs.objectPosition,
    transform: cs.transform,
    transformOrigin: cs.transformOrigin,
    opacity: cs.opacity,
  };
}

function renderSegments(segments: RichTextSegment[] | undefined, fallback: string | undefined) {
  if (segments && segments.length > 0) {
    return segments.map((seg, i) => (
      <span
        key={i}
        style={seg.highlight ? { color: GOLD } : undefined}
      >
        {seg.text}
      </span>
    ));
  }
  return fallback ?? null;
}


interface Props {
  scene: CinematicScene;
  /** True when this scene is the active one on screen. */
  active: boolean;
  /** True while the sequence is fading out (skip / final). */
  fadingOut: boolean;
  /** When true, disable Ken Burns and particles; keep simple fades. */
  reducedMotion?: boolean;
}

// Cinematic easing — smooth acceleration and deceleration.
// Never "instant", never mechanical.
const CINEMATIC_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function transitionStyle(t: SceneTransition | undefined, visible: boolean): React.CSSProperties {
  const kind = t ?? "crossfade";
  // Every scene fades. "cut" is intentionally softened to a short crossfade
  // so the sequence never has an abrupt visual jump.
  const durationMs =
    kind === "fade-from-black" || kind === "fade-to-black" ? 1800 :
    kind === "cut" ? 600 : 1600;
  return {
    opacity: visible ? 1 : 0,
    transition: `opacity ${durationMs}ms ${CINEMATIC_EASE}`,
    willChange: "opacity",
  };
}

function SceneRendererImpl({ scene, active, fadingOut, reducedMotion }: Props) {
  const [titleVisible, setTitleVisible] = useState(false);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  // Start hidden so the very first frame of the scene layer is fully
  // transparent (pure black shows through from the portal beneath).
  // On the next animation frame after this scene becomes active we flip
  // to visible, which triggers the CSS opacity transition — so Scene 1
  // gradually emerges from black instead of appearing abruptly.
  const [entered, setEntered] = useState(false);
  const [imagePaintReady, setImagePaintReady] = useState(true);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!active) { setEntered(false); return; }
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [active, scene.id]);

  useEffect(() => {
    const isAndroid = isAndroidWebView();
    if (!active || !scene.image || !isAndroid) {
      setImagePaintReady(true);
      return;
    }

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    let raf3 = 0;
    const scope = `scene:${scene.id}`;
    const el = imgRef.current;
    setImagePaintReady(false);
    androidDiag(scope, "android image readiness start", {
      src: scene.image,
      metrics: imageMetrics(el),
    });

    const completeAfterPaint = async () => {
      if (cancelled) return;
      androidDiag(scope, "decode complete", { metrics: imageMetrics(el) });

      if (typeof window.createImageBitmap === "function" && el?.naturalWidth && el?.naturalHeight) {
        try {
          const bitmap = await window.createImageBitmap(el);
          androidDiag(scope, "ImageBitmap created", {
            bitmapWidth: bitmap.width,
            bitmapHeight: bitmap.height,
          });
          bitmap.close();
        } catch (error) {
          androidDiag(scope, "ImageBitmap failed", { error: String(error) });
        }
      } else {
        androidDiag(scope, "ImageBitmap skipped", { reason: "unsupported-or-not-ready" });
      }

      raf1 = window.requestAnimationFrame(() => {
        androidDiag(scope, "first RAF", { metrics: imageMetrics(el) });
        raf2 = window.requestAnimationFrame(() => {
          androidDiag(scope, "second RAF / first paint opportunity", { metrics: imageMetrics(el) });
          raf3 = window.requestAnimationFrame(() => {
            if (cancelled) return;
            androidDiag(scope, "third RAF / presenting complete image", { metrics: imageMetrics(el) });
            setImagePaintReady(true);
          });
        });
      });
    };

    const waitForLoad = () => {
      if (!el) {
        androidDiag(scope, "missing DOM image element", { src: scene.image });
        raf1 = window.requestAnimationFrame(() => setImagePaintReady(true));
        return;
      }
      const decode = () => {
        if (typeof el.decode === "function") {
          el.decode().then(completeAfterPaint).catch((error) => {
            androidDiag(scope, "decode failed; fail-forward", { error: String(error), metrics: imageMetrics(el) });
            completeAfterPaint();
          });
        } else {
          completeAfterPaint();
        }
      };
      if (el.complete && el.naturalWidth > 0) {
        decode();
        return;
      }
      const onLoad = () => {
        androidDiag(scope, "load event", { metrics: imageMetrics(el) });
        decode();
      };
      const onError = () => {
        androidDiag(scope, "load error; fail-forward", { metrics: imageMetrics(el) });
        completeAfterPaint();
      };
      el.addEventListener("load", onLoad, { once: true });
      el.addEventListener("error", onError, { once: true });
    };

    waitForLoad();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.cancelAnimationFrame(raf3);
    };
  }, [active, scene.id, scene.image]);

  useEffect(() => {
    if (!active) { setTitleVisible(false); setSubtitleVisible(false); return; }
    const delay = Math.max(0, scene.textDelayMs ?? 400);
    const subDelay = Math.max(0, scene.subtitleDelayMs ?? 700);
    const t1 = window.setTimeout(() => setTitleVisible(true), delay);
    const t2 = window.setTimeout(() => setSubtitleVisible(true), delay + subDelay);
    let t3: number | undefined;
    let t4: number | undefined;
    const hold = scene.textHoldMs;
    if (typeof hold === "number" && hold > 0) {
      t3 = window.setTimeout(() => setSubtitleVisible(false), delay + hold);
      t4 = window.setTimeout(() => setTitleVisible(false), delay + hold + 200);
    }
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      if (t3) window.clearTimeout(t3);
      if (t4) window.clearTimeout(t4);
    };
  }, [active, scene.textDelayMs, scene.textHoldMs, scene.subtitleDelayMs, scene.id]);

  const overlay = Math.max(0, Math.min(1, scene.overlayDarkness ?? 0));
  const kenBurns = scene.kenBurns !== false && !reducedMotion;
  const showParticles = !!scene.particles && !reducedMotion;
  const hasTitle = !!(scene.title || (scene.titleSegments && scene.titleSegments.length));
  const hasSubtitle = !!(scene.subtitle || (scene.subtitleSegments && scene.subtitleSegments.length));
  const hasText = hasTitle || hasSubtitle;

  const isAndroid = useMemo(() => isAndroidWebView(), []);
  const visible = active && !fadingOut && entered && (!isAndroid || !scene.image || imagePaintReady);
  const bgPosition =
    (isAndroid && scene.imagePositionAndroid) ||
    scene.imagePosition ||
    "center";

  useEffect(() => {
    androidDiag(`scene:${scene.id}`, "visibility state", {
      active,
      fadingOut,
      entered,
      imagePaintReady,
      visible,
      bgPosition,
      metrics: imageMetrics(imgRef.current),
    });
  }, [scene.id, active, fadingOut, entered, imagePaintReady, visible, bgPosition]);

  return (
    <div
      className="absolute inset-0"
      style={transitionStyle(active ? scene.transitionIn : scene.transitionOut, visible)}
      aria-hidden={!active}
      data-cinematic-scene-id={scene.id}
      data-cinematic-active={active ? "true" : "false"}
      data-cinematic-image-ready={imagePaintReady ? "true" : "false"}
    >

      {/* Image band */}
      {scene.image && (
        <div className="absolute inset-0 overflow-hidden">
          {isAndroid ? (
            <img
              ref={imgRef}
              src={scene.image}
              alt={scene.imageAlt || ""}
              aria-hidden={scene.imageAlt ? undefined : true}
              data-cinematic-image="true"
              className={`absolute inset-0 h-full w-full object-cover ${kenBurns ? "cinematic-kenburns" : ""} cinematic-android-kb`}
              decoding="sync"
              draggable={false}
              style={{ objectPosition: bgPosition }}
              onLoad={(event) => {
                androidDiag(`scene:${scene.id}`, "DOM image onLoad", {
                  metrics: imageMetrics(event.currentTarget),
                });
              }}
            />
          ) : (
            <div
              role={scene.imageAlt ? "img" : undefined}
              aria-label={scene.imageAlt || undefined}
              className={`absolute inset-0 bg-cover ${kenBurns ? "cinematic-kenburns" : ""}`}
              style={{
                backgroundImage: `url(${scene.image})`,
                backgroundPosition: bgPosition,
              }}
            />
          )}
        </div>
      )}

      {/* Dark overlay */}
      {overlay > 0 && (
        <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlay})` }} />
      )}

      {/* Particles */}
      {showParticles && scene.particles && (
        <ParticleLayer preset={scene.particles} intensity={scene.particleIntensity} />
      )}

      {/* Top-left historical / date label */}
      {scene.contextLabel && (
        <div
          dir="rtl"
          className="pointer-events-none absolute top-0 left-0 px-5 py-3 text-[11px] font-medium tracking-[0.18em] text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)] sm:text-xs"
          style={{
            paddingTop: "max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))",
            paddingLeft: "max(1.25rem, env(safe-area-inset-left))",

            opacity: active && !fadingOut ? 1 : 0,
            transition: "opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <span style={{ color: GOLD }}>{scene.contextLabel}</span>
        </div>
      )}


      {/* Subtle readability gradient — only when there is text to read. */}
      {hasText && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 100%)",
            opacity: titleVisible || subtitleVisible ? 1 : 0,
            transition: "opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Text */}
      {hasText && (
        <div
          dir="rtl"
          className="absolute inset-x-0 bottom-0 flex flex-col items-center px-8 text-center"
          style={{
            paddingBottom: "max(6rem, calc(env(safe-area-inset-bottom) + 5rem))",
          }}
        >
          {hasTitle && (
            <h1
              className="font-display text-3xl font-bold leading-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)] sm:text-4xl"
              style={{
                opacity: titleVisible ? 1 : 0,
                transform: titleVisible ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1), transform 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "opacity, transform",
              }}
            >
              {renderSegments(scene.titleSegments, scene.title)}
            </h1>
          )}
          {hasSubtitle && (
            <p
              className="mt-3 max-w-md text-sm leading-relaxed text-white/90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.65)] sm:text-base"
              style={{
                opacity: subtitleVisible ? 1 : 0,
                transform: subtitleVisible ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1), transform 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
                willChange: "opacity, transform",
              }}
            >
              {renderSegments(scene.subtitleSegments, scene.subtitle)}
            </p>
          )}
        </div>
      )}



      <style>{`
        .cinematic-kenburns {
          /* Gentle, eased camera drift. Starts and ends softly — never
             snaps into motion, never stops abruptly. GPU-only transform. */
          animation: cinematic-kenburns 18s cubic-bezier(0.37, 0, 0.63, 1) both;
          transform-origin: center 55%;
          will-change: transform;
          backface-visibility: hidden;
        }
        @keyframes cinematic-kenburns {
          0%   { transform: scale(1.045) translate3d(0, 0.4%, 0); }
          100% { transform: scale(1.13)  translate3d(0, -1.6%, 0); }
        }
        /* Android WebView: softer scale and reduced upward pan so the
           bottom of tall portrait compositions is never cropped. Applied
           on top of the base keyframes via a same-name override. */
        .cinematic-android-kb.cinematic-kenburns {
          animation-name: cinematic-kenburns-android;
          transform-origin: center 62%;
        }
        @keyframes cinematic-kenburns-android {
          0%   { transform: scale(1.035) translate3d(0, 0.2%, 0); }
          100% { transform: scale(1.09)  translate3d(0, -0.6%, 0); }
        }
      `}</style>
    </div>
  );
}

export const SceneRenderer = memo(SceneRendererImpl);
