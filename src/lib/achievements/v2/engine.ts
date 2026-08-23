/**
 * Achievement Engine v2 — canonical bootstrap.
 *
 * Wires canonical services into `ProgressSnapshot` slice providers and
 * runs a single-flight engine loop:
 *
 *   canonical inputs change  →  rebuildSnapshot()  →  evaluate()
 *                             →  reconcile()  →  claim (server)
 *                             →  refresh persisted mirror
 *
 * The engine is a plain module — no React coupling here. A thin React
 * driver in `driver.tsx` calls `pushCanonical(...)` whenever a canonical
 * hook value changes.
 *
 * Works for:
 *   - Guest (skips server calls, keeps unlocked ids in-memory + localStorage)
 *   - Signed-in users (claims through `claimAchievements` server fn)
 *   - Offline (queues unlocks; retries on next successful claim)
 *   - Reconnect (fetches server mirror once auth returns, reconciles)
 */

import {
  emptySnapshot,
  rebuildSnapshot,
  registerSliceProvider,
} from "./snapshot";
import { evaluate } from "./evaluator";
import { reconcile, dispatchClaimTransitions } from "./reconciler";
import { registry, ENGINE_VERSION } from "./index";
import { claimAchievements, fetchUserAchievements, repairHistoricalAchievements } from "./claim.functions";
import { dispatchAchievementHook, dispatchAchievementTransition } from "./events";
import { recordTrace } from "@/lib/diag-trace";
import { shouldEmitAchievementNotification } from "./transition-policy";
import type {
  AchievementId,
  CanonicalDomain,
  EvaluationResult,
  ProgressSnapshot,
  TransitionOrigin,
  UserAchievementRecord,
} from "./types";

// ---------- canonical inputs (mutable staging area) ----------

export interface CanonicalInputs {
  campaigns: { completedIds: readonly string[] };
  investigations: { completedIds: readonly string[] };
  encyclopedia: {
    discoveredIds: readonly string[];
    byCategory: Record<string, number>;
    byEra: Record<string, number>;
    byRegion: Record<string, number>;
  };
  museum: { ownedIds: readonly string[]; byRarity: Record<string, number> };
  atlas: { discoveredIds: readonly string[] };
  worlds: {
    completedSlugs: readonly string[];
    perWorldRatio: Record<string, number>;
  };
  xp: number;
  level: number;
  dinars: { current: number; lifetimeEarned: number };
  streak: { current: number; longest: number };
  daily: { challengesCompleted: number };
  games: { totalPlays: number };
  titles: { earnedCount: number };
  profile: { userId: string | null };
}

const inputs: CanonicalInputs = {
  campaigns: { completedIds: [] },
  investigations: { completedIds: [] },
  encyclopedia: {
    discoveredIds: [],
    byCategory: {},
    byEra: {},
    byRegion: {},
  },
  museum: { ownedIds: [], byRarity: {} },
  atlas: { discoveredIds: [] },
  worlds: { completedSlugs: [], perWorldRatio: {} },
  xp: 0,
  level: 0,
  dinars: { current: 0, lifetimeEarned: 0 },
  streak: { current: 0, longest: 0 },
  daily: { challengesCompleted: 0 },
  games: { totalPlays: 0 },
  titles: { earnedCount: 0 },
  profile: { userId: null },
};

/**
 * Resets the module-level canonical inputs to their initial empty/guest state.
 * Prevents cross-identity pollution during logout/reset cycles.
 */
function resetCanonicalInputs(): void {
  inputs.campaigns = { completedIds: [] };
  inputs.investigations = { completedIds: [] };
  inputs.encyclopedia = {
    discoveredIds: [],
    byCategory: {},
    byEra: {},
    byRegion: {},
  };
  inputs.museum = { ownedIds: [], byRarity: {} };
  inputs.atlas = { discoveredIds: [] };
  inputs.worlds = { completedSlugs: [], perWorldRatio: {} };
  inputs.xp = 0;
  inputs.level = 0;
  inputs.dinars = { current: 0, lifetimeEarned: 0 };
  inputs.streak = { current: 0, longest: 0 };
  inputs.daily = { challengesCompleted: 0 };
  inputs.games = { totalPlays: 0 };
  inputs.titles = { earnedCount: 0 };
  inputs.profile = { userId: null };
}


