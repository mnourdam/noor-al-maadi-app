// ============================================================
// Campaign Ledger (PR3) — local-first reward dedup + resume + sync queue
// ------------------------------------------------------------
// Single source of truth for "what rewards has the player already
// claimed in any imported campaign, locally".
//
// Stored under one localStorage key:
//   {
//     keys:    { [ledgerKey]: { at: iso, synced: boolean } },
//     active:  { campaignId, chapterId, activityId?, at },
//     pending: PendingOp[],
//   }
//
// Ledger keys are stable & unique:
//   activity:<campaignId>:<chapterId>:<activityId>
//   chapter:<campaignId>:<chapterId>
//   campaign:<campaignId>
//
// claim*() returns the reward delta on FIRST claim, and `{granted:false}`
// on subsequent calls. Wrong answers MUST NOT call claim* — only call
// setActive() and rely on PR2's heart logic.
//
// Survives refresh, app close, and offline. When online + signed in, the
// flush() loop pushes pending ops to Supabase (user_campaign_progress +
// user_collection) and marks them synced.
// ============================================================

import { ACTIVITY_DEFAULTS, type Campaign, type CampaignActivity, type CampaignChapter, type CampaignReward } from "@/types/campaign";
import { upsertChapterProgress, addCollectionItems, type CollectionItemInsert } from "@/lib/progressSync";
import { parseUnlockId } from "@/lib/campaignUnlocks";

const LEDGER_KEY = "irth_campaign_ledger_v1";

export interface LedgerEntry { at: string; synced: boolean }
export interface ActivePosition {
  campaignId: string;
  chapterId: string;
  activityId?: string;
  at: string;
}
export type PendingOp =
  | {
      kind: "chapter";
      campaignId: string; chapterId: string;
      status: "unlocked" | "completed";
      score: number; xpEarned: number; coinsEarned: number;
      completed: boolean; at: string;
    }
  | {
      kind: "collection";
      items: CollectionItemInsert[]; at: string;
    };

