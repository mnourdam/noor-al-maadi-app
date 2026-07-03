import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { audioManager } from "@/lib/audioManager";
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

/** Mount once at the app root so ambience can start after first interaction. */
export function AudioInitializer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [debug, setDebug] = useState(() => audioManager.getDebugSnapshot());

  useEffect(() => {
    audioManager.init();
    bindSfxHooks();
  }, []);

  useEffect(() => {
    audioManager.setAmbienceLayer(isCampaignRoute(pathname) ? "campaign" : "global");
  }, [pathname]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = window.setInterval(() => setDebug(audioManager.getDebugSnapshot()), 300);
    return () => window.clearInterval(id);
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed left-3 top-3 z-[9999] max-w-[calc(100vw-1.5rem)] rounded-lg border border-gold/40 bg-surface/95 px-3 py-2 text-left text-[11px] leading-5 text-foreground shadow-elegant backdrop-blur" dir="ltr">
      <div className="font-semibold text-gold">Audio Debug</div>
      <div>activeLayer: {debug.activeLayer}</div>
      <div className="truncate">campaign src: {debug.campaignSrc}</div>
      <div>campaign readyState: {debug.campaignReadyState}</div>
      <div>campaign paused: {String(debug.campaignPaused)}</div>
      <div>campaign volume: {debug.campaignVolume}</div>
      <div className="truncate">last play error: {debug.lastPlayError ?? "none"}</div>
    </div>
  );
}
