// ============================================================
// V16 #4 — Offline Content Release Pipeline.
//
// Build-time: a fresh, complete, validated snapshot is generated from the
// current canonical content, or the build fails and the previously
// committed artifact survives untouched.
//
// Runtime: canonical content is never replaced silently. The manifest may
// only flag "يتوفر تحديث للمحتوى"; the player triggers a staged
// build → validate → persist → activate update with rollback safety.
// ============================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  buildCollectionDefs,
  buildSnapshot,
  validateCandidate,
  compareWithManifest,
  assertExactCount,
  pruneRow,
  MIN_COUNTS,
} from "../../scripts/lib/offline-snapshot-build.mjs";
import { diffAgainstManifest } from "@/lib/offline-content-update";

const SNAPSHOT_SRC = readFileSync("src/lib/offline-snapshot.ts", "utf8");
const GENERATOR_SRC = readFileSync("scripts/generate-offline-snapshot.mjs", "utf8");
const VERIFIER_SRC = readFileSync("scripts/verify-offline-snapshot.mjs", "utf8");
const UPDATE_SRC = readFileSync("src/lib/offline-content-update.ts", "utf8");
const PKG = JSON.parse(readFileSync("package.json", "utf8"));

const LIVE_ENCYCLOPEDIA = 1762;
const OLD_CACHED_ENCYCLOPEDIA = 1778;

function fakeRows(n: number, prefix = "e"): any[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, enabled: true }));
}

function fullCollections(overrides: Record<string, any[]> = {}) {
  return {
    encyclopedia_entities: fakeRows(LIVE_ENCYCLOPEDIA),
    admin_campaigns: fakeRows(78, "c"),
    investigations: fakeRows(233, "i"),
    today_in_history_events: fakeRows(100, "t"),
    daily_facts: fakeRows(240, "d"),
    atlas_entities: fakeRows(825, "a"),
    content_registry: fakeRows(4, "r"),
    ...overrides,
  };
}

