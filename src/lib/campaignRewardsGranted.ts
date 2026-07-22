// ============================================================
// Campaign Rewards Granted — canonical "what was actually granted"
// ------------------------------------------------------------
// Phase 2 (Completion Integrity) + Phase 8 (Chapter Breakdown):
//
// The completion summary must equal what the player ACTUALLY earned
// while completing a campaign. Historically the modal read
// `getCampaignProgress(id).totalXp/totalCoins/unlockedRegistryIds`,
// which accumulates raw per-activity xp defaults without wrong-answer
// scaling and never adds chapter/campaign final rewards.
//
// This module is the single canonical write path for
// "reward actually granted for campaign X". It is called from every
// grant site AFTER any scaling and AFTER the ledger has confirmed the
// claim is first-time. As a result:
//
//   Σ recorded XP     ≡ Σ XP passed to profile.addPoints for campaign X
//   Σ recorded coins  ≡ Σ coins passed to profile.addDinars  for campaign X
//   recorded unlocks  ≡ unique unlockIds passed to the collection sync
//
// Phase 8 adds a per-chapter breakdown so the chapter completion panel
// reads the same truth as the campaign summary, keeping the two views
// numerically consistent by construction.
// ============================================================

const GRANTS_KEY = "irth_campaign_grants_v2";
const LEGACY_KEY = "irth_campaign_grants_v1";

export interface ChapterGrantTotals {
  xp: number;
  coins: number;
  unlocks: string[];
}

export interface CampaignGrantTotals {
  xp: number;
  coins: number;
  unlocks: string[];
  /** Per-chapter breakdown (excludes campaign-final bonus). */
  perChapter: Record<string, ChapterGrantTotals>;
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
    if (raw) return (JSON.parse(raw) ?? {}) as GrantsMap;
    // One-time migration from v1 (no per-chapter breakdown).
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return {};
    const legacy = (JSON.parse(legacyRaw) ?? {}) as Record<
      string,
      { xp?: number; coins?: number; unlocks?: string[]; updatedAt?: string }
    >;
    const migrated: GrantsMap = {};
    for (const [id, rec] of Object.entries(legacy)) {
      migrated[id] = {
        xp: rec.xp ?? 0,
        coins: rec.coins ?? 0,
        unlocks: rec.unlocks ?? [],
        perChapter: {},
        updatedAt: rec.updatedAt ?? new Date().toISOString(),
      };
    }
    writeAll(migrated);
    return migrated;
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
  return {
    xp: 0,
    coins: 0,
    unlocks: [],
    perChapter: {},
    updatedAt: new Date().toISOString(),
  };
}

function blankChapter(): ChapterGrantTotals {
  return { xp: 0, coins: 0, unlocks: [] };
}

export interface GrantDelta {
  xp?: number;
  coins?: number;
  unlocks?: readonly string[];
  /** Optional chapter scope. When present the delta is also attributed to
   *  that chapter's per-chapter bucket. Omit for campaign-final bonuses. */
  chapterId?: string | null;
}

/**
 * Add a grant delta to campaign X. Called from grant sites AFTER
 * scaling and AFTER the ledger has confirmed first-time. Zero-only
 * deltas are still recorded (they touch updatedAt) so downstream code
 * can distinguish "no record" from "recorded, 0 rewards".
 */
export function recordCampaignGrant(
  campaignId: string,
  delta: GrantDelta,
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
  if (delta.chapterId) {
    const chBucket = cur.perChapter[delta.chapterId] ?? blankChapter();
    chBucket.xp += xp;
    chBucket.coins += coins;
    if (delta.unlocks?.length) {
      const set = new Set(chBucket.unlocks);
      for (const u of delta.unlocks) if (u) set.add(u);
      chBucket.unlocks = [...set];
    }
    cur.perChapter[delta.chapterId] = chBucket;
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
): { xp: number; coins: number; unlocks: string[]; hasCanonicalLedger: boolean } {
  const rec = readAll()[campaignId];
  if (rec) {
    return {
      xp: rec.xp,
      coins: rec.coins,
      unlocks: [...rec.unlocks],
      hasCanonicalLedger: true,
    };
  }
  return {
    xp: Math.max(0, Math.floor(fallback?.totalXp ?? 0)),
    coins: Math.max(0, Math.floor(fallback?.totalCoins ?? 0)),
    unlocks: [...(fallback?.unlockedRegistryIds ?? [])],
    hasCanonicalLedger: false,
  };
}

/**
 * Canonical read for the chapter-complete panel. Returns the exact
 * XP / dinars / unlocks that the player received while completing this
 * chapter (activity grants scaled for wrong answers + chapter bonus).
 * Falls back to the legacy authored figures when no canonical ledger
 * exists for the chapter (historical completions pre-Phase 8).
 */
export function getChapterGrantedTotals(
  campaignId: string,
  chapterId: string,
  fallback?: { xpEarned?: number; coinsEarned?: number },
): { xp: number; coins: number; unlocks: string[]; hasCanonicalLedger: boolean } {
  const rec = readAll()[campaignId];
  const ch = rec?.perChapter[chapterId];
  if (ch) {
    return {
      xp: ch.xp,
      coins: ch.coins,
      unlocks: [...ch.unlocks],
      hasCanonicalLedger: true,
    };
  }
  return {
    xp: Math.max(0, Math.floor(fallback?.xpEarned ?? 0)),
    coins: Math.max(0, Math.floor(fallback?.coinsEarned ?? 0)),
    unlocks: [],
    hasCanonicalLedger: false,
  };
}

/** Testing / admin utility. */
export function resetCampaignGrants(campaignId?: string): void {
  if (!isBrowser()) return;
  if (!campaignId) {
    window.localStorage.removeItem(GRANTS_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
    return;
  }
  const all = readAll();
  delete all[campaignId];
  writeAll(all);
}