// ---------- slice providers (pure reads from `inputs`) ----------

let providersRegistered = false;

function registerProviders(): void {
  if (providersRegistered) return;
  providersRegistered = true;

  registerSliceProvider("campaigns", () => ({
    completedIds: new Set(inputs.campaigns.completedIds),
    inProgressIds: new Set<string>(),
    totalCompleted: inputs.campaigns.completedIds.length,
  }));
  registerSliceProvider("investigations", () => ({
    completedIds: new Set(inputs.investigations.completedIds),
    totalCompleted: inputs.investigations.completedIds.length,
    byWorldCompleted: new Map(),
  }));
  registerSliceProvider("encyclopedia", () => ({
    discoveredIds: new Set(inputs.encyclopedia.discoveredIds),
    totalDiscovered: inputs.encyclopedia.discoveredIds.length,
    byCategoryCount: new Map(Object.entries(inputs.encyclopedia.byCategory)),
    byEraCount: new Map(Object.entries(inputs.encyclopedia.byEra)),
    byRegionCount: new Map(Object.entries(inputs.encyclopedia.byRegion)),
  }));
  registerSliceProvider("museum", () => ({
    ownedIds: new Set(inputs.museum.ownedIds),
    totalOwned: inputs.museum.ownedIds.length,
    byRarityCount: new Map(Object.entries(inputs.museum.byRarity)),
  }));
  registerSliceProvider("atlas", () => ({
    discoveredIds: new Set(inputs.atlas.discoveredIds),
    totalDiscovered: inputs.atlas.discoveredIds.length,
  }));
  registerSliceProvider("worlds", () => ({
    completedSlugs: new Set(inputs.worlds.completedSlugs),
    perWorldRatio: new Map(Object.entries(inputs.worlds.perWorldRatio)),
  }));
  registerSliceProvider("xp", () => ({ total: inputs.xp }));
  registerSliceProvider("level", () => ({ value: inputs.level }));
  registerSliceProvider("dinars", () => ({
    current: inputs.dinars.current,
    lifetimeEarned: inputs.dinars.lifetimeEarned,
  }));
  registerSliceProvider("streak", () => ({
    current: inputs.streak.current,
    longest: inputs.streak.longest,
  }));
  registerSliceProvider("daily", () => ({
    challengesCompleted: inputs.daily.challengesCompleted,
  }));
  registerSliceProvider("games", () => ({ totalPlays: inputs.games.totalPlays }));
  registerSliceProvider("titles", () => ({ earnedCount: inputs.titles.earnedCount }));
  registerSliceProvider("profile", () => ({ userId: inputs.profile.userId }));
}

// ---------- engine state ----------

let snapshot: ProgressSnapshot = emptySnapshot();
let evaluation: EvaluationResult = {
  unlockedIds: new Set(),
  progress: new Map(),
  snapshotVersion: snapshot.version,
};
let persisted: Map<AchievementId, UserAchievementRecord> = new Map();
let alreadyNotified: Set<AchievementId> = new Set();
let lastClaimedSet: Set<AchievementId> = new Set();
let bootedForUserId: string | null | undefined = undefined; // undefined = never
// Historical-vs-live gate. While `false`, doCycle updates snapshot +
// evaluation but does NOT emit notifications or claim writes. This
// prevents a signed-in user's historical unlocks from re-firing as
// "just earned!" notifications on reinstall / cold-start, because
// canonical inputs land before the server mirror has been fetched.
let mirrorReady = false;
let liveTransitionsReady = false;
let baselineInFlight: Promise<void> | null = null;

