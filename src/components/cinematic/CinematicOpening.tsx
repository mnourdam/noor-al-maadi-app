// ============================================================
// Cinematic Opening — Engine Entrypoint
// ------------------------------------------------------------
// Mounted once at the root. Owns the full first-launch canvas:
// from the very first paint it renders a pure-black portal that
// covers Home so nothing shows through while the notification
// permission dialog is pending or while scene assets are being
// decoded. Only when permission has resolved AND every scene
// image + logo has been fully decoded do we advance to playback.
//
// Integrations:
//   • Navigation engine — Back triggers our Skip-confirm dialog.
//   • Audio settings — respects soundEnabled / ambienceEnabled.
//   • Reduced motion — disables Ken Burns and particles.
//   • Capacitor App lifecycle — pauses timers/audio on background.
//
// Emits `irth:opening-completed` when done (played through or skipped).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CINEMATIC_OPENING_DATA, CINEMATIC_LOGO_URL } from "@/lib/cinematic-opening/data";
import {
  hasCompleted,
  markCompleted,
  isFirstEverLaunch,
  hasAskedNotificationPermission,
  markNotificationPermissionAsked,
} from "@/lib/cinematic-opening/persistence";
import type { CinematicOpeningConfig } from "@/lib/cinematic-opening/types";
import { audioManager } from "@/lib/audioManager";
import { useOverlayDismiss } from "@/lib/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SceneRenderer } from "./SceneRenderer";
import { AmbientAudio } from "./AmbientAudio";


const FINAL_FADE_MS = 1500;
const FINAL_LOGO_WATCHDOG_MS = 10000;
// Assets are locally bundled. A generous ceiling — local decodes
// finish well within a couple hundred ms on a real device; the
// timeout is only a safety net so a broken WebView can't hang.
const PRELOAD_TIMEOUT_MS = 15000;
const SOUNDTRACK_PRELOAD_TIMEOUT_MS = 4000;
export const OPENING_COMPLETED_EVENT = "irth:opening-completed";

function isNativeAndroid(): boolean {
  try {
    const cap = (globalThis as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "android";
  } catch { return false; }
}

function androidCinematicDiag(scope: string, event: string, data?: Record<string, unknown>) {
  if (!isNativeAndroid()) return;
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

/** First-launch-only: request notification permission BEFORE the scenes
 *  start. Any outcome (granted, denied, error) fails forward. Web is
 *  skipped entirely. */
async function requestNotificationPermissionOnce(): Promise<void> {
  if (hasAskedNotificationPermission()) return;
  markNotificationPermissionAsked();
  if (!isNativeAndroid()) return;
  try {
    const mod = await import("@capacitor/local-notifications");
    const LN = mod.LocalNotifications;
    const status = await LN.checkPermissions();
    if (status.display === "granted" || status.display === "denied") return;
    await LN.requestPermissions();
  } catch { /* fail forward */ }
}


function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return reduced;
}

/**
 * Fully decode every image so that the moment its scene starts the GPU
 * texture is already resident — no lazy decode, no partial upload, no
 * checkerboard. We use `img.decode()` (with an `onload` fallback for
 * older WebViews) and keep the decoded `<img>` elements alive via
 * `imageCacheRef` so the browser cannot evict the textures between
 * preload and scene playback.
 *
 * Never rejects. `timeoutMs` is a safety ceiling for a completely broken
 * decoder — locally-bundled WebPs finish in a fraction of that.
 */
function decodeAllImages(urls: string[], timeoutMs: number): Promise<HTMLImageElement[]> {
  return new Promise((resolve) => {
    if (urls.length === 0 || typeof window === "undefined") { resolve([]); return; }
    const results: HTMLImageElement[] = [];
    let done = 0;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(results); } };
    const timer = window.setTimeout(finish, timeoutMs);
    urls.forEach((url) => {
      const img = new Image();
      img.decoding = "sync";
      // fetchpriority isn't in every TS lib; set via attribute.
      try { img.setAttribute("fetchpriority", "high"); } catch { /* */ }
      const mark = () => {
        results.push(img);
        done += 1;
        if (done >= urls.length) { window.clearTimeout(timer); finish(); }
      };
      img.onerror = () => { done += 1; if (done >= urls.length) { window.clearTimeout(timer); finish(); } };
      img.onload = () => {
        if (typeof img.decode === "function") {
          img.decode().then(mark).catch(mark);
        } else {
          mark();
        }
      };
      img.src = url;
    });
  });
}

