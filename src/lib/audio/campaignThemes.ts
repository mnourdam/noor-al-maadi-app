// ============================================================
// Campaign section ambience themes — local-first source map
// ------------------------------------------------------------
// Each section key maps to a bundled ambience loop under
// `public/audio/sections/<key>.mp3` (mono 64kbps). Files are optional:
// a missing file marks the layer failed once and the engine silently
// keeps the current ambience — never an error, never silence-by-crash.
// ============================================================

import { CAMPAIGN_SECTION_KEYS, type CampaignSectionKey } from "@/lib/campaigns/sections";

/** Theme identifier = section key. Kept as its own type for clarity. */
export type CampaignThemeId = CampaignSectionKey;

/**
 * Ordered candidate list per theme, local-first (bundled asset wins).
 * Extra candidates may be appended later as upgrade-only fallbacks.
 */
export const CAMPAIGN_THEME_SOURCES: Record<CampaignThemeId, string[]> = Object.fromEntries(
  CAMPAIGN_SECTION_KEYS.map((key) => [key, [`/audio/sections/${key}.mp3`]]),
) as Record<CampaignThemeId, string[]>;

export function campaignThemeSources(theme: CampaignThemeId | null): string[] | null {
  if (!theme) return null;
  const list = CAMPAIGN_THEME_SOURCES[theme];
  return list && list.length ? [...list] : null;
}
