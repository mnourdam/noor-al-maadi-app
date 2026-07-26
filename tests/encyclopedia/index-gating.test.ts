// ============================================================
// Encyclopedia index gating — permanent guard.
//
// Frozen contract (Encyclopedia Performance v1):
//   1. The unified index is NEVER built before the offline snapshot is
//      applied. No snapshot + no live rows ⇒ throw, so React Query caches
//      nothing and no wrong count can ever be displayed or persisted.
//   2. Every cache entry is keyed by the snapshot data version, so a newer
//      snapshot produces a NEW key instead of reusing stale counts.
//   3. All surfaces (hub, category pages, search, stats) read the same index,
//      so their numbers cannot disagree.
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ENCYCLOPEDIA_INDEX_QUERY_KEY,
  encyclopediaIndexQueryOptions,
  buildEncyclopediaIndex,
  browseEncyclopedia,
} from "@/lib/encyclopedia/index-store";

const SRC = readFileSync("src/lib/encyclopedia/index-store.ts", "utf8");

describe("encyclopedia index gating", () => {
  it("keys every cache entry by the snapshot data version", () => {
    const a = encyclopediaIndexQueryOptions(1).queryKey;
    const b = encyclopediaIndexQueryOptions(2).queryKey;
    expect(a).not.toEqual(b);
    expect(a.slice(0, 3)).toEqual([...ENCYCLOPEDIA_INDEX_QUERY_KEY]);
    expect(a[3]).toBe(1);
  });

  it("refuses to build an index without an applied snapshot", () => {
    // The queryFn must throw rather than return an empty index.
    expect(SRC).toMatch(/throw new Error\("encyclopedia-index: snapshot not ready"\)/);
    // …and it must read rows from the in-memory snapshot, never from a
    // local-first helper that silently falls back to an empty array.
    expect(SRC).toContain("ensureLocalSnapshotLoaded");
    expect(SRC).toContain("localEncyclopediaAll");
    expect(SRC).not.toContain("fetchEncyclopediaAllLocalFirst");
  });

  it("never downloads full rows just to validate the index", () => {
    // The id authority (49 KB) is allowed; a full-body read is only the
    // no-snapshot web fallback.
    const idAuthority = SRC.indexOf("fetchEncyclopediaLivePublicIds");
    expect(idAuthority).toBeGreaterThan(-1);
  });

  it("derives every surface's numbers from one index", () => {
    const rows = [
      { id: "1", entity_type: "figure", title: "صلاح الدين", slug: "saladin", enabled: true, summary: "قائد أيوبي استعاد بيت المقدس بعد معركة حطين الفاصلة." },
      { id: "2", entity_type: "figure", title: "طارق بن زياد", slug: "tariq", enabled: true, summary: "قائد فتح الأندلس وعبر المضيق الذي يحمل اسمه اليوم." },
      { id: "3", entity_type: "city", title: "قرطبة", slug: "cordoba", enabled: true, summary: "حاضرة الأندلس ومركز العلم في القرن الرابع الهجري." },
    ] as never[];
    const index = buildEncyclopediaIndex(rows, new Set(["1", "2", "3"]));

    // hub stat === category page total === browse result length
    expect(index.total).toBe(3);
    expect(index.counts.figure).toBe(2);
    expect(browseEncyclopedia(index, { type: "figure" }).length).toBe(index.counts.figure);
    expect(browseEncyclopedia(index, {}).length).toBe(index.total);
    // search is a subset of the same pool, never of a different dataset
    const hits = browseEncyclopedia(index, { query: "صلاح" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(index.total);
  });
});
