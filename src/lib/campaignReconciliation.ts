// ============================================================
// Legacy Campaign Progress Reconciliation (Phase 1a)
// ------------------------------------------------------------
// Deterministic, idempotent, evidence-based repair for imported
// campaign progress. Never replays rewards. Never duplicates
// unlocks. Never infers missing chapters. Never mutates unless
// evidence justifies it.
//
// Evidence tiers (per campaign):
//   STRONG  — auto-restore campaign completion + unlock set.
//             Triggered when ANY of:
//               A) local ledger has `campaign:<cid>` claim key
//               B) applied_profile_deltas has a delta whose id
//                  starts with `campaign-complete:<cid>`
//               C) every unlock id declared by the campaign
//                  (campaign.unlocks + finalRewards.unlocks +
//                  every chapter rewards.unlocks) already exists
//                  in the player's `user_collection`
//               D) cloud user_campaign_progress has a completed
//                  row (completed_at IS NOT NULL) for every
//                  canonical chapter id
//   MEDIUM  — deterministic legacy-chapter-id remap only.
//             Never marks the campaign completed on its own;
//             may cascade to STRONG if the remap alone brings
//             the canonical chapter set to full completion.
//   WEAK    — report only. Never mutates. Explains why the
//             campaign could not be safely repaired.
//
// All repairs are keyed by a signature over the inputs; a
// successful run stores the signature so subsequent runs are
// no-ops. Same inputs -> same output, always.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { listCampaigns } from "@/lib/campaignStorage";
import { parseUnlockId } from "@/lib/campaignUnlocks";
import type { Campaign, CampaignChapter } from "@/types/campaign";

const REPORT_KEY = "irth_campaign_reconciliation.report.v1";
const SIG_KEY = "irth_campaign_reconciliation.signatures.v1";
const PROGRESS_KEY = "irth_campaign_progress";
const LEDGER_KEY = "irth_campaign_ledger_v1";

export type EvidenceTier = "strong" | "medium" | "weak" | "clean";

export interface CampaignReconciliationEntry {
  campaignId: string;
  title: string;
  tier: EvidenceTier;
  /** Human-readable evidence lines (Arabic-friendly, plain strings). */
  reasons: string[];
  /** Deterministic actions taken this run (empty for weak/clean). */
  actions: string[];
  /** Diagnostics for the weak tier explaining why no safe repair was possible. */
  diagnostics?: string[];
}

export interface ReconciliationReport {
  ranAt: string;
  signedIn: boolean;
  online: boolean;
  campaigns: CampaignReconciliationEntry[];
  summary: { strong: number; medium: number; weak: number; clean: number };
}

interface LedgerShape {
  keys?: Record<string, { at: string; synced: boolean }>;
}

interface ChapterProgress {
  completedActivityIds: string[];
  completed: boolean;
  xpEarned: number;
  coinsEarned: number;
  heartsLost: number;
}
interface CampaignProgress {
  campaignId: string;
  chapters: Record<string, ChapterProgress>;
  totalXp: number;
  totalCoins: number;
  totalHeartsLost: number;
  completed: boolean;
  unlockedRegistryIds: string[];
  updatedAt: string;
}
type ProgressMap = Record<string, CampaignProgress>;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readProgress(): ProgressMap {
  if (!isBrowser()) return {};
  try { return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as ProgressMap; }
  catch { return {}; }
}
function writeProgress(m: ProgressMap) {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(m)); } catch { /* quota */ }
}
function readLedger(): LedgerShape {
  if (!isBrowser()) return {};
  try { return JSON.parse(window.localStorage.getItem(LEDGER_KEY) ?? "{}") as LedgerShape; }
  catch { return {}; }
}
function writeLedger(l: LedgerShape) {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch { /* quota */ }
}