const NOTIFIED_KEY = "irth.achievements.v2.notified";
const GUEST_UNLOCKS_KEY = "irth.achievements.v2.guest_unlocks";

function loadNotified(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(NOTIFIED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveNotified(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...alreadyNotified]));
  } catch {
    /* noop */
  }
}

function loadGuestUnlocks(): Map<AchievementId, UserAchievementRecord> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(GUEST_UNLOCKS_KEY);
    
    // V13 Forensic Tracing
    const owner = (import.meta as any).env ? "unknown" : "browser"; // getActiveOwner needs import
    import("@/lib/diag-trace").then(m => {
      const parsed = raw ? JSON.parse(raw) : null;
      m.recordTrace("logout-audit", "ACHIEVEMENTS_HYDRATION_SOURCE", JSON.stringify({
        owner: "checking...",
        source: "localStorage",
        logicalKey: GUEST_UNLOCKS_KEY,
        count: Array.isArray(parsed) ? parsed.length : 0,
        idsSample: Array.isArray(parsed) ? parsed.slice(0, 3).map(r => r.achievementId) : []
      }));
    }).catch(() => {});

    if (!raw) return new Map();
    const arr = JSON.parse(raw) as UserAchievementRecord[];
    return new Map(arr.map((r) => [r.achievementId, r]));
  } catch {
    return new Map();
  }
}
function saveGuestUnlocks(caller: string): void {
  if (typeof window === "undefined") return;
  
  // V13 Safety Invariant: Never save Guest unlocks while an account is logged in.
  const userId = inputs.profile.userId;
  import("@/lib/diag-trace").then(m => {
    const userId = inputs.profile.userId;

    if (userId) {
      m.recordTrace("logout-audit", "ACHIEVEMENTS_WRITE_QUARANTINED", JSON.stringify({
        owner: "guest",
        activeOwner: `user:${userId}`,
        logicalKey: GUEST_UNLOCKS_KEY,
        caller
      }));
      return;
    }

    try {
      const data = JSON.stringify([...persisted.values()]);
      window.localStorage.setItem(GUEST_UNLOCKS_KEY, data);
      
      m.recordTrace("logout-audit", "ACHIEVEMENTS_WRITE_SOURCE", JSON.stringify({
        owner: "guest",
        logicalKey: GUEST_UNLOCKS_KEY,
        count: persisted.size,
        caller
      }));
    } catch {
      /* noop */
    }
  }).catch(() => {});
}

// ---------- subscribers ----------

type Listener = () => void;
const listeners = new Set<Listener>();
export function onEngineTick(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyListeners(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[achievements] listener threw", err);
    }
  }
}

// ---------- public API ----------

export function initAchievementEngine(): void {
  registerProviders();
  if (typeof window !== "undefined") {
    alreadyNotified = loadNotified();
  }
}


/**
 * Signal that the auth state changed. On sign-in this fetches the server
 * mirror; on sign-out this clears the mirror and restores guest state.
 */
