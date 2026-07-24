// ============================================================
// Canonical Campaign Reward Summary
// ------------------------------------------------------------
// Single source of truth for "what did the player earn from
// campaign X". Every surface (overview completion panel,
// completion modal, profile/history) must call this — do NOT
// recompute totals from the authored campaign definition in
// UI components.
//
// Numbers come from the canonical grant ledger
// (`campaignRewardsGranted`), which is written at every grant
// site AFTER wrong-answer scaling and AFTER the idempotent
// activity/chapter/campaign ledger has confirmed first-time.
//
// The "available/potential" figures below use the authored
// campaign definition as the *maximum* the player could have
// earned. They exist for header previews only; they are NEVER
// substituted for the earned figures.
// ============================================================

import type { Campaign } from "@/types/campaign";
import { ACTIVITY_DEFAULTS } from "@/types/campaign";
import { getCampaignGrantedTotals } from "@/lib/campaignRewardsGranted";

export interface CampaignRewardSummary {
  totalAvailableXp: number;
  totalAvailableDinars: number;
  earnedXp: number;
  earnedDinars: number;
  remainingXp: number;
  remainingDinars: number;
  completionBonusXp: number;
  completionBonusDinars: number;
  alreadyGrantedCompletionBonus: boolean;
  unlocks: string[];
  hasCanonicalLedger: boolean;
}

function computeAvailable(campaign: Campaign): { xp: number; coins: number } {
  let xp = 0;
  let coins = 0;
  for (const ch of campaign.chapters ?? []) {
    for (const a of ch.activities ?? []) {
      xp   += a.xpReward    ?? ACTIVITY_DEFAULTS.xpReward;
      coins += a.coinsReward ?? ACTIVITY_DEFAULTS.coinsReward;
    }
    xp    += ch.rewards?.xp    ?? 0;
    coins += ch.rewards?.coins ?? 0;
  }
  xp    += campaign.finalRewards?.xp    ?? 0;
  coins += campaign.finalRewards?.coins ?? 0;
  return { xp, coins };
}

export function computeCampaignRewardSummary(
  campaign: Campaign,
  opts: { isCampaignCompleted: boolean },
): CampaignRewardSummary {
  const available = computeAvailable(campaign);
  const bonusXp    = campaign.finalRewards?.xp    ?? 0;
  const bonusCoins = campaign.finalRewards?.coins ?? 0;

  // Canonical earned: only the ledger. No fallback to raw defaults.
  const granted = getCampaignGrantedTotals(campaign.id);
  const earnedXp     = granted.hasCanonicalLedger ? granted.xp    : 0;
  const earnedDinars = granted.hasCanonicalLedger ? granted.coins : 0;

  return {
    totalAvailableXp: available.xp,
    totalAvailableDinars: available.coins,
    earnedXp,
    earnedDinars,
    remainingXp: Math.max(0, available.xp - earnedXp),
    remainingDinars: Math.max(0, available.coins - earnedDinars),
    completionBonusXp: bonusXp,
    completionBonusDinars: bonusCoins,
    alreadyGrantedCompletionBonus: opts.isCampaignCompleted && granted.hasCanonicalLedger,
    unlocks: granted.unlocks,
    hasCanonicalLedger: granted.hasCanonicalLedger,
  };
}