// ------------------------------------------------------------
// 1. Build-time generator
// ------------------------------------------------------------
describe("build-time snapshot generator", () => {
  it("emits the current enabled encyclopedia count and matching metadata", () => {
    const snap = buildSnapshot(fullCollections());
    expect(snap.content_counts.encyclopedia_entities).toBe(LIVE_ENCYCLOPEDIA);
    expect(snap.collections.encyclopedia_entities).toHaveLength(LIVE_ENCYCLOPEDIA);
    expect(snap.schema_version).toBe(2);
    expect(Number.isFinite(Date.parse(snap.generated_at))).toBe(true);
    expect(typeof snap.checksum).toBe("string");
    expect(snap.collection_manifest.find((m: any) => m.key === "encyclopedia_entities")?.count).toBe(
      LIVE_ENCYCLOPEDIA,
    );
    expect(validateCandidate(snap).ok).toBe(true);
  });

  it("applies the runtime enabled/published filters so retired rows cannot survive", () => {
    const calls: string[] = [];
    const q: any = {
      eq: (col: string, val: unknown) => {
        calls.push(`${col}=${String(val)}`);
        return q;
      },
    };
    const defs = buildCollectionDefs("id,slug");
    defs.find((d: any) => d.key === "encyclopedia_entities")!.filter!(q);
    expect(calls).toContain("enabled=true");
    calls.length = 0;
    defs.find((d: any) => d.key === "atlas_entities")!.filter!(q);
    expect(calls).toEqual(["status=published", "aps_verified=true"]);
  });

  it("a disabled/retired entity is absent from a newly generated snapshot", () => {
    // The generator only ever receives rows that passed `enabled = true`.
    const rows = fakeRows(LIVE_ENCYCLOPEDIA).filter((r) => r.id !== "e7");
    const snap = buildSnapshot(fullCollections({ encyclopedia_entities: rows }));
    expect(snap.collections.encyclopedia_entities.some((r: any) => r.id === "e7")).toBe(false);
    expect(snap.content_counts.encyclopedia_entities).toBe(LIVE_ENCYCLOPEDIA - 1);
  });

  it("aborts when pagination does not match the authoritative count", () => {
    expect(() => assertExactCount("encyclopedia_entities", 1761, 1762)).toThrow(/aborting/);
    expect(() => assertExactCount("encyclopedia_entities", 1762, null)).toThrow(/count unavailable/);
    expect(assertExactCount("encyclopedia_entities", 1762, 1762)).toBe(true);
  });

  it("rejects a gutted candidate below the sanity floors", () => {
    const snap = buildSnapshot(fullCollections({ encyclopedia_entities: fakeRows(10) }));
    const report = validateCandidate(snap);
    expect(report.ok).toBe(false);
    expect(report.issues.join(" ")).toContain(`min ${MIN_COUNTS.encyclopedia_entities}`);
  });

  it("rejects a future-dated candidate", () => {
    const snap = buildSnapshot(fullCollections(), { now: Date.now() + 86_400_000 });
    expect(validateCandidate(snap).ok).toBe(false);
    expect(validateCandidate(snap).issues.join(" ")).toContain("future");
  });

  it("strips private campaign columns from generated rows", () => {
    const row = pruneRow("admin_campaigns", { id: "c1", data: {}, draft_data: {}, last_editor_email: "x@y.z" });
    expect(row).not.toHaveProperty("draft_data");
    expect(row).not.toHaveProperty("last_editor_email");
    expect(row).toHaveProperty("id");
  });

  it("writes atomically and only after full validation", () => {
    expect(GENERATOR_SRC).toContain("TMP_PATH");
    expect(GENERATOR_SRC).toContain("renameSync(TMP_PATH, OUT_PATH)");
    // validation happens before the rename
    expect(GENERATOR_SRC.indexOf("validateCandidate(candidate)")).toBeLessThan(
      GENERATOR_SRC.indexOf("renameSync(TMP_PATH, OUT_PATH)"),
    );
    expect(GENERATOR_SRC).toContain("process.exit(1)");
  });

  it("a failed generation exits non-zero and preserves the committed artifact", () => {
    const before = readFileSync("public/offline-snapshot.json.gz");
    const beforeMtime = statSync("public/offline-snapshot.json.gz").mtimeMs;
    let failed = false;
    try {
      execFileSync("node", ["scripts/generate-offline-snapshot.mjs"], {
        env: {
          ...process.env,
          SKIP_SNAPSHOT_GEN: "",
          VITE_SUPABASE_URL: "http://127.0.0.1:1",
          VITE_SUPABASE_PUBLISHABLE_KEY: "invalid",
        },
        stdio: "pipe",
        timeout: 80_000,
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(readFileSync("public/offline-snapshot.json.gz").equals(before)).toBe(true);
    expect(statSync("public/offline-snapshot.json.gz").mtimeMs).toBe(beforeMtime);
  }, 90_000);
});

// ------------------------------------------------------------
// 2. Package pipeline + verification
// ------------------------------------------------------------
describe("android build pipeline", () => {
  it("generates a fresh snapshot before Vite packages /public", () => {
    const android = PKG.scripts["build:android:web"];
    expect(PKG.scripts["snapshot:generate"]).toContain("generate-offline-snapshot.mjs");
    expect(android).toContain("snapshot:generate");
    expect(android.indexOf("snapshot:generate")).toBeLessThan(android.indexOf("vite build"));
    expect(android.indexOf("snapshot:generate")).toBeLessThan(android.indexOf("verify:offline-snapshot"));
    // sync/copy then post-verification then gradle
    expect(PKG.scripts["sync:android"]).toContain("verify:offline-snapshot:post");
    expect(PKG.scripts["apk:debug"]).toContain("sync:android");
  });

  it("exposes an explicit developer opt-out only", () => {
    expect(GENERATOR_SRC).toContain("SKIP_SNAPSHOT_GEN");
    expect(VERIFIER_SRC).toContain("ALLOW_STALE_SNAPSHOT");
  });

  it("verification fails closed on stale, future-dated or unverifiable snapshots", () => {
    expect(VERIFIER_SRC).toContain("generated_at is in the future");
    expect(VERIFIER_SRC).toContain("not a valid date");
    expect(VERIFIER_SRC).toContain("snapshot is STALE versus production content");
    expect(VERIFIER_SRC).toContain("cannot verify snapshot freshness");
  });

  it("detects a stale committed snapshot against the production manifest", () => {
    const snap = buildSnapshot(fullCollections({ encyclopedia_entities: fakeRows(OLD_CACHED_ENCYCLOPEDIA) }));
    const stale = compareWithManifest(snap, [
      { collection: "encyclopedia_entities", total_count: LIVE_ENCYCLOPEDIA, last_updated: snap.generated_at },
    ]);
    expect(stale.join(" ")).toContain(`local ${OLD_CACHED_ENCYCLOPEDIA} vs server ${LIVE_ENCYCLOPEDIA}`);
  });

  it("ignores collections the bundled snapshot intentionally does not carry", () => {
    const snap = buildSnapshot(fullCollections());
    const stale = compareWithManifest(snap, [
      { collection: "stories", total_count: 186, last_updated: new Date(Date.now() + 1000).toISOString() },
    ]);
    expect(stale).toEqual([]);
  });
});

// ------------------------------------------------------------
// 3. Runtime detection (never silent replacement)
// ------------------------------------------------------------
describe("runtime update detection", () => {
  const DAY = 86_400_000;
  const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
  const local = {
    generated_at: ago(30),
    content_counts: { encyclopedia_entities: OLD_CACHED_ENCYCLOPEDIA, admin_campaigns: 78 },
  };

  it("flags a count mismatch (1778 cached vs 1762 canonical)", () => {
    const diff = diffAgainstManifest(local, [
      { collection: "encyclopedia_entities", total_count: LIVE_ENCYCLOPEDIA, last_updated: ago(60) },
    ]);
    expect(diff).toEqual(["encyclopedia_entities"]);
  });

  it("flags newer server timestamps", () => {
    const diff = diffAgainstManifest(
      { generated_at: ago(30), content_counts: { admin_campaigns: 78 } },
      [{ collection: "campaigns_public", total_count: 78, last_updated: ago(2) }],
    );
    expect(diff).toEqual(["admin_campaigns"]);
  });

  it("stays silent when local matches the server", () => {
    const diff = diffAgainstManifest(
      { generated_at: ago(1), content_counts: { admin_campaigns: 78 } },
      [{ collection: "campaigns_public", total_count: 78, last_updated: ago(2) }],
    );
    expect(diff).toEqual([]);
  });

  it("never trusts a future-dated (legacy inflated) local snapshot as fresh", () => {
    const diff = diffAgainstManifest(
      { generated_at: new Date(Date.now() + 86_400_000).toISOString(), content_counts: { admin_campaigns: 78 } },
      [{ collection: "campaigns_public", total_count: 78, last_updated: ago(30) }],
    );
    expect(diff).toEqual(["admin_campaigns"]);
  });

  it("boot only detects — it does not auto-apply when local content exists", () => {
    expect(SNAPSHOT_SRC).toContain("checkForContentUpdate");
    expect(SNAPSHOT_SRC).toContain("NEVER replaced silently");
    // the automatic convergence path is now reserved for a device with no
    // usable local snapshot at all.
    expect(SNAPSHOT_SRC).toContain("initial convergence failed");
  });

  it("count mismatch triggers an authoritative full replacement, not a merge", () => {
    expect(SNAPSHOT_SRC).toContain("const countMismatch = serverItem && countComparable ? serverItem.total_count !== localCount : false;");
    expect(SNAPSHOT_SRC).toMatch(/if \(countMismatch \|\| FULL_REFRESH_KEYS\.has\(def\.key\)\) \{[\s\S]{0,400}?merged = await fetchCollection\(def\);/);
  });

  it("never touches player progress, outbox, auth or streaks", () => {
    const code = UPDATE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(code).not.toMatch(/outbox|streak|user_profiles|flushOutbox|supabase\.auth/);
  });
});

// ------------------------------------------------------------
// 4. Staged update + rollback
// ------------------------------------------------------------
const storage = vi.hoisted(() => ({
  stored: null as any,
  saveShouldFail: false,
}));

vi.mock("@/lib/offline-storage", async (orig) => {
  const actual = await (orig() as Promise<any>);
  return {
    ...actual,
    loadSnapshot: vi.fn(async () => storage.stored),
    saveSnapshot: vi.fn(async (snap: any) => {
      if (storage.saveShouldFail) throw new Error("disk full");
      storage.stored = snap;
    }),
  };
});

const applyLocalSnapshot = vi.hoisted(() => vi.fn());
vi.mock("@/lib/local-first-store", () => ({
  applyLocalSnapshot,
  ensureLocalSnapshotLoaded: vi.fn(),
  localSnapshotInfo: () => null,
  isLocalReady: () => true,
  localDataVersion: () => 1,
}));

const refreshSnapshotIncremental = vi.hoisted(() => vi.fn());
vi.mock("@/lib/offline-snapshot", async (orig) => ({
  ...(await (orig() as Promise<any>)),
  refreshSnapshotIncremental,
}));

vi.mock("@/lib/offline-manifest", () => ({
  fetchContentManifest: vi.fn(async () => null),
  manifestKeyToLocalKey: (c: string) =>
    c === "campaigns_public" ? "admin_campaigns" : c === "investigations_public" ? "investigations" : c,
  isManifestCountComparable: (k: string) =>
    !["story_scenes", "story_media", "story_collections"].includes(k),
  isManifestTimestampCanonical: (k: string) =>
    !["stories", "story_scenes", "story_media", "story_collections"].includes(k),
}));

function candidateSnapshot(rows: number, version = Date.now()) {
  const collections: Record<string, any[]> = {
    encyclopedia_entities: fakeRows(rows),
    admin_campaigns: fakeRows(78, "c"),
    investigations: fakeRows(233, "i"),
    today_in_history_events: fakeRows(100, "t"),
    daily_facts: fakeRows(240, "d"),
    atlas_entities: fakeRows(825, "a").map((r) => ({ ...r, status: "published", aps_verified: true })),
    content_registry: fakeRows(4, "r"),
  };
  const content_counts = Object.fromEntries(
    Object.entries(collections).map(([k, v]) => [k, v.length]),
  );
  return {
    snapshot_version: version,
    schema_version: 5,
    generated_at: new Date().toISOString(),
    source: "live" as const,
    content_counts,
    collections,
  } as any;
}

/** A legacy device whose snapshot_version was inflated far into the future. */
const INFLATED_VERSION = Date.now() + 365 * 86_400_000;

describe("staged user-triggered update", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    storage.saveShouldFail = false;
    const { __resetContentUpdateState } = await import("@/lib/offline-content-update");
    __resetContentUpdateState();
  });

  it("applies a validated candidate and self-heals inflated legacy metadata", async () => {
    const legacy = {
      ...candidateSnapshot(OLD_CACHED_ENCYCLOPEDIA, INFLATED_VERSION),
      generated_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    storage.stored = legacy;
    const fresh = candidateSnapshot(LIVE_ENCYCLOPEDIA);
    refreshSnapshotIncremental.mockResolvedValue(fresh);

    const { applyContentUpdate, getContentUpdateState } = await import("@/lib/offline-content-update");
    const ok = await applyContentUpdate();

    expect(ok).toBe(true);
    expect(storage.stored.snapshot_version).toBe(fresh.snapshot_version);
    expect(storage.stored.snapshot_version).toBeLessThan(INFLATED_VERSION);
    expect(Date.parse(storage.stored.generated_at)).toBeLessThanOrEqual(Date.now());
    expect(storage.stored.content_counts.encyclopedia_entities).toBe(LIVE_ENCYCLOPEDIA);
    // retired rows are gone: the candidate replaced, not merged into, the cache
    expect(storage.stored.collections.encyclopedia_entities).toHaveLength(LIVE_ENCYCLOPEDIA);
    expect(applyLocalSnapshot).toHaveBeenCalledWith(storage.stored);
    expect(getContentUpdateState().available).toBe(false);
  });

  it("activation happens only after successful persistence", async () => {
    storage.stored = candidateSnapshot(OLD_CACHED_ENCYCLOPEDIA);
    refreshSnapshotIncremental.mockResolvedValue(candidateSnapshot(LIVE_ENCYCLOPEDIA));
    const { applyContentUpdate } = await import("@/lib/offline-content-update");
    const { saveSnapshot } = await import("@/lib/offline-storage");
    await applyContentUpdate();
    expect(saveSnapshot).toHaveBeenCalled();
    const saveOrder = (saveSnapshot as any).mock.invocationCallOrder[0];
    const applyOrder = applyLocalSnapshot.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(applyOrder);
  });

  it("an interrupted/failed update keeps the previous active snapshot", async () => {
    const previous = candidateSnapshot(OLD_CACHED_ENCYCLOPEDIA, 111);
    storage.stored = previous;
    refreshSnapshotIncremental.mockRejectedValue(new Error("network lost"));

    const { applyContentUpdate, getContentUpdateState } = await import("@/lib/offline-content-update");
    const ok = await applyContentUpdate();

    expect(ok).toBe(false);
    expect(storage.stored).toBe(previous);
    expect(getContentUpdateState().error).toContain("network lost");
    expect(applyLocalSnapshot).toHaveBeenCalledWith(previous);
  });

  it("a candidate that fails to persist never activates", async () => {
    const previous = candidateSnapshot(OLD_CACHED_ENCYCLOPEDIA, 222);
    storage.stored = previous;
    storage.saveShouldFail = true;
    refreshSnapshotIncremental.mockResolvedValue(candidateSnapshot(LIVE_ENCYCLOPEDIA));

    const { applyContentUpdate } = await import("@/lib/offline-content-update");
    const ok = await applyContentUpdate();

    expect(ok).toBe(false);
    expect(storage.stored).toBe(previous);
    expect(storage.stored.snapshot_version).toBe(222);
  });

  it("an invalid candidate is rejected before persistence", async () => {
    const previous = candidateSnapshot(OLD_CACHED_ENCYCLOPEDIA, 333);
    storage.stored = previous;
    refreshSnapshotIncremental.mockResolvedValue({ schema_version: 5, collections: {}, content_counts: {} });

    const { applyContentUpdate } = await import("@/lib/offline-content-update");
    const ok = await applyContentUpdate();
    expect(ok).toBe(false);
    expect(storage.stored).toBe(previous);
  });
});
