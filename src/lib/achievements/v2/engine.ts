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
import { claimAchievements, fetchUserAchievements } from "./claim.functions";
import { dispatchAchievementHook } from "./events";
import type {
  AchievementId,
  CanonicalDomain,
  EvaluationResult,
  ProgressSnapshot,
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
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as UserAchievementRecord[];
    return new Map(arr.map((r) => [r.achievementId, r]));
  } catch {
    return new Map();
  }
}
function saveGuestUnlocks(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GUEST_UNLOCKS_KEY,
      JSON.stringify([...persisted.values()]),
    );
  } catch {
    /* noop */
  }
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
  alreadyNotified = loadNotified();
}

/**
 * Signal that the auth state changed. On sign-in this fetches the server
 * mirror; on sign-out this clears the mirror and restores guest state.
 */
export async function refreshPersistedForUser(userId: string | null): Promise<void> {
  if (bootedForUserId === userId) return;
  bootedForUserId = userId;
  inputs.profile.userId = userId;
  mirrorReady = false;

  if (!userId) {
    persisted = loadGuestUnlocks();
    // Guest state: whatever is persisted locally has already been notified
    // on the run that unlocked it; we still trust the local `alreadyNotified`
    // cache but also union with persisted ids to survive a cache wipe.
    for (const id of persisted.keys()) alreadyNotified.add(id);
    saveNotified();
    mirrorReady = true;
    await runCycle(["profile"]);
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
          engineVersion: r.engine_version ?? ENGINE_VERSION,
          definitionVersion: r.definition_version ?? 1,
        },
      ]),
    );
    // Seed `alreadyNotified` with every server-known unlock. This is the
    // canonical fix for the reinstall-notification storm: everything the
    // server already remembers is HISTORICAL, so its unlock event was
    // dispatched in a prior session and MUST be silent this session even
    // when the local `alreadyNotified` cache was wiped by reinstall.
    for (const id of persisted.keys()) alreadyNotified.add(id);
    saveNotified();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[achievements] mirror fetch failed; keeping local state", err);
  }
  mirrorReady = true;
  await runCycle(["profile"]);
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
  void runCycle(changed);
}

let cycleInFlight: Promise<void> | null = null;
let queuedDomains: CanonicalDomain[] | null = null;

async function runCycle(changedDomains: readonly CanonicalDomain[]): Promise<void> {
  if (cycleInFlight) {
    queuedDomains = mergeDomains(queuedDomains, changedDomains);
    return;
  }
  cycleInFlight = doCycle(changedDomains).finally(() => {
    cycleInFlight = null;
    if (queuedDomains) {
      const next = queuedDomains;
      queuedDomains = null;
      void runCycle(next);
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

async function doCycle(changedDomains: readonly CanonicalDomain[]): Promise<void> {
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

  // Fire onClaimed hooks for anything that flipped to claimed this cycle.
  const newClaimedThisCycle = output.newlyClaimed.filter(
    (id) => !lastClaimedSet.has(id),
  );
  if (newClaimedThisCycle.length > 0) {
    dispatchClaimTransitions(registry, newClaimedThisCycle);
  }
  lastClaimedSet = new Set(output.newlyClaimed);

  // Mark newly-unlocked ids as notified so we don't re-dispatch on reload.
  for (const id of output.newlyUnlocked) alreadyNotified.add(id);
  saveNotified();

  const userId = inputs.profile.userId;
  if (output.newlyUnlocked.length > 0) {
    if (userId) {
      // Signed-in: authoritative claim + refresh mirror.
      try {
        const res = await claimAchievements({
          data: { ids: [...output.newlyUnlocked], engineVersion: ENGINE_VERSION },
        });
        for (const id of res.inserted) {
          persisted.set(id, {
            achievementId: id,
            unlockedAt: new Date().toISOString(),
            rewardsGrantedAt: null,
            engineVersion: ENGINE_VERSION,
            definitionVersion: registry.byId.get(id)?.version ?? 1,
          });
        }
      } catch (err) {
        // Offline / transient — keep newlyNotified so we don't spam; retry next cycle.
        // eslint-disable-next-line no-console
        console.warn("[achievements] claim failed; will retry", err);
      }
    } else {
      // Guest: keep unlocks locally so guest→account migration preserves them.
      for (const id of output.newlyUnlocked) {
        persisted.set(id, {
          achievementId: id,
          unlockedAt: new Date().toISOString(),
          rewardsGrantedAt: null,
          engineVersion: ENGINE_VERSION,
          definitionVersion: registry.byId.get(id)?.version ?? 1,
        });
      }
      saveGuestUnlocks();
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
    window.localStorage.removeItem(GUEST_UNLOCKS_KEY);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[achievements] guest migration retry-later", err);
  }
}

/** Force-fire onUnlocked for a single id (used by the notification driver). */
export function _dispatchUnlockNotification(id: AchievementId): void {
  const def = registry.byId.get(id);
  if (def) dispatchAchievementHook("onUnlocked", def);
}