export async function resetAchievementEngine(nextUserId: string | null): Promise<void> {
  recordTrace("logout-audit", "achievements:reset:start", nextUserId);
  
  // ATOMIC RESET: Flush all module-level memory belonging to the previous identity.
  persisted = new Map();
  alreadyNotified = new Set();
  lastClaimedSet = new Set();
  
  // V13 Fix: Clear the canonical inputs staging area BEFORE starting hydration.
  // This prevents the new identity from satisfy achievements based on the 
  // previous identity's stale progression (e.g. Account A's 25 campaigns).
  resetCanonicalInputs();

  bootedForUserId = nextUserId;
  inputs.profile.userId = nextUserId;
  mirrorReady = false;
  liveTransitionsReady = false;
  baselineInFlight = null;


  if (!nextUserId) {
    persisted = loadGuestUnlocks();
    
    // V13 Guest Sanitization: Prune contaminated achievements.
    // Account achievements are always server-authoritative; any Guest unlock
    // must be earned while Guest. On logout, we clear Guest progress
    // to ensure no leakage from the previous session.
    if (persisted.size > 0) {
      import("@/lib/diag-trace").then(m => {
        m.recordTrace("logout-audit", "ACHIEVEMENTS_GUEST_SANITIZED", JSON.stringify({
          before: persisted.size,
          reason: "identity-reset-to-guest"
        }));
      }).catch(() => {});
      persisted = new Map();
      saveGuestUnlocks("resetAchievementEngine:sanitization");
    }

    for (const id of persisted.keys()) alreadyNotified.add(id);
    saveNotified();
    mirrorReady = true;
    await runCycle(allDomains(), "startup_hydration");
    liveTransitionsReady = true;
    recordTrace("logout-audit", "achievements:reset:hydrated", `guest:${persisted.size}`);
    notifyListeners();
    return;
  }

  try {
    const rows = await fetchUserAchievements();
    persisted = new Map(
      rows.map((r) => [
        r.achievement_id,
        {
          achievementId: r.achievement_id,
          unlockedAt: r.unlocked_at ?? new Date().toISOString(),
          rewardsGrantedAt: r.rewards_granted_at ?? null,
          presentedAt: r.presented_at ?? null,
          notifiedAt: r.notified_at ?? null,
          presentationOrigin: r.presentation_origin ?? null,
          repairOrigin: r.repair_origin ?? null,
          engineVersion: r.engine_version ?? ENGINE_VERSION,
          definitionVersion: r.definition_version ?? 1,
        },
      ]),
    );
    for (const id of persisted.keys()) alreadyNotified.add(id);
    saveNotified();
    recordTrace("logout-audit", "achievements:reset:hydrated", `user:${persisted.size}`);
  } catch (err) {
    console.warn("[achievements] mirror fetch failed; keeping local state", err);
  }
  mirrorReady = true;
  notifyListeners();
}

/**
 * @deprecated Use resetAchievementEngine directly for identity transitions.
 */
export async function refreshPersistedForUser(userId: string | null): Promise<void> {
  if (bootedForUserId === userId && mirrorReady) return;
  return resetAchievementEngine(userId);
}

/**
 * Update canonical inputs. Any changed domains trigger a partial re-eval.
 */
export function pushCanonical(patch: Partial<CanonicalInputs>): void {
  const changed: CanonicalDomain[] = [];
  for (const key of Object.keys(patch) as (keyof CanonicalInputs)[]) {
    (inputs as unknown as Record<string, unknown>)[key] = patch[key] as unknown;
    changed.push(key as CanonicalDomain);
  }
  if (changed.length === 0) return;
  void runCycle(changed, liveTransitionsReady ? "live_gameplay_unlock" : "historical_reconciliation");
}

let cycleInFlight: Promise<void> | null = null;
let queuedDomains: CanonicalDomain[] | null = null;
let queuedOrigin: TransitionOrigin = "historical_reconciliation";

async function runCycle(
  changedDomains: readonly CanonicalDomain[],
  origin: TransitionOrigin = liveTransitionsReady ? "live_gameplay_unlock" : "historical_reconciliation",
): Promise<void> {
  if (cycleInFlight) {
    queuedDomains = mergeDomains(queuedDomains, changedDomains);
    if (origin !== "live_gameplay_unlock") queuedOrigin = origin;
    return;
  }
  cycleInFlight = doCycle(changedDomains, origin).finally(() => {
    cycleInFlight = null;
    if (queuedDomains) {
      const next = queuedDomains;
      const nextOrigin = queuedOrigin;
      queuedDomains = null;
      queuedOrigin = liveTransitionsReady ? "live_gameplay_unlock" : "historical_reconciliation";
      void runCycle(next, nextOrigin);
    }
  });
  await cycleInFlight;
}

