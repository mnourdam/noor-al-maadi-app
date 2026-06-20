import { useEffect, useState } from "react";
import { audioManager, type AudioSettings } from "@/lib/audioManager";

/** Subscribe to global audio settings; updates trigger re-render. */
export function useAudioSettings(): [AudioSettings, (patch: Partial<AudioSettings>) => void] {
  const [settings, setSettings] = useState<AudioSettings>(() => audioManager.getSettings());
  useEffect(() => audioManager.subscribe(setSettings), []);
  return [settings, (patch) => audioManager.updateSettings(patch)];
}
