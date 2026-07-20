/**
 * ProgressSnapshot builder.
 *
 * Pure adapter layer between canonical gameplay sources and the evaluator.
 * The builder MUST NOT read any legacy profile counter — the fields
 * `storiesRead`, `charactersUnlocked`, `unlockedEras`, `regionsUnlocked`,
 * `artifactsFound` are formally deprecated and read-banned here.
 *
 * Slices are rebuilt independently. When a canonical source changes, the
 * caller invalidates its slice and requests a rebuild; other slices are
 * carried over as-is.
 */

import type { CanonicalDomain, ProgressSnapshot } from "./types";

let versionCounter = 0;

/**
 * An empty snapshot — used at cold boot and as a safe fallback when a
 * canonical source is temporarily unavailable (e.g. offline).
 */
export function emptySnapshot(): ProgressSnapshot {
  return {
    version: ++versionCounter,
    campaigns: {
      completedIds: new Set(),
      inProgressIds: new Set(),
      totalCompleted: 0,
    },
    investigations: {
      completedIds: new Set(),
      totalCompleted: 0,
      byWorldCompleted: new Map(),
    },
    encyclopedia: {
      discoveredIds: new Set(),
      totalDiscovered: 0,
      byCategoryCount: new Map(),
      byEraCount: new Map(),
      byRegionCount: new Map(),
    },
    museum: {
      ownedIds: new Set(),
      totalOwned: 0,
      byRarityCount: new Map(),
    },
    atlas: { discoveredIds: new Set(), totalDiscovered: 0 },
    worlds: { completedSlugs: new Set(), perWorldRatio: new Map() },
    xp: { total: 0 },
    level: { value: 0 },
    dinars: { current: 0, lifetimeEarned: 0 },
    streak: { current: 0, longest: 0 },
    daily: { challengesCompleted: 0 },
    games: { totalPlays: 0 },
    titles: { earnedCount: 0 },
    profile: { userId: null },
  };
}

/**
 * A domain slice provider — each canonical source registers one of these
 * during app boot. The evaluator never calls these directly; the snapshot
 * builder does.
 */
export type SliceProvider<D extends CanonicalDomain> = (
  prev: ProgressSnapshot,
) => ProgressSnapshot[D];

type AnySliceProvider = (prev: ProgressSnapshot) => ProgressSnapshot[CanonicalDomain];

const providers = new Map<CanonicalDomain, AnySliceProvider>();

/**
 * Register a slice provider for a canonical domain. Providers must be pure
 * over their canonical source — no side effects.
 */
export function registerSliceProvider<D extends CanonicalDomain>(
  domain: D,
  provider: SliceProvider<D>,
): void {
  providers[domain] = provider;
}

/**
 * Rebuild the snapshot. If `changedDomains` is provided, only those slices
 * are recomputed; all other slices are carried forward from `prev`.
 */
export function rebuildSnapshot(
  prev: ProgressSnapshot,
  changedDomains?: readonly CanonicalDomain[],
): ProgressSnapshot {
  const domains: CanonicalDomain[] = changedDomains
    ? [...changedDomains]
    : (Object.keys(providers) as CanonicalDomain[]);

  const next: ProgressSnapshot = { ...prev, version: ++versionCounter };

  for (const d of domains) {
    const p = providers[d];
    if (!p) continue;
    // Widening cast is safe: providers[d] is typed by domain.
    (next as unknown as Record<CanonicalDomain, unknown>)[d] = (
      p as SliceProvider<CanonicalDomain>
    )(prev);
  }

  return next;
}