function mergeDomains(
  a: CanonicalDomain[] | null,
  b: readonly CanonicalDomain[],
): CanonicalDomain[] {
  const set = new Set<CanonicalDomain>(a ?? []);
  for (const d of b) set.add(d);
  return [...set];
}

async function doCycle(
  changedDomains: readonly CanonicalDomain[],
  origin: TransitionOrigin,
): Promise<void> {
  snapshot = rebuildSnapshot(snapshot, changedDomains);
  const alreadyUnlockedSet = new Set<AchievementId>(persisted.keys());
  evaluation = evaluate(snapshot, registry, alreadyUnlockedSet, {
    changedDomains,
    prev: evaluation,
  });

  // Pre-hydration: only refresh views; never notify or claim. We still
  // notifyListeners() so UI progress bars stay reactive.
  if (!mirrorReady) {
    notifyListeners();
    return;
  }


  const output = reconcile({
    registry,
    evaluation,
    persisted,
    alreadyNotified,
  });

  // V13 Forensic Tracing: Log the reason for each new unlock.
  if (output.newlyUnlocked.length > 0) {
    for (const id of output.newlyUnlocked) {
      const def = registry.byId.get(id);
      if (def) {
        // Detailed reconciliation reason trace
        recordTrace("logout-audit", "ACHIEVEMENT_RECONCILIATION_REASON", JSON.stringify({
          owner: inputs.profile.userId ? `user:${inputs.profile.userId}` : "guest",
          achievementId: id,
          inputs: def.inputs,
          satisfied: true,
          origin,
          // Snapshot evidence sample (first input domain only)
          evidence: def.inputs[0] ? (snapshot as any)[def.inputs[0]] : null
        }));
      }
    }
  }


  // Claim acknowledgements are explicitly silent; this call is a deprecated
  // no-op kept for API compatibility.
  const newClaimedThisCycle = output.newlyClaimed.filter(
    (id) => !lastClaimedSet.has(id),
  );
  if (newClaimedThisCycle.length > 0) {
    dispatchClaimTransitions(registry, newClaimedThisCycle);
  }
  lastClaimedSet = new Set(output.newlyClaimed);

  // Mark evaluated ids locally only as an optimization; server presentation
  // state is the durable truth after sign-in/reinstall.
  for (const id of output.newlyUnlocked) alreadyNotified.add(id);
  if (output.newlyUnlocked.length > 0) {
    saveNotified();
  }

  const userId = inputs.profile.userId;
  if (output.newlyUnlocked.length > 0) {
    if (!liveTransitionsReady) {
      for (const id of output.newlyUnlocked) {
        recordTransitionTrace(id, {
          origin,
          serverPersistedBeforeEvaluation: false,
          evaluatorSatisfied: true,
          reconcilerClassifiedAsNew: true,
          claimInserted: false,
          claimExisting: false,
          transitionClassification: origin,
          notificationEmitted: false,
          suppressionReason: "silent_baseline_or_historical_repair",
        });
      }
      if (userId) {
        await silentlyRepairHistorical(output.newlyUnlocked, origin);
      } else {
        for (const id of output.newlyUnlocked) {
          persisted.set(id, buildLocalRecord(id, true));
        }
        saveGuestUnlocks("doCycle:historical_reconciliation");
      }
      notifyListeners();
      return;
    }

    if (userId) {
      // Signed-in: authoritative claim + refresh mirror.
      try {
        const res = await claimAchievements({
          data: { ids: [...output.newlyUnlocked], engineVersion: ENGINE_VERSION },
        });
        const insertedSet = new Set(res.inserted);
        const existingSet = new Set(res.alreadyClaimed);
        for (const id of res.inserted) {
          const rec = buildLocalRecord(id, false);
          persisted.set(id, rec);
          emitLiveTransition(id, rec, true, false);
        }
        for (const id of output.newlyUnlocked) {
          if (!insertedSet.has(id)) {
            recordTransitionTrace(id, {
              origin,
              serverPersistedBeforeEvaluation: false,
              evaluatorSatisfied: true,
              reconcilerClassifiedAsNew: true,
              claimInserted: false,
              claimExisting: existingSet.has(id),
              transitionClassification: existingSet.has(id) ? "claim_ack" : origin,
              notificationEmitted: false,
              suppressionReason: existingSet.has(id) ? "claim_conflict_existing" : "claim_not_inserted",
            });
          }
        }
      } catch (err) {
        // Offline / transient — keep newlyNotified so we don't spam; retry next cycle.
        // eslint-disable-next-line no-console
        console.warn("[achievements] claim failed; will retry", err);
      }
    } else {
      // Guest: keep unlocks locally so guest→account migration preserves them.
      for (const id of output.newlyUnlocked) {
        const rec = buildLocalRecord(id, false);
        persisted.set(id, rec);
        emitLiveTransition(id, rec, true, false);
      }
      saveGuestUnlocks("doCycle:live_gameplay_unlock");
    }
  }

  notifyListeners();
}

