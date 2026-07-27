import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { audioManager, type AmbienceLayer } from "@/lib/audioManager";
import { bindSfxHooks } from "@/lib/sfxHooks";

/** Routes that switch the ambience to the campaign layer. */
function isCampaignRoute(pathname: string): boolean {
  return (
    pathname === "/campaigns" ||
    pathname.startsWith("/campaigns/") ||
    pathname.startsWith("/play/campaign") ||
    pathname.startsWith("/play/chapter")
  );
}

/**
 * Routes that switch the ambience to the investigation layer — ONLY an
 * open case file or the in-play investigation screen. Browsing the case
 * catalog (`/investigations`) deliberately stays on the global ambience:
 * the case atmosphere begins the moment the player opens a file.
 * Leaving any of them crossfades straight back to the global ambience,
 * which is also the transparent fallback while the investigation asset
 * has not been produced yet.
 */
function isInvestigationRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/investigation/") ||
    pathname.startsWith("/play/investigate")
  );
}

function layerForRoute(pathname: string): AmbienceLayer {
  if (isInvestigationRoute(pathname)) return "investigation";
  if (isCampaignRoute(pathname)) return "campaign";
  return "global";
}


/** Mount once at the app root so ambience can start after first interaction. */
/**
 * Explicit opt-in for the floating Audio Debug panel. Keeps it out of the
 * public preview and player-facing builds even when `import.meta.env.DEV` is
 * true (Lovable's preview runs in dev mode). Enable by setting
 * `VITE_AUDIO_DEBUG=1` or `localStorage.setItem("irth.audioDebug","1")`.
 */
function isAudioDebugEnabled(): boolean {
  if (import.meta.env.VITE_AUDIO_DEBUG === "1" || import.meta.env.VITE_AUDIO_DEBUG === "true") {
    return true;
  }
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("irth.audioDebug") === "1";
  } catch {
    return false;
  }
}

export function AudioInitializer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [debug, setDebug] = useState(() => audioManager.getDebugSnapshot());
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    audioManager.init();
    bindSfxHooks();
    // Read the opt-in flag on the client only to avoid SSR hydration drift.
    setDebugEnabled(isAudioDebugEnabled());
  }, []);

  useEffect(() => {
    audioManager.setAmbienceLayer(layerForRoute(pathname));
  }, [pathname]);

  useEffect(() => {
    if (!debugEnabled) return;
    const id = window.setInterval(() => setDebug(audioManager.getDebugSnapshot()), 300);
    return () => window.clearInterval(id);
  }, [debugEnabled]);

  if (!debugEnabled) return null;

  return (
    <div className="fixed left-3 top-3 z-[9999] max-w-[calc(100vw-1.5rem)] rounded-lg border border-gold/40 bg-surface/95 px-3 py-2 text-left text-[11px] leading-5 text-foreground shadow-elegant backdrop-blur" dir="ltr">
      <div className="font-semibold text-gold">Audio Debug</div>
      <div>activeLayer: {debug.activeLayer}</div>
      <div className="truncate">campaign src: {debug.campaignSrc}</div>
      <div>campaign readyState: {debug.campaignReadyState}</div>
      <div>campaign paused: {String(debug.campaignPaused)}</div>
      <div>campaign volume: {debug.campaignVolume}</div>
      <div className="truncate">investigation src: {debug.investigationSrc}</div>
      <div>investigation paused: {String(debug.investigationPaused)}</div>
      <div>investigation volume: {debug.investigationVolume}</div>
      <div>investigation asset missing: {String(debug.investigationMissing)}</div>
      <div className="truncate">last play error: {debug.lastPlayError ?? "none"}</div>

    </div>
  );
}
