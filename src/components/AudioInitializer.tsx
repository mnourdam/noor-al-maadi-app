import { useEffect } from "react";
import { audioManager } from "@/lib/audioManager";
import { bindSfxHooks } from "@/lib/sfxHooks";

/** Mount once at the app root so ambience can start after first interaction. */
export function AudioInitializer() {
  useEffect(() => {
    audioManager.init();
    bindSfxHooks();
  }, []);
  return null;
}