// ---------- read views ----------

export function getSnapshot(): ProgressSnapshot {
  return snapshot;
}
export function getEvaluation(): EvaluationResult {
  return evaluation;
}
export function getPersisted(): ReadonlyMap<AchievementId, UserAchievementRecord> {
  return persisted;
}

/**
 * True once the server achievement mirror has been fetched (or explicitly
 * skipped for a guest). Presentation surfaces MUST wait for this before
 * treating any unlock as "live" — otherwise historical unlocks fire again
 * on cold-boot / reinstall / logout+login.
 */
export function isMirrorReady(): boolean {
  return mirrorReady;
}

export function isLiveTransitionsReady(): boolean {
  return liveTransitionsReady;
}

export async function establishAchievementLiveBaseline(): Promise<void> {
  if (!mirrorReady) return;
  if (liveTransitionsReady) return;
  if (baselineInFlight) return baselineInFlight;
  baselineInFlight = (async () => {
    await runCycle(allDomains(), "startup_hydration");
    liveTransitionsReady = true;
    recordAchievementTrace("baseline-ready", {
      user: inputs.profile.userId ? "signed-in" : "guest",
      persisted: persisted.size,
      satisfied: evaluation.unlockedIds.size,
    });
    notifyListeners();
  })().finally(() => {
    baselineInFlight = null;
  });
  return baselineInFlight;
}

/**
 * Guest → account migration: called when a guest signs in with existing
 * local unlocks. Sends them through `claimAchievements`; the RPC is
 * idempotent so already-earned rows are skipped.
 */
export async function migrateGuestUnlocks(): Promise<void> {
  if (typeof window === "undefined") return;
  const guest = loadGuestUnlocks();
  if (guest.size === 0) return;
  const ids = [...guest.keys()];
  try {
    await claimAchievements({
      data: { ids, engineVersion: ENGINE_VERSION },
    });
    for (const id of ids) {
      recordTransitionTrace(id, {
        origin: "guest_migration",
        serverPersistedBeforeEvaluation: false,
        evaluatorSatisfied: true,
        reconcilerClassifiedAsNew: false,
        transitionClassification: "guest_migration",
        notificationEmitted: false,
        suppressionReason: "silent_origin:guest_migration",
      });
    }
    window.localStorage.removeItem(GUEST_UNLOCKS_KEY);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[achievements] guest migration retry-later", err);
  }
}

/** Deprecated: force-fire bypass removed. Use live engine transitions only. */
export function _dispatchUnlockNotification(id: AchievementId): void {
  recordTransitionTrace(id, {
    origin: "historical_reconciliation",
    serverPersistedBeforeEvaluation: persisted.has(id),
    evaluatorSatisfied: evaluation.unlockedIds.has(id),
    reconcilerClassifiedAsNew: false,
    transitionClassification: "historical_reconciliation",
    notificationEmitted: false,
    suppressionReason: "deprecated_force_dispatch_blocked",
  });
}