/** Warm the soundtrack cache so playback begins the instant Scene 1 does. */
function preloadSoundtrack(url: string | undefined, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!url || typeof window === "undefined") { resolve(); return; }
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    const timer = window.setTimeout(finish, timeoutMs);
    try {
      const probe = new Audio();
      probe.preload = "auto";
      probe.src = url;
      const done = () => { window.clearTimeout(timer); finish(); };
      probe.addEventListener("canplaythrough", done, { once: true });
      probe.addEventListener("loadeddata", done, { once: true });
      probe.addEventListener("error", done, { once: true });
      try { probe.load(); } catch { /* */ }
    } catch {
      window.clearTimeout(timer); finish();
    }
  });
}

// Sync decision — runs before any paint. If the opening should not
// play at all, we mount nothing and Home boots normally.
function decideShouldPlay(): CinematicOpeningConfig | null {
  if (typeof window === "undefined") return null;
  const cfg = CINEMATIC_OPENING_DATA;
  if (!cfg.replayForAllUsers && hasCompleted(cfg.version)) return null;
  return cfg;
}

export function CinematicOpening() {
  // Sync decision — computed on the very first render so a full-screen
  // black portal can cover Home before the browser paints anything else.
  const initialConfig = useMemo(() => decideShouldPlay(), []);
  const [config] = useState<CinematicOpeningConfig | null>(initialConfig);
  // "gate"     — pre-playback: black screen, permission + preload in flight
  // "playing"  — scenes are on screen
  // "done"     — sequence completed and portal has unmounted
  const [phase, setPhase] = useState<"gate" | "playing" | "done">(
    initialConfig ? "gate" : "done",
  );
  const [index, setIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [paused, setPaused] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finishedRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // Keep decoded images alive so the browser can't evict textures
  // between the preload pass and the scene painting them.
  const imageCacheRef = useRef<HTMLImageElement[]>([]);

  // Boot: permission → preload images (with decode) → preload audio → play.
  // The black gate stays on screen the entire time; Home never becomes
  // visible because the portal covers the whole viewport at z-[2000].
  useEffect(() => {
    if (!initialConfig) { dispatchCompleted(); return; }

    let cancelled = false;
    (async () => {
      // 1. First launch: request notification permission FIRST.
      //    We do not touch preload until the OS dialog has resolved.
      if (isFirstEverLaunch()) {
        await requestNotificationPermissionOnce();
        if (cancelled) return;
      }

      // 2. Decode every scene image + the final-scene logo. Locally
      //    bundled — finishes in a few hundred ms on a real device.
      const sceneUrls = initialConfig.scenes
        .map((s) => s.image)
        .filter((x): x is string => !!x);
      const urls = Array.from(new Set([...sceneUrls, CINEMATIC_LOGO_URL]));
      const decoded = await decodeAllImages(urls, PRELOAD_TIMEOUT_MS);
      if (cancelled) return;
      imageCacheRef.current = decoded;

      // 3. Warm the soundtrack cache so Scene 1 starts with audio ready.
      await preloadSoundtrack(initialConfig.soundtrack?.url, SOUNDTRACK_PRELOAD_TIMEOUT_MS);
      if (cancelled) return;

      // 4. Only now do we hand the canvas over from the black gate to
      //    the scene renderer. Every scene is kept — we never drop a
      //    scene based on preload result; locally-bundled assets should
      //    always be usable, and playing with a slow decode beats
      //    silently shortening the sequence.
      setPhase("playing");
    })();
    return () => { cancelled = true; };
  }, [initialConfig]);


  const scenes = config?.scenes ?? [];
  const currentScene = scenes[index];

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    setConfirmOpen(false);
    setPaused(false);
    androidCinematicDiag("engine", "finish requested", { index, sceneId: currentScene?.id });
    setFadingOut(true);
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null;
      if (config) markCompleted(config.version);
      setPhase("done");
      dispatchCompleted();
      androidCinematicDiag("engine", "finish complete / portal unmounted", { index, sceneId: currentScene?.id });
    }, reducedMotion ? 250 : FINAL_FADE_MS);
  }, [config, reducedMotion, index, currentScene?.id]);

  useEffect(() => () => {
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  }, []);

  // Scene timer — cleared on transition, pause, and unmount.
  // For the final scene we DO NOT call finish() directly; instead we
  // arm FinalLogoReveal (via its own timeline) and wait for its
  // explicit onComplete callback. This guarantees Home never becomes
  // visible before the logo reveal finishes, even if the scene
  // duration and the reveal timeline ever drift apart.
  useEffect(() => {
    if (phase !== "playing" || !currentScene || paused || fadingOut) return;
    const isLast = index >= scenes.length - 1;
    if (isLast && currentScene.showFinalLogo) return;
    const timer = window.setTimeout(() => {
      if (isLast) {
        finish();
      } else {
        setIndex((i) => i + 1);
      }
    }, Math.max(400, currentScene.durationMs));
    return () => window.clearTimeout(timer);
  }, [phase, currentScene, index, scenes.length, paused, fadingOut, finish]);


  // Lock body scroll while the portal is up.
  useEffect(() => {
    if (phase === "done" || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [phase]);

  // Capacitor App lifecycle — pause timers on background.
  useEffect(() => {
    if (phase === "done") return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", ({ isActive }) => {
          setPaused(!isActive);
        });
        if (cancelled) { h.remove(); return; }
        sub = h;
      } catch { /* not on native */ }
    })();
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      sub?.remove();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase]);

  // Back → Skip-confirm.
  const requestSkip = useCallback(() => {
    if (finishedRef.current) return;
    if (phase !== "playing") return;
    if (currentScene?.allowSkip === false) return;
    androidCinematicDiag("engine", "skip confirm opened", { index, sceneId: currentScene?.id });
    setConfirmOpen(true);
    setPaused(true);
  }, [currentScene, phase, index]);

  const skipNow = useCallback(() => {
    // Skip is intentionally independent of scene timers and the Scene 6 logo
    // state machine: once confirmed, the parent portal begins its exit fade.
    androidCinematicDiag("engine", "skip confirmed / bypassing scene state", { index, sceneId: currentScene?.id });
    finish();
  }, [finish, index, currentScene?.id]);
  // Only occupy an overlay-stack slot while the cinematic is an active
  // blocking surface. When phase transitions to "done" (or the final
  // fade completes), the dismisser unregisters and stackSize returns to
  // its pre-cinematic value. No inert callback is left behind.
  const cinematicActive = phase !== "done" && !fadingOut;
  useOverlayDismiss(requestSkip, "CinematicOpening", cinematicActive);



  const canSkip = phase === "playing" && currentScene?.allowSkip !== false;

  // Continuous soundtrack — one stable src across the whole opening.
  const audioSettings = audioManager.getSettings();
  const soundOn = audioSettings.soundEnabled && audioSettings.ambienceEnabled;
  const soundtrackSrc = soundOn && phase === "playing" ? config?.soundtrack?.url : undefined;

  const soundtrackLevel = useMemo(() => {
    if (!config) return 0;
    const fallback = config.soundtrack?.defaultLevel ?? 0.4;
    let level = fallback;
    for (let i = 0; i <= index && i < scenes.length; i += 1) {
      const v = scenes[i]?.soundtrackLevel;
      if (typeof v === "number") level = v;
    }
    return level;
  }, [config, scenes, index]);

  const ambientTarget = soundOn && phase === "playing"
    ? soundtrackLevel *
      (audioSettings.masterVolume ?? 1) *
      (audioSettings.ambienceVolume ?? 1)
    : 0;

  if (typeof document === "undefined") return null;
  if (phase === "done" || !config) return null;

  const node = (
    <div
      className="fixed inset-0 z-[2000] bg-black touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic opening"
      data-irth-cinematic-opening=""
      data-phase={phase}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${reducedMotion ? 300 : FINAL_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        willChange: "opacity",
        pointerEvents: fadingOut ? "none" : "auto",
      }}
    >
      {/* Scenes only mount once preload has completed. During the
          "gate" phase the portal is a solid black rectangle — Home
          is not visible, no timers advance, no scene image is on screen. */}
      {phase === "playing" && scenes.map((s, i) => (
        <SceneRenderer
          key={s.id}
          scene={s}
          active={i === index}
          fadingOut={fadingOut}
          reducedMotion={reducedMotion}
        />
      ))}

      {phase === "playing" && (
        <AmbientAudio
          src={soundtrackSrc}
          targetVolume={ambientTarget}
          paused={paused}
          stopping={fadingOut}
          stopRampMs={FINAL_FADE_MS}
        />
      )}

      {phase === "playing" && currentScene?.showFinalLogo && (
        <FinalLogoReveal
          logoUrl={CINEMATIC_LOGO_URL}
          reducedMotion={reducedMotion}
          fadingOut={fadingOut}
          onComplete={finish}
        />
      )}



      {canSkip && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            requestSkip();
          }}
          className="absolute right-4 top-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/25 bg-black/40 px-5 py-2 text-xs tracking-[0.25em] text-white/90 backdrop-blur-sm transition-colors hover:border-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
          style={{ top: "max(1rem, env(safe-area-inset-top))" }}
          aria-label="تخطّي المقدمة"
        >
          تخطّي
        </button>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setPaused(false);
        }}
      >
        <AlertDialogContent dir="rtl" className="z-[2101] border-amber-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-100">تخطّي المقدمة؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-7 text-slate-300">
              سيتم الانتقال مباشرةً إلى الشاشة الرئيسية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { setConfirmOpen(false); setPaused(false); }}
              className="border-slate-700"
            >
              متابعة المشاهدة
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); skipNow(); }}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              تخطّي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return createPortal(node, document.body);
}