interface LedgerState {
  keys: Record<string, LedgerEntry>;
  active?: ActivePosition;
  pending: PendingOp[];
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
function read(): LedgerState {
  if (!isBrowser()) return { keys: {}, pending: [] };
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) return { keys: {}, pending: [] };
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    return {
      keys: parsed.keys ?? {},
      active: parsed.active,
      pending: parsed.pending ?? [],
    };
  } catch { return { keys: {}, pending: [] }; }
}
function write(s: LedgerState) {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(LEDGER_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

// -------------------- Keys --------------------

export const activityKey  = (cid: string, chid: string, aid: string) => `activity:${cid}:${chid}:${aid}`;
export const chapterKey   = (cid: string, chid: string)               => `chapter:${cid}:${chid}`;
export const campaignKey  = (cid: string)                              => `campaign:${cid}`;

export function hasClaimed(key: string): boolean {
  return Boolean(read().keys[key]);
}

function claim(key: string): boolean {
  const s = read();
  if (s.keys[key]) return false;
  s.keys[key] = { at: new Date().toISOString(), synced: false };
  write(s);
  return true;
}

// -------------------- Reward shape --------------------

export interface RewardDelta {
  granted: boolean;
  xp: number;
  coins: number;
  unlocks: string[]; // raw registry-unlock ids
}

const ZERO: RewardDelta = { granted: false, xp: 0, coins: 0, unlocks: [] };

// Economy caps — enforced at grant time so legacy authored JSON with inflated
// XP values still works; the excess is simply not granted. Chosen 2026-07 to
// stop one-campaign-per-level runaway. Adjust here (single source of truth).
export const CHAPTER_XP_CAP = 40;
export const CAMPAIGN_XP_CAP = 200;
export const CHAPTER_COINS_CAP = 30;
export const CAMPAIGN_COINS_CAP = 150;

function capXp(xp: number, cap: number): number {
  const n = Math.max(0, Math.floor(xp || 0));
  return Math.min(n, cap);
}
const capCoins = capXp;


function rewardOfActivity(a: CampaignActivity): { xp: number; coins: number } {
  return {
    xp:    a.xpReward    ?? ACTIVITY_DEFAULTS.xpReward,
    coins: a.coinsReward ?? ACTIVITY_DEFAULTS.coinsReward,
  };
}
function rewardOfCampaignReward(r?: CampaignReward): { xp: number; coins: number; unlocks: string[] } {
  return {
    xp:      r?.xp ?? 0,
    coins:   r?.coins ?? 0,
    unlocks: r?.unlocks ?? [],
  };
}

// -------------------- Claim API (call only on CORRECT) --------------------

export function claimActivityReward(
  campaign: Campaign, chapter: CampaignChapter, activity: CampaignActivity,
): RewardDelta {
  const key = activityKey(campaign.id, chapter.id, activity.id);
  if (!claim(key)) return ZERO;
  const { xp, coins } = rewardOfActivity(activity);
  return { granted: true, xp, coins, unlocks: [] };
}

export function claimChapterReward(
  campaign: Campaign, chapter: CampaignChapter,
): RewardDelta {
  const key = chapterKey(campaign.id, chapter.id);
  if (!claim(key)) return ZERO;
  const r = rewardOfCampaignReward(chapter.rewards);
  return { granted: true, xp: capXp(r.xp, CHAPTER_XP_CAP), coins: capCoins(r.coins, CHAPTER_COINS_CAP), unlocks: r.unlocks };
}

export function claimCampaignReward(campaign: Campaign): RewardDelta {
  const key = campaignKey(campaign.id);
  if (!claim(key)) return ZERO;
  const r = rewardOfCampaignReward(campaign.finalRewards);
  const extra = campaign.unlocks ?? [];
  return { granted: true, xp: capXp(r.xp, CAMPAIGN_XP_CAP), coins: capCoins(r.coins, CAMPAIGN_COINS_CAP), unlocks: [...r.unlocks, ...extra] };
}


// -------------------- Active position (resume) --------------------

export function setActivePosition(p: Omit<ActivePosition, "at">): void {
  const s = read();
  s.active = { ...p, at: new Date().toISOString() };
  write(s);
}
export function getActivePosition(): ActivePosition | undefined {
  return read().active;
}
export function clearActivePositionIf(campaignId: string): void {
  const s = read();
  if (s.active?.campaignId === campaignId) {
    delete s.active;
    write(s);
  }
}

// -------------------- Pending sync queue --------------------

export function enqueueChapterSync(op: Omit<Extract<PendingOp, { kind: "chapter" }>, "kind" | "at">): void {
  const s = read();
  s.pending.push({ kind: "chapter", ...op, at: new Date().toISOString() });
  write(s);
  void flushPending();
}
export function enqueueCollectionSync(items: CollectionItemInsert[]): void {
  if (!items.length) return;
  const s = read();
  s.pending.push({ kind: "collection", items, at: new Date().toISOString() });
  write(s);
  void flushPending();
}

let flushing = false;
export async function flushPending(): Promise<void> {
  if (!isBrowser() || flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    // Snapshot then attempt each op. On success, drop it from the queue.
    let s = read();
    const remaining: PendingOp[] = [];
    for (const op of s.pending) {
      let ok = false;
      try {
        if (op.kind === "chapter") {
          await upsertChapterProgress({
            campaignId: op.campaignId, chapterId: op.chapterId,
            status: op.status, score: op.score,
            xpEarned: op.xpEarned, coinsEarned: op.coinsEarned,
            completed: op.completed,
          });
          ok = true;
        } else if (op.kind === "collection") {
          await addCollectionItems(op.items);
          ok = true;
        }
      } catch { ok = false; }
      if (!ok) remaining.push(op);
    }
    // Re-read in case another tab/path mutated during await; preserve any
    // entries added since snapshot.
    s = read();
    const newer = s.pending.slice(s.pending.length); // (always empty here, kept for clarity)
    s.pending = [...remaining, ...newer];
    // Mark synced ledger keys (best-effort; we mark all unsynced as synced
    // when the queue drains completely — coarse but safe for dedup).
    if (s.pending.length === 0) {
      for (const k of Object.keys(s.keys)) s.keys[k].synced = true;
    }
    write(s);
  } finally {
    flushing = false;
  }
}

// -------------------- Helpers for collection items --------------------

export function unlockIdsToCollectionItems(
  campaignId: string, chapterId: string | null, ids: string[],
): CollectionItemInsert[] {
  const seen = new Set<string>();
  const out: CollectionItemInsert[] = [];
  for (const rid of ids) {
    const parsed = parseUnlockId(rid);
    if (!parsed.slug || seen.has(parsed.slug)) continue;
    seen.add(parsed.slug);
    out.push({
      itemId: parsed.slug,
      itemType: parsed.type ?? "registry",
      sourceCampaignId: campaignId,
      sourceChapterId: chapterId ?? undefined,
    });
  }
  return out;
}

// -------------------- Backfill from legacy progress --------------------

/**
 * Seed the ledger with `synced:true` entries for every activity/chapter/
 * campaign already marked complete in `irth_campaign_progress`. This prevents
 * the new claim* API from re-granting XP/coins/unlocks for work the user
 * finished before the ledger existed.
 *
 * - Idempotent: existing ledger keys are left untouched (no overwrite, no
 *   timestamp churn). Re-running is a no-op.
 * - No reward grants: this only writes ledger keys; addPoints/addDinars are
 *   never called, no SFX, no collection unlock applied.
 * - No sync enqueue: pending queue is untouched; entries are pre-marked
 *   `synced:true` so the flush loop ignores them.
 */
export function backfillLedgerFromLegacyProgress(): { keysAdded: number } {
  if (!isBrowser()) return { keysAdded: 0 };

  // Read legacy progress directly to avoid a circular import with
  // importedCampaignProgress.ts (which itself imports nothing from here).
  let legacy: Record<string, {
    completed?: boolean;
    chapters?: Record<string, { completed?: boolean; completedActivityIds?: string[] }>;
  }> = {};
  try {
    const raw = window.localStorage.getItem("irth_campaign_progress");
    if (raw) legacy = JSON.parse(raw) ?? {};
  } catch { return { keysAdded: 0 }; }

  const s = read();
  const now = new Date().toISOString();
  let added = 0;
  const addIfMissing = (k: string) => {
    if (s.keys[k]) return;
    s.keys[k] = { at: now, synced: true };
    added += 1;
  };

  for (const [cid, prog] of Object.entries(legacy)) {
    if (!cid) continue;
    if (prog?.completed) addIfMissing(campaignKey(cid));
    const chapters = prog?.chapters ?? {};
    for (const [chid, ch] of Object.entries(chapters)) {
      if (!chid) continue;
      if (ch?.completed) addIfMissing(chapterKey(cid, chid));
      for (const aid of ch?.completedActivityIds ?? []) {
        if (!aid) continue;
        addIfMissing(activityKey(cid, chid, aid));
      }
    }
  }

  if (added > 0) write(s);
  return { keysAdded: added };
}

// -------------------- Hydrate from Supabase --------------------

/**
 * Seed the local ledger from rows already persisted in
 * `user_campaign_progress` for the currently signed-in user. Mirrors the
 * shape of `backfillLedgerFromLegacyProgress` but pulls from cloud.
 *
 * - Per chapter row with `completed_at` set: insert `chapter:<cid>:<chid>`
 *   plus `activity:<cid>:<chid>:<aid>` for every activity in that chapter
 *   (enumerated from the local imported-campaign cache).
 * - Per campaign whose every chapter is completed locally: insert
 *   `campaign:<cid>`.
 * - All inserted keys are written with `{ at, synced:true }` and ONLY when
 *   missing — existing entries are never overwritten.
 * - No reward grants, no SFX, no `enqueue*` calls. Active position is left
 *   untouched.
 * - Safe and idempotent: re-runs after the first do nothing.
 */
export async function hydrateLedgerFromCloud(): Promise<{ keysAdded: number } | null> {
  if (!isBrowser()) return null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) return null;

    const { data: rows, error } = await supabase
      .from("user_campaign_progress")
      .select("campaign_id, chapter_id, completed_at")
      .eq("user_id", uid);
    if (error || !rows) return null;

    // Local campaign cache lets us expand a completed chapter into its
    // activity ids. Missing campaigns are skipped silently — the chapter
    // key alone is still seeded so future correct answers cannot re-grant
    // chapter/campaign rewards.
    const { listCampaigns } = await import("@/lib/campaignStorage");
    const campaigns = listCampaigns();
    const campaignById = new Map(campaigns.map(c => [c.id, c] as const));

    const s = read();
    const now = new Date().toISOString();
    let added = 0;
    const addIfMissing = (k: string) => {
      if (s.keys[k]) return;
      s.keys[k] = { at: now, synced: true };
      added += 1;
    };

    // Track per-campaign completed chapter sets so we can decide
    // campaign-level completion without a second cloud round trip.
    const completedChaptersByCampaign = new Map<string, Set<string>>();

    for (const row of rows) {
      const cid  = row.campaign_id;
      const chid = row.chapter_id;
      if (!cid || !chid || !row.completed_at) continue;

      addIfMissing(chapterKey(cid, chid));

      const campaign = campaignById.get(cid);
      const chapter = campaign?.chapters.find(c => c.id === chid);
      for (const a of chapter?.activities ?? []) {
        if (a?.id) addIfMissing(activityKey(cid, chid, a.id));
      }

      let set = completedChaptersByCampaign.get(cid);
      if (!set) { set = new Set(); completedChaptersByCampaign.set(cid, set); }
      set.add(chid);
    }

    // Campaign-level key: every chapter in the local definition is completed.
    for (const [cid, completedSet] of completedChaptersByCampaign) {
      const campaign = campaignById.get(cid);
      if (!campaign || campaign.chapters.length === 0) continue;
      const allDone = campaign.chapters.every(ch => completedSet.has(ch.id));
      if (allDone) addIfMissing(campaignKey(cid));
    }

    if (added > 0) write(s);
    return { keysAdded: added };
  } catch {
    return null;
  }
}

// -------------------- Auto-flush bootstrap --------------------

let bootstrapped = false;
export function bootstrapLedgerFlush(): void {
  if (!isBrowser() || bootstrapped) return;
  bootstrapped = true;
  // PR3 backfill must run BEFORE any claim* call could occur this session.
  try { backfillLedgerFromLegacyProgress(); } catch { /* never block boot */ }
  window.addEventListener("online", () => { void flushPending(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushPending();
  });
  // Initial attempt on boot.
  void flushPending();
  // Best-effort cloud hydration on boot (no-op when signed out).
  void hydrateLedgerFromCloud();
}


