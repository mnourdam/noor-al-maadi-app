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

  // Chapter completion is STICKY. Once a chapter is completed it stays
  // completed for the life of the account, even if the admin later
  // republishes the campaign with additional activities. Regressing this
  // flag corrupts unlock order and wipes checkmarks (P0, 2026-07).
  const allDone = chapter.activities.every(a => ch.completedActivityIds.includes(a.id));
  ch.completed = ch.completed || allDone;

  // Campaign completion is STICKY for the same reason.
  cur.chapters[chapter.id] = ch;
  const campaignDone = campaign.chapters.every(c => cur.chapters[c.id]?.completed);
  const wasCompleted = cur.completed;
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

  // Record the sticky completion fact once, at the completion transition.
  // Best-effort, offline-safe; failures never affect gameplay state.
  if (campaignDone && !wasCompleted) {
    void import("@/lib/campaigns/completions")
      .then(mod => mod.recordCampaignCompletion({
        campaignId: campaign.id,
        campaignVersion: (campaign as any).version ?? null,
        source: "gameplay",
      }))
      .catch(() => { /* silent */ });
  }
  return cur;
}

/**
 * Force an activity into the chapter's completedActivityIds without awarding
 * XP/coins. Used when the user answered wrong and acknowledges the feedback
 * to proceed (a heart was already deducted via recordActivity).
 */
export function markActivityComplete(
  campaign: Campaign,
  chapter: CampaignChapter,
  activity: CampaignActivity,
): CampaignProgress {
  const all = readAll();
  const cur = all[campaign.id] ?? blankCampaign(campaign.id);
  const ch  = cur.chapters[chapter.id] ?? blankChapter();
  if (!ch.completedActivityIds.includes(activity.id)) {
    ch.completedActivityIds = [...ch.completedActivityIds, activity.id];
  }
  const allDone = chapter.activities.every(a => ch.completedActivityIds.includes(a.id));
  ch.completed = ch.completed || allDone; // sticky (see recordActivity)

  cur.chapters[chapter.id] = ch;
  const campaignDone = campaign.chapters.every(c => cur.chapters[c.id]?.completed);
  const wasCompleted = cur.completed;
  if (campaignDone && !cur.completed) {
    cur.completed = true;
    const unlocks = new Set<string>(cur.unlockedRegistryIds);
    (campaign.unlocks ?? []).forEach(u => unlocks.add(u));
    (campaign.finalRewards?.unlocks ?? []).forEach(u => unlocks.add(u));
    campaign.chapters.forEach(c => (c.rewards?.unlocks ?? []).forEach(u => unlocks.add(u)));
    cur.unlockedRegistryIds = [...unlocks];
  }
  cur.updatedAt = new Date().toISOString();
  all[campaign.id] = cur;
  writeAll(all);
  if (campaignDone && !wasCompleted) {
    void import("@/lib/campaigns/completions")
      .then(mod => mod.recordCampaignCompletion({
        campaignId: campaign.id,
        campaignVersion: (campaign as any).version ?? null,
        source: "gameplay",
      }))
      .catch(() => { /* silent */ });
  }
  return cur;
}

