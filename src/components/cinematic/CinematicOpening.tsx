// ============================================================
// Cinematic Opening — Engine Entrypoint
// ------------------------------------------------------------
// Mounted once at the root. Reads /data/cinematic-opening.json,
// validates it, preloads scene images (with a hard timeout so
// bad networks never trap the user), and plays the scenes in
// order. Skip fades the whole sequence out and marks the
// configured version as completed.
//
// Integrations:
//   • Navigation engine — registers a single overlay dismisser
//     while active. Hardware Back therefore triggers our
//     internal Skip-confirm dialog, never App.exitApp().
//   • Audio settings — respects `soundEnabled` / `ambienceEnabled`
//     from audioManager. When off, no ambient audio plays.
//   • Reduced motion — disables Ken Burns and particles.
//   • Capacitor App lifecycle — pauses timers/audio on
//     background and resumes on foreground; timers do not
//     double-advance across pause/resume.
//
// Emits a `irth:opening-completed` DOM event when the sequence
// finishes (either by playing through or by Skip). Downstream
// gates (auth choice, etc.) can listen without coupling to the
// engine.
//
// No content is baked in. If the config is missing or every
// scene is invalid, this component renders nothing and the app
// boots straight into Home.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadCinematicOpeningConfig } from "@/lib/cinematic-opening/config";
import { CINEMATIC_LOGO_URL } from "@/lib/cinematic-opening/data";
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
// Assets are locally bundled. Timeout is a safety net for a completely
// broken decode; local files should be ready well under this budget.
const PRELOAD_TIMEOUT_MS = 6000;
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
 *  start. Any outcome (granted, denied, error) fails forward — the opening
 *  proceeds regardless. Web is skipped entirely. */
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

/** Preload every scene image. Resolves with the set of URLs that loaded
 *  successfully. Never rejects; the timeout guarantees the boot path is
 *  never trapped by a slow or missing asset. Scenes whose image is not
 *  in the returned set are dropped before playback. */
function preloadImages(urls: string[], timeoutMs: number): Promise<Set<string>> {
  return new Promise((resolve) => {
    const ok = new Set<string>();
    if (urls.length === 0 || typeof window === "undefined") { resolve(ok); return; }
    let done = 0;
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(ok); } };
    const timer = window.setTimeout(finish, timeoutMs);
    urls.forEach((url) => {
      const img = new Image();
      const mark = (loaded: boolean) => {
        if (loaded) ok.add(url);
        done += 1;
        if (done >= urls.length) { window.clearTimeout(timer); finish(); }
      };
      img.onload = () => mark(true);
      img.onerror = () => mark(false);
      img.src = url;
    });
  });
}

export function CinematicOpening() {
  const [config, setConfig] = useState<CinematicOpeningConfig | null>(null);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [paused, setPaused] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finishedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  // Boot: load config, run first-launch permission ask, preload all
  // images (including the final logo) + soundtrack, then start playback.
  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    (async () => {
      const cfg = await loadCinematicOpeningConfig();
      if (cancelled) return;
      if (!cfg) { dispatchCompleted(); return; }
      if (!cfg.replayForAllUsers && hasCompleted(cfg.version)) {
        dispatchCompleted();
        return;
      }

      // First-launch: OWN the notification permission prompt. Skip web;
      // any outcome fails forward so the opening never blocks on it.
      if (isFirstEverLaunch()) {
        await requestNotificationPermissionOnce();
        if (cancelled) return;
      }

      const images = cfg.scenes.map((s) => s.image).filter((x): x is string => !!x);
      // Always preload the local logo so Scene 6 never flashes with a
      // missing image. Preload runs against locally-bundled assets and
      // is expected to complete quickly.
      const preloadTargets = Array.from(new Set([...images, CINEMATIC_LOGO_URL]));
      const loaded = await preloadImages(preloadTargets, PRELOAD_TIMEOUT_MS);
      if (cancelled) return;
      const playable = cfg.scenes.filter((s) => !s.image || loaded.has(s.image));
      if (playable.length === 0) {
        dispatchCompleted();
        return;
      }
      setConfig({ ...cfg, scenes: playable });
      setActive(true);
    })();
    return () => { cancelled = true; };
  }, []);


  const scenes = config?.scenes ?? [];
  const currentScene = scenes[index];

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFadingOut(true);
    window.setTimeout(() => {
      if (config) markCompleted(config.version);
      setActive(false);
      dispatchCompleted();
    }, reducedMotion ? 250 : FINAL_FADE_MS);
  }, [config, reducedMotion]);

  // Scene timer — cleared on transition, pause, and unmount.
  useEffect(() => {
    if (!active || !currentScene || paused || fadingOut) return;
    const timer = window.setTimeout(() => {
      if (index >= scenes.length - 1) {
        finish();
      } else {
        setIndex((i) => i + 1);
      }
    }, Math.max(400, currentScene.durationMs));
    return () => window.clearTimeout(timer);
  }, [active, currentScene, index, scenes.length, paused, fadingOut, finish]);

  // Lock body scroll while active.
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  // Capacitor App lifecycle — pause timers on background.
  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  // Overlay integration: while active, Back should surface our Skip-confirm.
  const requestSkip = useCallback(() => {
    if (finishedRef.current) return;
    if (currentScene?.allowSkip === false) return;
    setConfirmOpen(true);
    setPaused(true);
  }, [currentScene]);
  useOverlayDismiss(useMemo(() => (active && !fadingOut ? requestSkip : () => {}), [active, fadingOut, requestSkip]));

  const canSkip = currentScene?.allowSkip !== false;

  // Continuous soundtrack — one stable src across the whole opening.
  // Per-scene `soundtrackLevel` drives the volume envelope; the audio
  // element is never restarted on scene changes.
  const audioSettings = audioManager.getSettings();
  const soundOn = audioSettings.soundEnabled && audioSettings.ambienceEnabled;
  const soundtrackSrc = soundOn ? config?.soundtrack?.url : undefined;

  // Carry the last non-null scene level forward when a scene omits it,
  // so we never accidentally drop to silence mid-sequence.
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

  const ambientTarget = soundOn
    ? soundtrackLevel *
      (audioSettings.masterVolume ?? 1) *
      (audioSettings.ambienceVolume ?? 1)
    : 0;

  if (!mounted || typeof document === "undefined") return null;
  if (!active || !config) return null;

  const node = (
    <div
      className="fixed inset-0 z-[2000] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic opening"
      style={{
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${reducedMotion ? 300 : FINAL_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        willChange: "opacity",
      }}
    >
      {scenes.map((s, i) => (
        <SceneRenderer
          key={s.id}
          scene={s}
          active={i === index}
          fadingOut={fadingOut}
          reducedMotion={reducedMotion}
        />
      ))}

      <AmbientAudio
        src={soundtrackSrc}
        targetVolume={ambientTarget}
        paused={paused}
        stopping={fadingOut}
      />

      {currentScene?.showFinalLogo && (
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
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
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
