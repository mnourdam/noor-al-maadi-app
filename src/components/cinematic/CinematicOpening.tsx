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


const FINAL_FADE_MS = 1400;
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
    setFadingOut(true);
    window.setTimeout(() => {
      if (config) markCompleted(config.version);
      setPhase("done");
      dispatchCompleted();
    }, reducedMotion ? 250 : FINAL_FADE_MS);
  }, [config, reducedMotion]);

  // Scene timer — cleared on transition, pause, and unmount.
  useEffect(() => {
    if (phase !== "playing" || !currentScene || paused || fadingOut) return;
    const timer = window.setTimeout(() => {
      if (index >= scenes.length - 1) {
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
    setConfirmOpen(true);
    setPaused(true);
  }, [currentScene, phase]);
  useOverlayDismiss(useMemo(
    () => (phase !== "done" && !fadingOut ? requestSkip : () => {}),
    [phase, fadingOut, requestSkip],
  ));

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
      onClickCapture={(e) => e.stopPropagation()}
      onTouchStartCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
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
        />
      )}

      {phase === "playing" && currentScene?.showFinalLogo && (
        <FinalLogoReveal
          logoUrl={CINEMATIC_LOGO_URL}
          reducedMotion={reducedMotion}
          fadingOut={fadingOut}
        />
      )}


      {canSkip && (
        <button
          type="button"
          onClick={requestSkip}
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
        <AlertDialogContent dir="rtl" className="border-amber-500/30">
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
              onClick={() => { setConfirmOpen(false); finish(); }}
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
 * Timeline (scene durationMs = 5000, then FINAL_FADE_MS reveals Home):
 *   0    → background alone
 *   700  → logo fades in (1200ms, eased)
 *   1900 → glow blooms softly and holds
 *   3400 → glow fades out
 *   4200 → logo starts fading
 *   5000 → sequence ends → overlay fades to transparent → Home appears
 */
function FinalLogoReveal({
  logoUrl,
  reducedMotion,
  fadingOut,
}: { logoUrl: string; reducedMotion: boolean; fadingOut: boolean }) {
  const [phase, setPhase] = useState<"idle" | "in" | "glow" | "hold" | "glow-out" | "out">("idle");

  useEffect(() => {
    if (reducedMotion) {
      const t1 = window.setTimeout(() => setPhase("in"), 200);
      const t2 = window.setTimeout(() => setPhase("hold"), 700);
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    }
    const t1 = window.setTimeout(() => setPhase("in"),       700);
    const t2 = window.setTimeout(() => setPhase("glow"),     1900);
    const t3 = window.setTimeout(() => setPhase("hold"),     2600);
    const t4 = window.setTimeout(() => setPhase("glow-out"), 3400);
    const t5 = window.setTimeout(() => setPhase("out"),      4200);
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      window.clearTimeout(t3); window.clearTimeout(t4);
      window.clearTimeout(t5);
    };
  }, [reducedMotion]);

  const logoOpacity = fadingOut || phase === "idle" || phase === "out" ? 0 : 1;
  const glowOpacity =
    fadingOut || phase === "glow" || phase === "hold" ? (fadingOut ? 0 : 1) : 0;
  const logoScale = phase === "idle" ? 0.94 : phase === "out" ? 0.98 : 1;
  const glowScale = phase === "glow" || phase === "hold" ? 1 : 0.85;

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
          opacity: glowOpacity,
          transform: `scale(${glowScale})`,
          transition: `opacity 1200ms ${ease}, transform 1600ms ${ease}`,
          filter: "blur(8px)",
          willChange: "opacity, transform",
        }}
      />
      <img
        src={logoUrl}
        alt="إرث"
        className="relative h-40 w-40 select-none sm:h-52 sm:w-52"
        draggable={false}
        decoding="sync"
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          transition: `opacity 1200ms ${ease}, transform 1400ms ${ease}`,
          filter: "drop-shadow(0 4px 32px rgba(0,0,0,0.75))",
          willChange: "opacity, transform",
        }}
      />
    </div>
  );
}