export function isChapterUnlocked(campaign: Campaign, chapter: CampaignChapter): boolean {
  // Explicit dependency wins when authored.
  if (chapter.unlockRequirement) {
    return Boolean(getChapterProgress(campaign.id, chapter.unlockRequirement).completed);
  }
  // Default rule: strict sequential order. First chapter is always unlocked;
  // EVERY chapter earlier in the sequence must be completed — not just the
  // immediately previous one. This preserves invariant #1 (a chapter can
  // never be unlocked ahead of an earlier incomplete chapter) even when
  // some middle chapter regressed to incomplete after a republish.
  const sorted = [...campaign.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = sorted.findIndex(c => c.id === chapter.id);
  if (idx <= 0) return true;
  const prog = getCampaignProgress(campaign.id);
  for (let i = 0; i < idx; i++) {
    if (!prog.chapters[sorted[i].id]?.completed) return false;
  }
  return true;
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

// ============================================================
// Cloud → local hydration (backward compat / reinstall recovery)
// ------------------------------------------------------------
// Reads user_campaign_progress rows for the signed-in user and merges
// them into `irth_campaign_progress`. NEVER downgrades local progress —
// only ADDs missing completed chapters/activities. A one-time backup of
// the pre-merge state is saved to `irth_campaign_progress.backup_v1`.
// Safe to call repeatedly; idempotent.
// ============================================================

const BACKUP_KEY = "irth_campaign_progress.backup_v1";
const HYDRATED_FLAG = "irth_campaign_progress.cloud_hydrated_v1";

export async function hydrateLegacyProgressFromCloud(): Promise<{ chaptersAdded: number; campaignsCompleted: number } | null> {
  if (!isBrowser()) return null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;

    const { data: rows, error } = await supabase
      .from("user_campaign_progress")
      .select("campaign_id, chapter_id, completed_at, xp_earned, coins_earned, score")
      .eq("user_id", uid);
    if (error || !rows || !rows.length) return null;

    // One-time backup of existing local progress before we touch it.
    try {
      if (!window.localStorage.getItem(BACKUP_KEY)) {
        const existing = window.localStorage.getItem(PROGRESS_KEY);
        if (existing) window.localStorage.setItem(BACKUP_KEY, existing);
      }
    } catch { /* quota — non-fatal */ }

    // Need the local campaign cache to expand chapter rows into activity IDs
    // and to evaluate campaign-level completion.
    const { listCampaigns } = await import("@/lib/campaignStorage");
    const campaigns = listCampaigns();
    const campaignById = new Map(campaigns.map(c => [c.id, c] as const));

    const all = readAll();
    let chaptersAdded = 0;
    let campaignsCompleted = 0;
    const now = new Date().toISOString();
    const touchedCampaigns = new Set<string>();

    // Pass 1 — apply direct chapter completions from cloud.
    const cloudChapters = new Map<string, Map<string, {
      completed: boolean; xpEarned: number; coinsEarned: number;
    }>>();
    for (const row of rows) {
      const cid = row.campaign_id;
      const chid = row.chapter_id;
      if (!cid || !chid) continue;

      let map = cloudChapters.get(cid);
      if (!map) { map = new Map(); cloudChapters.set(cid, map); }
      const prev = map.get(chid);
      map.set(chid, {
        completed: (prev?.completed || !!row.completed_at) as boolean,
        xpEarned: Math.max(prev?.xpEarned ?? 0, row.xp_earned ?? 0),
        coinsEarned: Math.max(prev?.coinsEarned ?? 0, row.coins_earned ?? 0),
      });
    }

    // Pass 2 — apply transitive completion. If chapter N is completed on the
    // server, invariant #1 guarantees chapters 1..N-1 were also completed on
    // some device. Their rows may have been overwritten to completed_at=NULL
    // by the pre-fix regression bug (P0). Restore them here so a reinstall /
    // cross-device login does not lose earlier completions.
    for (const [cid, map] of cloudChapters) {
      const campaign = campaignById.get(cid);
      if (!campaign) continue;
      const sorted = [...campaign.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      let seenCompletedIdx = -1;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (map.get(sorted[i].id)?.completed) { seenCompletedIdx = i; break; }
      }
      for (let i = 0; i <= seenCompletedIdx; i++) {
        const chid = sorted[i].id;
        const cur = map.get(chid) ?? { completed: false, xpEarned: 0, coinsEarned: 0 };
        if (!cur.completed) {
          cur.completed = true;
          map.set(chid, cur);
        }
      }
    }

    // Pass 3 — merge into local map (STICKY: never downgrade local state).
    for (const [cid, map] of cloudChapters) {
      const cur = all[cid] ?? blankCampaign(cid);
      const campaign = campaignById.get(cid);
      for (const [chid, cloudCh] of map) {
        const ch = cur.chapters[chid] ?? blankChapter();
        if (ch.completed) {
          // Local already completed — leave it alone (max the reward counters).
          ch.xpEarned = Math.max(ch.xpEarned, cloudCh.xpEarned);
          ch.coinsEarned = Math.max(ch.coinsEarned, cloudCh.coinsEarned);
          cur.chapters[chid] = ch;
          continue;
        }
        if (!cloudCh.completed) continue;

        const chapter = campaign?.chapters.find(c => c.id === chid);
        const activityIds = (chapter?.activities ?? []).map(a => a.id).filter(Boolean);
        const merged = new Set<string>(ch.completedActivityIds);
        for (const aid of activityIds) merged.add(aid);
        ch.completedActivityIds = [...merged];
        ch.completed = true;
        ch.xpEarned = Math.max(ch.xpEarned, cloudCh.xpEarned);
        ch.coinsEarned = Math.max(ch.coinsEarned, cloudCh.coinsEarned);

        cur.chapters[chid] = ch;
        cur.updatedAt = now;
        touchedCampaigns.add(cid);
        chaptersAdded += 1;
      }
      all[cid] = cur;
    }


    for (const cid of touchedCampaigns) {
      const cur = all[cid];
      const campaign = campaignById.get(cid);
      if (!cur || !campaign || !campaign.chapters.length) continue;

      let xp = 0; let coins = 0;
      for (const c of campaign.chapters) {
        const cp = cur.chapters[c.id];
        if (cp) { xp += cp.xpEarned; coins += cp.coinsEarned; }
      }
      cur.totalXp = Math.max(cur.totalXp, xp);
      cur.totalCoins = Math.max(cur.totalCoins, coins);

      const allDone = campaign.chapters.every(c => cur.chapters[c.id]?.completed);
      if (allDone && !cur.completed) {
        cur.completed = true;
        const unlocks = new Set<string>(cur.unlockedRegistryIds);
        (campaign.unlocks ?? []).forEach(u => unlocks.add(u));
        (campaign.finalRewards?.unlocks ?? []).forEach(u => unlocks.add(u));
        campaign.chapters.forEach(c => (c.rewards?.unlocks ?? []).forEach(u => unlocks.add(u)));
        cur.unlockedRegistryIds = [...unlocks];
        campaignsCompleted += 1;
      }
      all[cid] = cur;
    }

    writeAll(all);
    try { window.localStorage.setItem(HYDRATED_FLAG, now); } catch { /* noop */ }
    try { window.dispatchEvent(new CustomEvent("irth:campaign-progress:updated")); } catch { /* noop */ }
    return { chaptersAdded, campaignsCompleted };
  } catch {
    return null;
  }
}