function readSignatures(): Record<string, string> {
  if (!isBrowser()) return {};
  try { return JSON.parse(window.localStorage.getItem(SIG_KEY) ?? "{}"); }
  catch { return {}; }
}
function writeSignatures(m: Record<string, string>) {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(SIG_KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/** Stable, deterministic hash. Order-insensitive on inputs by design (we sort). */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
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

// -------------------- Evidence gathering --------------------

function declaredUnlockSlugs(campaign: Campaign): string[] {
  const raw: string[] = [];
  (campaign.unlocks ?? []).forEach(u => raw.push(u));
  (campaign.finalRewards?.unlocks ?? []).forEach(u => raw.push(u));
  for (const ch of campaign.chapters) {
    (ch.rewards?.unlocks ?? []).forEach(u => raw.push(u));
  }
  const out = new Set<string>();
  for (const r of raw) {
    const p = parseUnlockId(r);
    if (p.slug) out.add(p.slug);
  }
  return [...out].sort();
}

function chapterActivityOverlap(stale: string[], canonical: CampaignChapter): number {
  const set = new Set(stale);
  const ids = canonical.activities.map(a => a.id).filter(Boolean);
  if (ids.length === 0) return 0;
  let hit = 0;
  for (const id of ids) if (set.has(id)) hit++;
  return hit / ids.length;
}

/**
 * Deterministic legacy chapter id -> canonical chapter id mapping.
 * A stale key maps to a canonical chapter ONLY when:
 *   - the stale id equals the canonical id (case + whitespace collapsed), OR
 *   - the stale chapter's completedActivityIds cover 100% of exactly one
 *     canonical chapter's activity id set (unique full-overlap match).
 * Any ambiguity -> null (no remap).
 */
function mapLegacyChapterId(
  staleId: string,
  staleCompletedActivityIds: string[],
  canonical: CampaignChapter[],
): { canonicalId: string; reason: string } | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const idHit = canonical.find(c => norm(c.id) === norm(staleId));
  if (idHit) return { canonicalId: idHit.id, reason: "id-normalized-match" };

  const fullMatches = canonical.filter(c => chapterActivityOverlap(staleCompletedActivityIds, c) >= 1);
  if (fullMatches.length === 1) {
    return { canonicalId: fullMatches[0].id, reason: "activity-set-full-overlap" };
  }
  return null;
}

interface CloudSnapshot {
  cloudCompletedByCampaign: Map<string, Set<string>>;
  campaignCompleteDeltaIds: Set<string>; // set of campaignIds proven by profile-delta ledger
  collectionSlugs: Set<string>;
}

async function fetchCloudSnapshot(uid: string): Promise<CloudSnapshot> {
  const [progressRes, deltaRes, collectionRes] = await Promise.all([
    supabase.from("user_campaign_progress").select("campaign_id, chapter_id, completed_at").eq("user_id", uid),
    supabase.from("applied_profile_deltas").select("delta_id, source").eq("user_id", uid),
    supabase.from("user_collection").select("item_id, source_campaign_id").eq("user_id", uid),
  ]);

  const cloudCompletedByCampaign = new Map<string, Set<string>>();
  for (const row of progressRes.data ?? []) {
    if (!row.campaign_id || !row.chapter_id || !row.completed_at) continue;
    let set = cloudCompletedByCampaign.get(row.campaign_id);
    if (!set) { set = new Set(); cloudCompletedByCampaign.set(row.campaign_id, set); }
    set.add(row.chapter_id);
  }

  const campaignCompleteDeltaIds = new Set<string>();
  for (const row of deltaRes.data ?? []) {
    const id = String(row.delta_id ?? "");
    // Historical convention: `campaign-complete:<cid>` or `campaign:<cid>:complete`.
    let cid: string | null = null;
    if (id.startsWith("campaign-complete:")) cid = id.slice("campaign-complete:".length);
    else if (id.startsWith("campaign:") && id.endsWith(":complete")) cid = id.slice("campaign:".length, -":complete".length);
    if (cid) campaignCompleteDeltaIds.add(cid);
  }

  const collectionSlugs = new Set<string>();
  for (const row of collectionRes.data ?? []) {
    if (row.item_id) collectionSlugs.add(String(row.item_id).toLowerCase());
  }

  return { cloudCompletedByCampaign, campaignCompleteDeltaIds, collectionSlugs };
}

// -------------------- Main entry --------------------

export async function reconcileLegacyCampaignProgress(): Promise<ReconciliationReport> {
  const ranAt = new Date().toISOString();
  const empty: ReconciliationReport = {
    ranAt, signedIn: false, online: false, campaigns: [],
    summary: { strong: 0, medium: 0, weak: 0, clean: 0 },
  };
  if (!isBrowser()) return empty;

  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  let uid: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    uid = data.session?.user?.id ?? null;
  } catch { uid = null; }

  let cloud: CloudSnapshot = {
    cloudCompletedByCampaign: new Map(),
    campaignCompleteDeltaIds: new Set(),
    collectionSlugs: new Set(),
  };
  if (uid && online) {
    try { cloud = await fetchCloudSnapshot(uid); } catch { /* offline / RLS — local-only */ }
  }

  const campaigns = listCampaigns();
  const progress = readProgress();
  const ledger = readLedger();
  const ledgerKeys = ledger.keys ?? {};
  const signatures = readSignatures();

  const entries: CampaignReconciliationEntry[] = [];
  let anyMutation = false;
  let mutatedLedger = false;

  for (const campaign of campaigns) {
    const canonicalChapterIds = new Set(campaign.chapters.map(c => c.id));
    const declaredSlugs = declaredUnlockSlugs(campaign);
    const cloudCompleted = cloud.cloudCompletedByCampaign.get(campaign.id) ?? new Set<string>();
    const deltaProven = cloud.campaignCompleteDeltaIds.has(campaign.id);
    const ledgerCampaignKey = `campaign:${campaign.id}`;
    const ledgerProven = Boolean(ledgerKeys[ledgerCampaignKey]);
    const collectionCovers =
      declaredSlugs.length > 0 &&
      declaredSlugs.every(s => cloud.collectionSlugs.has(s));
    const cloudCoversAllChapters =
      canonicalChapterIds.size > 0 &&
      campaign.chapters.every(c => cloudCompleted.has(c.id));

    // Deterministic signature over the inputs used to make the decision.
    const sigPayload = [
      campaign.id,
      campaign.chapters.map(c => c.id).sort().join(","),
      [...cloudCompleted].sort().join(","),
      deltaProven ? "1" : "0",
      ledgerProven ? "1" : "0",
      declaredSlugs.join(","),
      declaredSlugs.filter(s => cloud.collectionSlugs.has(s)).join(","),
      Object.keys(progress[campaign.id]?.chapters ?? {}).sort().join(","),
      (progress[campaign.id]?.completed ? "1" : "0"),
    ].join("|");
    const sig = hashString(sigPayload);

    if (signatures[campaign.id] === sig) {
      // Already reconciled for these exact inputs. Idempotent no-op.
      entries.push({
        campaignId: campaign.id,
        title: campaign.title,
        tier: progress[campaign.id]?.completed ? "strong" : "clean",
        reasons: ["signature-match (already reconciled)"],
        actions: [],
      });
      continue;
    }

    const local = progress[campaign.id];
    const reasons: string[] = [];

    // ---- Strong evidence ----
    if (ledgerProven) reasons.push("ledger has campaign completion key");
    if (deltaProven) reasons.push("applied_profile_deltas contains campaign-complete delta");
    if (collectionCovers) reasons.push("all declared campaign unlocks present in user_collection");
    if (cloudCoversAllChapters) reasons.push("cloud user_campaign_progress covers every canonical chapter");

    const isStrong = ledgerProven || deltaProven || collectionCovers || cloudCoversAllChapters;

    if (isStrong) {
      const actions: string[] = [];
      const cur = local ?? blankCampaign(campaign.id);

      // Restore completion — no rewards, no delta replay, no collection sync.
      if (!cur.completed) {
        cur.completed = true;
        cur.updatedAt = ranAt;
        actions.push("marked campaign completed");
        anyMutation = true;
      }

      // Mark every canonical chapter as completed (sticky). Chapter rewards
      // are the ledger's job — we seed the ledger below so they never replay.
      for (const ch of campaign.chapters) {
        const chp = cur.chapters[ch.id] ?? blankChapter();
        if (!chp.completed) {
          chp.completed = true;
          const merged = new Set<string>(chp.completedActivityIds);
          for (const a of ch.activities) if (a.id) merged.add(a.id);
          chp.completedActivityIds = [...merged];
          cur.chapters[ch.id] = chp;
          actions.push(`chapter[${ch.id}] restored to completed`);
          anyMutation = true;
        }
      }

      // Union declared unlocks into unlockedRegistryIds (idempotent).
      const before = new Set(cur.unlockedRegistryIds);
      const allUnlocks = new Set(cur.unlockedRegistryIds);
      (campaign.unlocks ?? []).forEach(u => allUnlocks.add(u));
      (campaign.finalRewards?.unlocks ?? []).forEach(u => allUnlocks.add(u));
      for (const ch of campaign.chapters) (ch.rewards?.unlocks ?? []).forEach(u => allUnlocks.add(u));
      if (allUnlocks.size !== before.size) {
        cur.unlockedRegistryIds = [...allUnlocks];
        actions.push(`unlockedRegistryIds populated (${cur.unlockedRegistryIds.length} ids)`);
        anyMutation = true;
      }

      progress[campaign.id] = cur;

      // Seed ledger keys as synced:true so future correct answers cannot
      // re-grant rewards. This is the same guarantee that
      // backfillLedgerFromLegacyProgress provides after our writes; we do
      // it inline so a single reconciliation pass is self-contained.
      const seed = (k: string) => {
        if (!ledgerKeys[k]) {
          ledgerKeys[k] = { at: ranAt, synced: true };
          mutatedLedger = true;
        }
      };
      seed(ledgerCampaignKey);
      for (const ch of campaign.chapters) {
        seed(`chapter:${campaign.id}:${ch.id}`);
        for (const a of ch.activities) if (a.id) seed(`activity:${campaign.id}:${ch.id}:${a.id}`);
      }

      entries.push({
        campaignId: campaign.id,
        title: campaign.title,
        tier: "strong",
        reasons,
        actions,
      });
      signatures[campaign.id] = sig;
      continue;
    }

    // ---- Medium evidence: legacy chapter id remap only ----
    const localChapterKeys = Object.keys(local?.chapters ?? {});
    const staleKeys = localChapterKeys.filter(k => !canonicalChapterIds.has(k));
    const remaps: Array<{ from: string; to: string; reason: string }> = [];
    const remapConflicts: string[] = [];

    if (staleKeys.length > 0 && local) {
      // Reserve canonical ids already claimed by existing keys (canonical or
      // by a previous remap in this loop) so we never collide.
      const claimed = new Set<string>(localChapterKeys.filter(k => canonicalChapterIds.has(k)));
      for (const staleId of staleKeys) {
        const staleCh = local.chapters[staleId];
        if (!staleCh) continue;
        const mapped = mapLegacyChapterId(staleId, staleCh.completedActivityIds, campaign.chapters);
        if (!mapped) {
          remapConflicts.push(`stale[${staleId}] no deterministic canonical match`);
          continue;
        }
        if (claimed.has(mapped.canonicalId)) {
          remapConflicts.push(`stale[${staleId}] would collide with existing chapter[${mapped.canonicalId}]`);
          continue;
        }
        claimed.add(mapped.canonicalId);
        remaps.push({ from: staleId, to: mapped.canonicalId, reason: mapped.reason });
      }
    }

    if (remaps.length > 0 && local) {
      const actions: string[] = [];
      for (const r of remaps) {
        const src = local.chapters[r.from];
        const canonicalCh = campaign.chapters.find(c => c.id === r.to)!;
        // Only mark restored chapter as completed when overlap is 100% —
        // i.e. every canonical activity id is in src.completedActivityIds.
        const overlap = chapterActivityOverlap(src.completedActivityIds, canonicalCh);
        const equivalent = overlap >= 1;
        const restored: ChapterProgress = {
          completedActivityIds: equivalent
            ? [...new Set([...src.completedActivityIds, ...canonicalCh.activities.map(a => a.id).filter(Boolean)])]
            : [...src.completedActivityIds],
          completed: equivalent,
          xpEarned: src.xpEarned,
          coinsEarned: src.coinsEarned,
          heartsLost: src.heartsLost,
        };
        local.chapters[r.to] = restored;
        delete local.chapters[r.from];
        actions.push(`remapped chapter[${r.from}] → chapter[${r.to}] (${r.reason}${equivalent ? "; restored completed" : ""})`);
      }
      local.updatedAt = ranAt;
      progress[campaign.id] = local;
      anyMutation = true;

      // Cascade: if remap alone brought every canonical chapter to complete,
      // treat as strong. This is safe because the completion evidence is
      // "activity-set-full-overlap" — the player provably solved the same
      // activities on this device.
      const nowFull = campaign.chapters.every(c => local.chapters[c.id]?.completed);
      if (nowFull && !local.completed) {
        local.completed = true;
        actions.push("campaign marked completed (all canonical chapters restored by remap)");
        // Seed unlock ids + ledger keys.
        const allUnlocks = new Set(local.unlockedRegistryIds);
        (campaign.unlocks ?? []).forEach(u => allUnlocks.add(u));
        (campaign.finalRewards?.unlocks ?? []).forEach(u => allUnlocks.add(u));
        for (const ch of campaign.chapters) (ch.rewards?.unlocks ?? []).forEach(u => allUnlocks.add(u));
        local.unlockedRegistryIds = [...allUnlocks];
        const seed = (k: string) => {
          if (!ledgerKeys[k]) {
            ledgerKeys[k] = { at: ranAt, synced: true };
            mutatedLedger = true;
          }
        };
        seed(ledgerCampaignKey);
        for (const ch of campaign.chapters) {
          seed(`chapter:${campaign.id}:${ch.id}`);
          for (const a of ch.activities) if (a.id) seed(`activity:${campaign.id}:${ch.id}:${a.id}`);
        }
      }

      entries.push({
        campaignId: campaign.id,
        title: campaign.title,
        tier: nowFull ? "strong" : "medium",
        reasons: [
          "no strong evidence; deterministic legacy chapter id remap available",
          ...remaps.map(r => `map ${r.from} → ${r.to} (${r.reason})`),
        ],
        actions,
        diagnostics: remapConflicts.length ? remapConflicts : undefined,
      });
      signatures[campaign.id] = sig;
      continue;
    }

    // ---- Weak evidence: report only ----
    const hasAnyLocal = Boolean(local && Object.keys(local.chapters).length);
    const hasAnyCloud = cloudCompleted.size > 0;
    const partialCollection = declaredSlugs.length > 0 && declaredSlugs.some(s => cloud.collectionSlugs.has(s));

    if (hasAnyLocal || hasAnyCloud || partialCollection || remapConflicts.length) {
      const diagnostics: string[] = [];
      if (hasAnyLocal && staleKeys.length) {
        diagnostics.push(`local has ${staleKeys.length} stale chapter id(s) with no deterministic canonical mapping: ${staleKeys.join(", ")}`);
      }
      if (hasAnyCloud && !cloudCoversAllChapters) {
        diagnostics.push(`cloud completion covers ${cloudCompleted.size}/${canonicalChapterIds.size} canonical chapters — insufficient for strong evidence`);
      }
      if (partialCollection && !collectionCovers) {
        const missing = declaredSlugs.filter(s => !cloud.collectionSlugs.has(s));
        diagnostics.push(`user_collection has ${declaredSlugs.length - missing.length}/${declaredSlugs.length} declared unlocks — partial (missing: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""})`);
      }
      if (remapConflicts.length) diagnostics.push(...remapConflicts);
      if (diagnostics.length === 0) diagnostics.push("no actionable evidence available");

      entries.push({
        campaignId: campaign.id,
        title: campaign.title,
        tier: "weak",
        reasons: ["no strong evidence; no deterministic remap possible"],
        actions: [],
        diagnostics,
      });
      signatures[campaign.id] = sig;
      continue;
    }

    // ---- Clean: nothing to reconcile ----
    entries.push({
      campaignId: campaign.id,
      title: campaign.title,
      tier: "clean",
      reasons: ["no local, cloud, or collection evidence for this campaign"],
      actions: [],
    });
    signatures[campaign.id] = sig;
  }

  if (anyMutation) writeProgress(progress);
  if (mutatedLedger) writeLedger({ ...ledger, keys: ledgerKeys });
  writeSignatures(signatures);

  const summary = { strong: 0, medium: 0, weak: 0, clean: 0 };
  for (const e of entries) summary[e.tier] += 1;

  const report: ReconciliationReport = {
    ranAt,
    signedIn: Boolean(uid),
    online,
    campaigns: entries,
    summary,
  };
  try { window.localStorage.setItem(REPORT_KEY, JSON.stringify(report)); } catch { /* quota */ }
  if (anyMutation) {
    try { window.dispatchEvent(new CustomEvent("irth:campaign-progress:updated")); } catch { /* noop */ }
  }
  return report;
}

export function getCampaignReconciliationReport(): ReconciliationReport | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(REPORT_KEY);
    return raw ? (JSON.parse(raw) as ReconciliationReport) : null;
  } catch { return null; }
}

/** Testing / admin utility — clears memoized signatures so the next run
 *  re-evaluates every campaign from scratch. Does NOT touch progress. */
export function resetCampaignReconciliationMemo(): void {
  if (!isBrowser()) return;
  try { window.localStorage.removeItem(SIG_KEY); } catch { /* noop */ }
}
