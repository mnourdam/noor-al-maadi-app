import { useEffect, useRef, type ReactNode } from "react";
import { audioManager } from "@/lib/audioManager";
import type { CampaignThemeId } from "@/lib/audio/campaignThemes";

/**
 * Owner of the campaign section ambience for the whole campaign context.
 *
 * Mounted in the `/campaigns` layout so the theme is already active before
 * any child renders — including a cinematic intro opened by deep link.
 * The intro (and every chapter screen) is a passive consumer: it never
 * starts, stops or swaps audio.
 *
 * Lifecycle contract:
 *  - same `sectionKey` across navigations ⇒ exact no-op, music never restarts
 *  - different `sectionKey` ⇒ single crossfade to the new source
 *  - unmount (leaving the campaign context) ⇒ back to the default ambience
 */
export function CampaignAudioScope({
  sectionKey,
  children,
}: {
  sectionKey: CampaignThemeId | null;
  children?: ReactNode;
}) {
  const applied = useRef<CampaignThemeId | null>(null);

  useEffect(() => {
    if (applied.current === sectionKey) return;
    applied.current = sectionKey;
    audioManager.setCampaignTheme(sectionKey);
  }, [sectionKey]);

  useEffect(() => {
    return () => {
      applied.current = null;
      audioManager.setCampaignTheme(null);
    };
  }, []);

  return <>{children}</>;
}
