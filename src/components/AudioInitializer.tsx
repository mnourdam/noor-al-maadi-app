import { useEffect } from "react";
import { audioManager } from "@/lib/audioManager";

/** Mount once at the app root so ambience can start after first interaction. */
export function AudioInitializer() {
  useEffect(() => {
    audioManager.init();
  }, []);
  return null;
}
