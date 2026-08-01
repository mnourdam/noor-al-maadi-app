// ============================================================
// Campaign → ambience section (the ONLY ambience authority)
// ------------------------------------------------------------
// Resolution order, explicit keys only:
//   1. the campaign's authored `section_key` override
//   2. its canonical era key, via the explicit ERA_SECTION_MUSIC table
//   3. null → generic campaign ambience (never another era's track)
//
// Divider position / feed order / titles are NEVER consulted.
// ============================================================

import { asCampaignSectionKey, type CampaignSectionKey } from "@/lib/campaigns/sections";
import { sectionForEra } from "@/lib/audio/eraMusicMap";

export interface AmbienceCampaignLike {
  section_key?: unknown;
  sectionKey?: unknown;
  era?: unknown;
}

export function resolveAmbienceSection(
  campaign: AmbienceCampaignLike | null | undefined,
): CampaignSectionKey | null {
  if (!campaign) return null;
  const override =
    asCampaignSectionKey(campaign.section_key) ?? asCampaignSectionKey(campaign.sectionKey);
  if (override) return override;
  return sectionForEra(campaign.era);
}