function dispatchCompleted() {
  try { window.dispatchEvent(new CustomEvent(OPENING_COMPLETED_EVENT)); } catch { /* */ }
}

/**
 * Premium logo reveal for the final scene.
 *
 * Timeline (Android-safe; identical on web after readiness barrier):
 *   T+0     → background fully visible, logo mounted but invisible
 *   T+500   → logo fade-in begins (1200ms)
 *   T+1700  → logo at full opacity, glow blooms
 *   T+3300  → glow + logo begin fading out (1200ms)
 *   T+4500  → logo fully hidden — hand off to parent finish() which
 *             fades the whole cinematic + audio together over 1500ms.
 *
 * Android readiness barrier: on Android WebView we do NOT start the
 * timeline until the logo image has finished decoding AND two animation
 * frames have elapsed (double-rAF paint barrier). Web starts as soon
 * as the image is decoded — its compositor is not the bottleneck.
 */
function FinalLogoReveal({
  logoUrl,
  reducedMotion,
  fadingOut,
  onComplete,
}: {
  logoUrl: string;
  reducedMotion: boolean;
  fadingOut: boolean;
  /** Fires exactly once when the reveal has finished on-screen.
   *  The parent uses this to trigger the overlay fade and Home reveal —
   *  Home cannot appear before this callback fires. */
  onComplete: () => void;
}) {
  // State machine — ordered. `ready` means the logo is decoded and the
  // paint barrier has cleared; only then does the reveal timeline start.
  const [phase, setPhase] = useState<
    | "waiting_for_assets"
    | "mounted_waiting_for_paint"
    | "revealing_logo"
    | "holding_logo"
    | "fading_final_scene"
    | "completed"
  >("waiting_for_assets");
  const completedRef = useRef(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const completeOnce = useCallback((reason: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    androidCinematicDiag("final-logo", "complete", { reason, phase: phaseRef.current });
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    androidCinematicDiag("final-logo", "phase", {
      phase,
      fadingOut,
      imgComplete: imgRef.current?.complete ?? null,
      naturalWidth: imgRef.current?.naturalWidth ?? null,
      naturalHeight: imgRef.current?.naturalHeight ?? null,
    });
  }, [phase, fadingOut]);

  useEffect(() => {
    const watchdog = window.setTimeout(() => {
      completeOnce("watchdog-timeout");
    }, FINAL_LOGO_WATCHDOG_MS);
    return () => window.clearTimeout(watchdog);
  }, [completeOnce]);

  // Step 1 — decode the logo, then run the double-rAF paint barrier.
  // Fail-forward: any error still advances so Home is not blocked.
  useEffect(() => {
    let cancelled = false;
    let advanced = false;
    let raf1 = 0;
    let raf2 = 0;
    let safety: number | null = null;
    const advance = () => {
      if (cancelled || advanced || completedRef.current) return;
      advanced = true;
      if (safety != null) {
        window.clearTimeout(safety);
        safety = null;
      }
      androidCinematicDiag("final-logo", "asset decode barrier cleared", {
        complete: probe.complete,
        naturalWidth: probe.naturalWidth,
        naturalHeight: probe.naturalHeight,
      });
      raf1 = window.requestAnimationFrame(() => {
        androidCinematicDiag("final-logo", "pre-mount RAF 1", {});
        raf2 = window.requestAnimationFrame(() => {
          androidCinematicDiag("final-logo", "pre-mount RAF 2", {});
          if (!cancelled) setPhase("mounted_waiting_for_paint");
        });
      });
    };
    const probe = new Image();
    probe.decoding = "sync";
    try { probe.setAttribute("fetchpriority", "high"); } catch { /* */ }
    const done = () => {
      if (typeof probe.decode === "function") {
        probe.decode().then(advance).catch(advance);
      } else {
        advance();
      }
    };
    probe.onload = done;
    probe.onerror = advance;
    // Safety net — never leave the machine stuck if the platform is broken.
    safety = window.setTimeout(advance, 3000);
    probe.src = logoUrl;
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (safety != null) window.clearTimeout(safety);
    };
  }, [logoUrl]);

  // Step 2 — once the img element is in the DOM and painted, wait one
  // more double-rAF then start the reveal timeline.
  useEffect(() => {
    if (phase !== "mounted_waiting_for_paint") return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      androidCinematicDiag("final-logo", "DOM paint RAF 1", {
        imgComplete: imgRef.current?.complete ?? null,
        naturalWidth: imgRef.current?.naturalWidth ?? null,
        naturalHeight: imgRef.current?.naturalHeight ?? null,
      });
      raf2 = window.requestAnimationFrame(() => {
        androidCinematicDiag("final-logo", "DOM paint RAF 2 / reveal begins", {
          imgComplete: imgRef.current?.complete ?? null,
          naturalWidth: imgRef.current?.naturalWidth ?? null,
          naturalHeight: imgRef.current?.naturalHeight ?? null,
        });
        setPhase("revealing_logo");
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [phase]);

  // Step 3 — reveal / hold / fade timeline.
  useEffect(() => {
    if (phase !== "revealing_logo") return;
    if (reducedMotion) {
      // Compressed but preserves all beats.
      const t1 = window.setTimeout(() => setPhase("holding_logo"),         1000);
      const t2 = window.setTimeout(() => setPhase("fading_final_scene"),   2400);
      const t3 = window.setTimeout(() => setPhase("completed"),            3400);
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
    }
    // T+0 begins now (reveal starts). Logo fade-in duration 1200ms.
    const t1 = window.setTimeout(() => setPhase("holding_logo"),        1700);   // fully in
    const t2 = window.setTimeout(() => setPhase("fading_final_scene"),  3300);   // start fade
    const t3 = window.setTimeout(() => setPhase("completed"),           4500);   // fade done
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (phase === "completed" && !completedRef.current) {
      completeOnce("timeline-completed");
    }
  }, [phase, completeOnce]);

  const revealing = phase === "revealing_logo";
  const holding = phase === "holding_logo";
  const fading = phase === "fading_final_scene";
  

  // Opacity: 1 only during reveal+hold; 0 otherwise (or during parent fade-out).
  const logoOpacityFinal = !fadingOut && (revealing || holding) ? 1 : 0;
  const glowOpacityFinal = !fadingOut && holding ? 1 : 0;
  const logoScale =
    phase === "waiting_for_assets" || phase === "mounted_waiting_for_paint"
      ? 0.94
      : (fading || phase === "completed")
      ? 0.98
      : 1;
  const glowScale = holding ? 1 : 0.85;

  const ease = "cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[10] flex items-center justify-center"
      aria-hidden
    >
      <div
        className="absolute h-[520px] w-[520px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,214,140,0.42) 0%, rgba(255,214,140,0.18) 30%, rgba(255,214,140,0) 70%)",
          opacity: glowOpacityFinal,
          transform: `scale(${glowScale})`,
          transition: `opacity 1200ms ${ease}, transform 1600ms ${ease}`,
          filter: "blur(8px)",
          willChange: "opacity, transform",
        }}
      />
      <img
        ref={imgRef}
        src={logoUrl}
        alt="إرث"
        className="relative h-44 w-44 select-none p-4 sm:h-56 sm:w-56 sm:p-5"
        draggable={false}
        decoding="sync"
        onLoad={(event) => {
          androidCinematicDiag("final-logo", "DOM img onLoad", {
            complete: event.currentTarget.complete,
            naturalWidth: event.currentTarget.naturalWidth,
            naturalHeight: event.currentTarget.naturalHeight,
          });
        }}
        onError={() => androidCinematicDiag("final-logo", "DOM img onError", {})}
        style={{
          opacity: logoOpacityFinal,
          transform: `scale(${logoScale})`,
          transition: `opacity 1200ms ${ease}, transform 1400ms ${ease}`,
          filter: "drop-shadow(0 4px 32px rgba(0,0,0,0.75))",
          willChange: "opacity, transform",
        }}
      />
    </div>
  );
}
