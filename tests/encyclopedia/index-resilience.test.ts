// ============================================================
// V17-02 — the Encyclopedia can never sit in an endless loading state.
//
// Contract:
//   1. With a local snapshot, the authoritative id request is bounded by a
//      short timeout. Success keeps the old authoritative behaviour; a
//      rejection, a hang, or being offline all fall back to the complete
//      snapshot (authoritativeIds = null) instead of blocking.
//   2. A late settlement of the abandoned request never becomes an unhandled
//      rejection, and the snapshot is never emptied or invalidated.
//   3. Without a snapshot and with no live rows the query FAILS (settled
//      error) — the hook reports error, not eternal loading.
//   4. Hub and category pages carry the stall/error fail-safe with Retry.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const fetchIds = vi.fn();
const fetchAll = vi.fn();
const snapshotRows = vi.fn();

vi.mock("@/lib/encyclopedia-source", () => ({
  fetchEncyclopediaLivePublicIds: (...a: unknown[]) => fetchIds(...a),
  fetchEncyclopediaLivePublicAll: (...a: unknown[]) => fetchAll(...a),
}));

vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localDataVersion: () => 1,
  localEncyclopediaAll: () => snapshotRows(),
  onLocalSnapshotChange: () => () => {},
}));

const { encyclopediaIndexQueryOptions, AUTHORITY_TIMEOUT_MS } = await import(
  "@/lib/encyclopedia/index-store"
);

const ROWS = [
  { id: "1", entity_type: "figure", title: "صلاح الدين", slug: "saladin", enabled: true, summary: "قائد أيوبي." },
  { id: "2", entity_type: "figure", title: "طارق بن زياد", slug: "tariq", enabled: true, summary: "فاتح الأندلس." },
  { id: "3", entity_type: "city", title: "قرطبة", slug: "cordoba", enabled: true, summary: "حاضرة الأندلس." },
] as never[];

function run() {
  const qf = encyclopediaIndexQueryOptions(1).queryFn as () => Promise<{
    total: number;
    counts: Record<string, number>;
    source: string;
  }>;
  return qf();
}

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  fetchIds.mockReset();
  fetchAll.mockReset();
  snapshotRows.mockReset().mockReturnValue(ROWS);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  vi.useRealTimers();
});

describe("encyclopedia index resilience", () => {
  it("preserves authoritative pruning when the id request succeeds", async () => {
    fetchIds.mockResolvedValue(new Set(["1", "2"]));
    const index = await run();
    expect(index.total).toBe(2); // row 3 pruned by the authority
    expect(index.source).toBe("local");
  });

  it("falls back to the snapshot when the id request rejects", async () => {
    fetchIds.mockRejectedValue(new Error("network"));
    const index = await run();
    expect(index.total).toBe(3);
    expect(index.counts.figure).toBe(2);
    expect(index.counts.city).toBe(1);
  });

  it("resolves from the snapshot when the id request never settles", async () => {
    vi.useFakeTimers();
    fetchIds.mockReturnValue(new Promise(() => {}));
    const p = run();
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS + 10);
    const index = await p;
    // Full snapshot counts preserved — nothing pruned, nothing emptied.
    expect(index.total).toBe(3);
    expect(index.counts.figure).toBe(2);
  });

  it("does not produce an unhandled rejection when the abandoned request fails later", async () => {
    vi.useFakeTimers();
    let reject!: (e: unknown) => void;
    fetchIds.mockReturnValue(new Promise((_r, rj) => { reject = rj; }));
    const p = run();
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS + 10);
    await p;
    reject(new Error("late failure"));
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toEqual([]);
  });

  it("resolves offline (id authority returns null) with no network rows", async () => {
    fetchIds.mockResolvedValue(null);
    const index = await run();
    expect(index.total).toBe(3);
    expect(fetchAll).not.toHaveBeenCalled();
  });

  it("keeps the timeout short enough to never look like a freeze", () => {
    expect(AUTHORITY_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("fails (settled error) when there is no snapshot and the network has nothing", async () => {
    snapshotRows.mockReturnValue([]);
    fetchAll.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("snapshot not ready");
  });
});

describe("useEncyclopediaIndex separates pending from error", () => {
  const SRC = readFileSync("src/lib/encyclopedia/index-store.ts", "utf8");

  it("never reports loading after a settled error", () => {
    expect(SRC).toContain("isPending: !hasData && !q.isError");
    expect(SRC).not.toContain("isPending: !q.data");
  });

  it("exposes an error state and a real refetch action", () => {
    expect(SRC).toContain("isError:");
    expect(SRC).toContain("refetch: () =>");
    expect(SRC).toContain("cancelRefetch: true");
  });

  it("keeps Encyclopedia Performance v1 invariants", () => {
    expect(SRC).toContain("staleTime: Infinity");
    expect(SRC).toContain("refetchOnMount: false");
    expect(SRC).toContain("ensureLocalSnapshotLoaded");
  });
});

describe("hub and category fail-safe UI", () => {
  const HUB = readFileSync("src/routes/encyclopedia.index.tsx", "utf8");
  const CAT = readFileSync("src/routes/encyclopedia.type.$type.tsx", "utf8");

  for (const [name, SRC] of [["hub", HUB], ["category", CAT]] as const) {
    it(`${name}: shows a recoverable Retry state on stall or settled error`, () => {
      expect(SRC).toContain("useStalled");
      expect(SRC).toContain("EncyclopediaUnavailable");
      expect(SRC).toMatch(/const unavailable = isError \|\| stalled/);
      expect(SRC).toContain("onRetry={refetch}");
    });

    it(`${name}: keeps the normal loading experience first`, () => {
      // The unavailable branch precedes the spinner branch, and the spinner
      // branch itself is untouched.
      expect(SRC.indexOf("unavailable ?")).toBeLessThan(SRC.indexOf("isPending ?") === -1 ? SRC.indexOf("isLoading ?") : SRC.indexOf("isPending ?"));
      expect(SRC).toContain("AppShell");
    });
  }

  it("does not auto-reload the app as a recovery strategy", () => {
    const UI = readFileSync("src/components/encyclopedia/EncyclopediaUnavailable.tsx", "utf8");
    expect(UI).not.toContain("location.reload");
  });

  it("does not introduce Atlas → Encyclopedia era forwarding", () => {
    expect(HUB).not.toContain("atlasEra");
  });
});
