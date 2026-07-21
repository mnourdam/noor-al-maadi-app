// ============================================================
// Campaign Rewards Granted — canonical "what was actually granted"
// ------------------------------------------------------------
// Phase 2 (Completion Integrity):
//
// The completion summary must equal what the player ACTUALLY earned
// while completing a campaign. Historically the modal read
// `getCampaignProgress(id).totalXp/totalCoins/unlockedRegistryIds`,
// which:
//   - accumulates raw per-activity xp defaults (no wrong-answer
//     scaling),
//   - never adds chapter or campaign final rewards, and
//   - never applies the ledger caps.
// That produced totals that disagreed with the profile grants.
//
// This module is the single canonical write path for
// "reward actually granted for campaign X". It is called from the
// three grant sites in the chapter player (activity / chapter /
// campaign) AFTER any scaling and AFTER the ledger has confirmed the
// claim is first-time. As a result:
//
//   Σ recorded XP     ≡ Σ XP passed to profile.addPoints for campaign X
//   Σ recorded coins  ≡ Σ coins passed to profile.addDinars  for campaign X
//   recorded unlocks  ≡ unique unlockIds passed to the collection sync
//
// The completion summary reads via `getCampaignGrantedTotals(id)` and
// treats these as truth. When a legacy completion has no grant record
// (i.e. finished before this file existed), we transparently fall
// back to the legacy `importedCampaignProgress` totals so historical
// summaries stay truthful for the version the player completed.
// ============================================================

const GRANTS_KEY = "irth_campaign_grants_v1";

export interface CampaignGrantTotals {
  xp: number;
  coins: number;
  unlocks: string[];
  updatedAt: string;
}

type GrantsMap = Record<string, CampaignGrantTotals>;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): GrantsMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(GRANTS_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) ?? {}) as GrantsMap;
  } catch {
    return {};
  }
}

function writeAll(map: GrantsMap) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(GRANTS_KEY, JSON.stringify(map));
  } catch {
    /* quota — non-fatal */
  }
}

function blank(): CampaignGrantTotals {
  return { xp: 0, coins: 0, unlocks: [], updatedAt: new Date().toISOString() };
}

/**
 * Add a grant delta to campaign X. Called from grant sites AFTER
 * scaling and AFTER the ledger has confirmed first-time. Zero-only
 * deltas are still recorded (they touch updatedAt) so downstream code
 * can distinguish "no record" from "recorded, 0 rewards".
 */
export function recordCampaignGrant(
  campaignId: string,
  delta: { xp?: number; coins?: number; unlocks?: readonly string[] },
): CampaignGrantTotals {
  const all = readAll();
  const cur = all[campaignId] ?? blank();
  const xp = Math.max(0, Math.floor(delta.xp ?? 0));
  const coins = Math.max(0, Math.floor(delta.coins ?? 0));
  cur.xp += xp;
  cur.coins += coins;
  if (delta.unlocks?.length) {
    const set = new Set(cur.unlocks);
    for (const u of delta.unlocks) if (u) set.add(u);
    cur.unlocks = [...set];
  }
  cur.updatedAt = new Date().toISOString();
  all[campaignId] = cur;
  writeAll(all);
  return cur;
}

/**
 * Canonical read for the completion summary. Falls back to the legacy
 * `importedCampaignProgress` totals when no grant record exists (i.e.
 * campaigns finished before this canonical ledger).
 */
export function getCampaignGrantedTotals(
  campaignId: string,
  fallback?: { totalXp?: number; totalCoins?: number; unlockedRegistryIds?: readonly string[] },
): { xp: number; coins: number; unlocks: string[] } {
  const rec = readAll()[campaignId];
  if (rec) {
    return { xp: rec.xp, coins: rec.coins, unlocks: [...rec.unlocks] };
  }
  return {
    xp: Math.max(0, Math.floor(fallback?.totalXp ?? 0)),
    coins: Math.max(0, Math.floor(fallback?.totalCoins ?? 0)),
    unlocks: [...(fallback?.unlockedRegistryIds ?? [])],
  };
}

/** Testing / admin utility. */
export function resetCampaignGrants(campaignId?: string): void {
  if (!isBrowser()) return;
  if (!campaignId) {
    window.localStorage.removeItem(GRANTS_KEY);
    return;
  }
  const all = readAll();
  delete all[campaignId];
  writeAll(all);
}
