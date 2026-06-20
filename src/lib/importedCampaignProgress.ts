// ============================================================
// Imported Campaign Progress (localStorage adapter)
// ------------------------------------------------------------
// Tracks per-activity / per-chapter completion + running score
// for admin-imported campaigns. Stored under irth_campaign_progress
// so it does not interfere with the legacy profile state or the
// engine quiz-engine keys.
//
// When auth + cloud_saves are wired up, swap the body of these
// helpers for a Supabase upsert keyed by (user_id, campaign_id).
// ============================================================

import { ACTIVITY_DEFAULTS, type Campaign, type CampaignActivity, type CampaignChapter } from "@/types/campaign";

export const PROGRESS_KEY = "irth_campaign_progress";

export interface ChapterProgress {
  completedActivityIds: string[];
  completed: boolean;
  xpEarned: number;
  coinsEarned: number;
  heartsLost: number;
}

export interface CampaignProgress {
  campaignId: string;
  chapters: Record<string, ChapterProgress>;
  totalXp: number;
  totalCoins: number;
  totalHeartsLost: number;
  completed: boolean;
  /** Registry IDs already credited as unlocked locally (museum hookup pending). */
  unlockedRegistryIds: string[];
  updatedAt: string;
}

type ProgressMap = Record<string, CampaignProgress>;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
function readAll(): ProgressMap {
  if (!isBrowser()) return {};
  try { return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as ProgressMap; }
  catch { return {}; }
}
function writeAll(map: ProgressMap) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

function blankChapter(): ChapterProgress {
  return { completedActivityIds: [], completed: false, xpEarned: 0, coinsEarned: 0, heartsLost: 0 };
}
function blankCampaign(id: string): CampaignProgress {
  return {
    campaignId: id, chapters: {}, totalXp: 0, totalCoins: 0,
    totalHeartsLost: 0, completed: false, unlockedRegistryIds: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getCampaignProgress(campaignId: string): CampaignProgress {
  return readAll()[campaignId] ?? blankCampaign(campaignId);
}

export function getChapterProgress(campaignId: string, chapterId: string): ChapterProgress {
  return getCampaignProgress(campaignId).chapters[chapterId] ?? blankChapter();
}

/** Records the outcome of a single activity attempt. Idempotent per activity. */
export function recordActivity(
  campaign: Campaign,
  chapter: CampaignChapter,
  activity: CampaignActivity,
  correct: boolean,
): CampaignProgress {
  const all = readAll();
  const cur = all[campaign.id] ?? blankCampaign(campaign.id);
  const ch  = cur.chapters[chapter.id] ?? blankChapter();

  // Idempotent: don't double-credit a completed activity.
  if (ch.completedActivityIds.includes(activity.id)) {
    all[campaign.id] = cur;
    writeAll(all);
    return cur;
  }

  const xp     = activity.xpReward     ?? ACTIVITY_DEFAULTS.xpReward;
  const coins  = activity.coinsReward  ?? ACTIVITY_DEFAULTS.coinsReward;
  const hearts = activity.heartsPenalty ?? ACTIVITY_DEFAULTS.heartsPenalty;

  if (correct) {
    ch.completedActivityIds = [...ch.completedActivityIds, activity.id];
    ch.xpEarned    += xp;
    ch.coinsEarned += coins;
    cur.totalXp    += xp;
    cur.totalCoins += coins;
  } else {
    ch.heartsLost        += hearts;
    cur.totalHeartsLost  += hearts;
  }

  // Chapter completion = every activity attempted correctly at least once.
  const allDone = chapter.activities.every(a => ch.completedActivityIds.includes(a.id));
  ch.completed = allDone;

  // Campaign completion = every chapter completed.
  cur.chapters[chapter.id] = ch;
  const campaignDone = campaign.chapters.every(c => cur.chapters[c.id]?.completed);
  if (campaignDone && !cur.completed) {
    cur.completed = true;
    // Snapshot reward unlock ids for future museum integration.
    const unlocks = new Set<string>(cur.unlockedRegistryIds);
    (campaign.unlocks ?? []).forEach(u => unlocks.add(u));
    (campaign.finalRewards?.unlocks ?? []).forEach(u => unlocks.add(u));
    campaign.chapters.forEach(c => (c.rewards?.unlocks ?? []).forEach(u => unlocks.add(u)));
    cur.unlockedRegistryIds = [...unlocks];
  }

  cur.updatedAt = new Date().toISOString();
  all[campaign.id] = cur;
  writeAll(all);
  return cur;
}

export function isChapterUnlocked(campaign: Campaign, chapter: CampaignChapter): boolean {
  if (!chapter.unlockRequirement) return true;
  return Boolean(getChapterProgress(campaign.id, chapter.unlockRequirement).completed);
}

export function campaignCompletionPercent(campaign: Campaign): number {
  if (!campaign.chapters.length) return 0;
  const prog = getCampaignProgress(campaign.id);
  const done = campaign.chapters.filter(c => prog.chapters[c.id]?.completed).length;
  return Math.round((done / campaign.chapters.length) * 100);
}

export function resetCampaignProgress(campaignId: string): void {
  const all = readAll();
  delete all[campaignId];
  writeAll(all);
}