function allDomains(): CanonicalDomain[] {
  return [
    "campaigns",
    "investigations",
    "encyclopedia",
    "museum",
    "atlas",
    "worlds",
    "xp",
    "level",
    "dinars",
    "streak",
    "daily",
    "games",
    "titles",
    "profile",
  ];
}

function buildLocalRecord(id: AchievementId, silentPresented: boolean): UserAchievementRecord {
  const now = new Date().toISOString();
  return {
    achievementId: id,
    unlockedAt: now,
    rewardsGrantedAt: silentPresented ? now : null,
    presentedAt: silentPresented ? now : null,
    notifiedAt: silentPresented ? now : null,
    presentationOrigin: silentPresented ? "historical_repair" : null,
    repairOrigin: silentPresented ? "historical_repair" : null,
    engineVersion: ENGINE_VERSION,
    definitionVersion: registry.byId.get(id)?.version ?? 1,
  };
}

async function silentlyRepairHistorical(
  ids: readonly AchievementId[],
  origin: TransitionOrigin,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    const res = await repairHistoricalAchievements({
      data: {
        ids: [...ids],
        metadata: {
          origin,
          reward_grant_suppressed: true,
          reason: "silent_session_baseline",
        },
      },
    });
    const repaired = new Set(res.repaired);
    const existing = new Set(res.existing);
    for (const id of ids) {
      persisted.set(id, buildLocalRecord(id, true));
      recordTransitionTrace(id, {
        origin: repaired.has(id) ? "historical_repair" : "historical_reconciliation",
        serverPersistedBeforeEvaluation: existing.has(id),
        evaluatorSatisfied: true,
        reconcilerClassifiedAsNew: true,
        claimInserted: false,
        claimExisting: existing.has(id),
        transitionClassification: repaired.has(id) ? "historical_repair" : "historical_reconciliation",
        notificationEmitted: false,
        suppressionReason: repaired.has(id)
          ? "historical_missing_row_repaired_silently"
          : "historical_existing_row_marked_presented",
      });
    }
  } catch (err) {
    recordAchievementTrace("historical-repair-error", err instanceof Error ? err.message : String(err));
  }
}

function emitLiveTransition(
  id: AchievementId,
  rec: UserAchievementRecord | null,
  claimInserted: boolean,
  claimExisting: boolean,
): void {
  const decision = shouldEmitAchievementNotification({
    id,
    origin: "live_gameplay_unlock",
    liveTransitionsReady,
    serverPersistedBeforeEvaluation: false,
    evaluatorSatisfied: evaluation.unlockedIds.has(id),
    reconcilerClassifiedAsNew: true,
    claimInserted,
    claimExisting,
    serverRecord: rec,
  });
  recordTransitionTrace(id, {
    origin: "live_gameplay_unlock",
    serverPersistedBeforeEvaluation: false,
    evaluatorSatisfied: evaluation.unlockedIds.has(id),
    reconcilerClassifiedAsNew: true,
    claimInserted,
    claimExisting,
    transitionClassification: "live_gameplay_unlock",
    notificationEmitted: decision.notificationEmitted,
    suppressionReason: decision.suppressionReason,
  });
  if (!decision.notificationEmitted) return;
  const def = registry.byId.get(id);
  if (def) dispatchAchievementHook("onUnlocked", def);
  dispatchAchievementTransition(id, "live_gameplay_unlock");
}

function recordTransitionTrace(
  id: AchievementId,
  detail: Record<string, unknown>,
): void {
  recordAchievementTrace("transition", { achievementId: id, ...detail });
}

function recordAchievementTrace(stage: string, detail?: unknown): void {
  try {
    recordTrace(
      "achievement",
      stage,
      typeof detail === "string" ? detail : JSON.stringify(detail ?? {}),
    );
  } catch { /* ignore */ }
}
