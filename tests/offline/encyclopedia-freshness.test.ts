// ============================================================
// V16 #4 — Offline Encyclopedia content mismatch guards.
//
// Frozen contract after the V16 fix:
//   1. The encyclopedia sanity floor is a *floor*, not an exact census —
//      legitimate deletions/disables must be able to converge and persist.
//   2. Truncated full fetches are still rejected, by the exact
//      `out.length !== expectedTotal` check (independent of the floor).
//   3. The games/stories baseline seeding path may NEVER write the shared
//      `snapshot_version` / `generated_at` of the Encyclopedia snapshot.
//   4. A future-dated `generated_at` counts as STALE, never as fresh.
//   5. A device carrying an inflated (baseline-derived) snapshot_version
//      self-heals on the first successful online sync, with no migration
//      and no destructive local reset.
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MIN_PUBLIC_ENCYCLOPEDIA_ROWS } from "@/lib/offline-storage";
import { isSnapshotStale } from "@/lib/offline-snapshot";
import { SNAPSHOT_SCHEMA_VERSION, type OfflineSnapshot } from "@/lib/offline-storage";

const SNAPSHOT_SRC = readFileSync("src/lib/offline-snapshot.ts", "utf8");
const STORAGE_SRC = readFileSync("src/lib/offline-storage.ts", "utf8");
const BASELINE_SRC = readFileSync("src/lib/offline-baseline-resolver.ts", "utf8");

/** Live enabled encyclopedia count at the time of the V16 audit. */
const LIVE_ENABLED_COUNT = 1762;
/** The old, over-tight floor that blocked convergence. */
const OLD_FLOOR = 1778;

function snapshotWith(generatedAt: string, rows = LIVE_ENABLED_COUNT): OfflineSnapshot {
  return {
    snapshot_version: 1,
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: generatedAt,
    content_counts: { encyclopedia_entities: rows },
    collections: { encyclopedia_entities: new Array(rows).fill(null).map((_, i) => ({ id: `e${i}` })) },
  };
}

describe("V16 #4 — encyclopedia row-count safety", () => {
  it("(a) accepts the legitimate live count that the old 1778 floor rejected", () => {
    expect(OLD_FLOOR).toBeGreaterThan(LIVE_ENABLED_COUNT); // the historical bug
    expect(MIN_PUBLIC_ENCYCLOPEDIA_ROWS).toBeLessThanOrEqual(LIVE_ENABLED_COUNT);
  });

  it("keeps a conservative sanity floor (not disabled, not pinned to a census)", () => {
    expect(MIN_PUBLIC_ENCYCLOPEDIA_ROWS).toBeGreaterThanOrEqual(1000);
    expect(MIN_PUBLIC_ENCYCLOPEDIA_ROWS).toBeLessThan(LIVE_ENABLED_COUNT);
  });

  it("(b) still rejects truncated full fetches via the exact expected-count check", () => {
    // Independent of the floor: compares fetched rows against the PostgREST
    // count for the identical filter, and throws instead of persisting.
    expect(SNAPSHOT_SRC).toContain('typeof expectedTotal === "number" && out.length !== expectedTotal');
    expect(SNAPSHOT_SRC).toContain("refusing to persist data");
    expect(SNAPSHOT_SRC).toMatch(/throw new Error\(msg\)/);
    // And the required-collection count guard is not removed.
    expect(SNAPSHOT_SRC).toContain("expected count unavailable; refusing full fetch");
    // Persistence guard still enforces the floor + count parity.
    expect(STORAGE_SRC).toContain("MIN_PUBLIC_ENCYCLOPEDIA_ROWS");
    expect(STORAGE_SRC).toContain("rejecting snapshot with mismatched count for");
  });
});

describe("V16 #4 — baseline seeding must not touch encyclopedia metadata", () => {
  it("(c) never assigns the shared snapshot_version / generated_at", () => {
    expect(BASELINE_SRC).not.toMatch(/newSnapshot\.snapshot_version\s*=\s*baseline\.version/);
    expect(BASELINE_SRC).not.toMatch(/newSnapshot\.generated_at\s*=\s*baseline\.generated_at/);
    expect(BASELINE_SRC).not.toMatch(/snapshot_version:\s*baseline\.version/);
    expect(BASELINE_SRC).not.toMatch(/generated_at:\s*baseline\.generated_at/);
  });

  it("tracks baseline freshness on its own dedicated field", () => {
    expect(BASELINE_SRC).toContain("baseline_version");
    expect(BASELINE_SRC).not.toMatch(/existing\.snapshot_version\s*>=\s*baseline\.version/);
  });

  it("preserves games/stories seeding behaviour and metadata reporting", () => {
    for (const key of ["games", "stories", "story_scenes", "story_media", "story_collections"]) {
      expect(BASELINE_SRC).toContain(`collections.${key}`);
    }
    expect(BASELINE_SRC).toContain("getBaselineDiagnosticReport");
    expect(BASELINE_SRC).toContain("irth_baseline_report");
  });
});

describe("V16 #4 — staleness treats future-dated metadata as stale", () => {
  const MAX_AGE = 6 * 60 * 60 * 1000;
  const NOW = Date.parse("2026-08-28T19:00:00.000Z");

  it("(d) a future generated_at forces a sync", () => {
    const future = snapshotWith("2026-09-30T00:00:00.000Z");
    expect(isSnapshotStale(future, MAX_AGE, NOW)).toBe(true);
  });

  it("treats an unparseable generated_at as stale", () => {
    expect(isSnapshotStale(snapshotWith("not-a-date"), MAX_AGE, NOW)).toBe(true);
  });

  it("still reports a genuinely fresh snapshot as fresh", () => {
    expect(isSnapshotStale(snapshotWith("2026-08-28T18:00:00.000Z"), MAX_AGE, NOW)).toBe(false);
  });

  it("still reports an old snapshot as stale", () => {
    expect(isSnapshotStale(snapshotWith("2026-08-20T00:00:00.000Z"), MAX_AGE, NOW)).toBe(true);
  });

  it("missing snapshot or schema drift is stale", () => {
    expect(isSnapshotStale(null, MAX_AGE, NOW)).toBe(true);
    const drift = { ...snapshotWith("2026-08-28T18:00:00.000Z"), schema_version: 1 };
    expect(isSnapshotStale(drift, MAX_AGE, NOW)).toBe(true);
  });
});

describe("V16 #4 — inflated snapshot_version self-heals without migration", () => {
  it("(e) a successful sync stamps a wall-clock version that outranks the inflated one", () => {
    // Devices may carry the baseline-derived value written before the fix.
    const inflated = 1786857572635; // baseline-content.json version (2026-08-16)
    // Both snapshot producers stamp Date.now(), which is strictly greater.
    const stampCount = SNAPSHOT_SRC.match(/snapshot_version:\s*Date\.now\(\)/g) ?? [];
    expect(stampCount.length).toBeGreaterThanOrEqual(2);
    expect(Date.now()).toBeGreaterThan(inflated);
    // No destructive local reset is used to recover.
    expect(SNAPSHOT_SRC).not.toContain("clearSnapshot()");
  });

  it("the inflated device is not considered fresh, so a sync is actually attempted", () => {
    // generated_at was overwritten to the baseline date; well past maxAge now.
    const stored = snapshotWith("2026-08-16T05:19:32.635Z");
    expect(isSnapshotStale(stored, 6 * 60 * 60 * 1000, Date.parse("2026-08-28T19:00:00.000Z"))).toBe(true);
  });
});
