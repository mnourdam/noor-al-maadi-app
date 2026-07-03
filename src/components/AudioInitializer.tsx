import { useEffect } from "react";
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

  useEffect(() => {
    audioManager.init();
    bindSfxHooks();
  }, []);

  useEffect(() => {
    audioManager.setAmbienceLayer(isCampaignRoute(pathname) ? "campaign" : "global");
  }, [pathname]);

  return null;
}
