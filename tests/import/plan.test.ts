// ============================================================
// Phase 5.5a — Unit tests for pure plan helpers.
//
// Runs with bun test (no framework install needed).
//   bun test tests/import/plan.test.ts
//
// These test the deterministic canonical serializer and stable
// hash used to compute approved_plan_hash / original_payload_hash.
// Real RPC transactional behavior is verified in the integration
// test script (scripts/test-import-integration.sh).
// ============================================================
import { describe, it, expect } from "bun:test";
import { canonicalJSON, stableHash, buildTransactionalPlan, isTransactionalContentType } from "../../src/lib/import/plan";
import type { PreviewRow } from "../../src/lib/import/engines";

describe("canonicalJSON", () => {
  it("sorts object keys deterministically", () => {
    const a = canonicalJSON({ b: 1, a: 2, c: 3 });
    const b = canonicalJSON({ c: 3, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it("preserves array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  it("recurses through nested objects", () => {
    const a = canonicalJSON({ outer: { z: 1, a: 2 }, arr: [{ y: 1, x: 2 }] });
    const b = canonicalJSON({ arr: [{ x: 2, y: 1 }], outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("handles null and primitives", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON("s")).toBe('"s"');
    expect(canonicalJSON(true)).toBe("true");
  });
});

describe("stableHash", () => {
  it("is deterministic", () => {
    expect(stableHash("hello")).toBe(stableHash("hello"));
  });

  it("differs for different inputs", () => {
    expect(stableHash("hello")).not.toBe(stableHash("world"));
  });

  it("returns a 16-char hex", () => {
    const h = stableHash("some longer input string here");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs by input order (FNV combined forward+reverse)", () => {
    expect(stableHash("ab")).not.toBe(stableHash("ba"));
  });
});

describe("isTransactionalContentType", () => {
  it("accepts all 6 supported types", () => {
    for (const t of [
      "encyclopedia", "daily_facts", "today_in_history_events",
      "notifications", "investigations", "campaigns",
    ]) {
      expect(isTransactionalContentType(t)).toBe(true);
    }
  });

  it("rejects unknown types", () => {
    expect(isTransactionalContentType("other")).toBe(false);
    expect(isTransactionalContentType("")).toBe(false);
  });
});

function fakeRow(over: Partial<PreviewRow>): PreviewRow {
  return {
    index: 0, status: "new", issues: [], title: "t", render: null as any,
    data: {}, key: "k", ...over,
  };
}

describe("buildTransactionalPlan — encyclopedia", () => {
  const row = fakeRow({
    index: 0, status: "new",
    data: { entity_type: "figure", slug: "salah-al-din", title: "..." },
    candidates: [] as any,
  });
  const plan = buildTransactionalPlan([row], {
    contentType: "encyclopedia",
    originalPayloadHash: "payloadHash",
    overwrite: false, publish: false,
  });

  it("emits encyclopedia target_key", () => {
    expect(plan.items[0].target_key).toEqual({ entity_type: "figure", slug: "salah-al-din" });
  });

  it("hashes deterministically", () => {
    const plan2 = buildTransactionalPlan([row], {
      contentType: "encyclopedia", originalPayloadHash: "payloadHash",
      overwrite: false, publish: false,
    });
    expect(plan.approved_plan_hash).toBe(plan2.approved_plan_hash);
  });

  it("different content produces different hash", () => {
    const row2 = fakeRow({ index: 0, status: "new",
      data: { entity_type: "figure", slug: "other", title: "..." } });
    const plan2 = buildTransactionalPlan([row2], {
      contentType: "encyclopedia", originalPayloadHash: "payloadHash",
      overwrite: false, publish: false,
    });
    expect(plan.approved_plan_hash).not.toBe(plan2.approved_plan_hash);
  });
});

describe("buildTransactionalPlan — simple types", () => {
  it("emits { id } target_key for updates on daily_facts", () => {
    const row = fakeRow({
      status: "update", data: { title: "T", body: "B", enabled: true },
      existingId: "11111111-1111-1111-1111-111111111111",
      existingVersionSignal: "2026-07-16T00:00:00Z",
    });
    const plan = buildTransactionalPlan([row], {
      contentType: "daily_facts", originalPayloadHash: "h",
      overwrite: true, publish: false,
    });
    expect(plan.items[0].target_key).toEqual({ id: "11111111-1111-1111-1111-111111111111" });
    expect(plan.items[0].version_signal).toBe("2026-07-16T00:00:00Z");
  });

  it("omits target_key for new rows (no existingId)", () => {
    const row = fakeRow({ status: "new", data: { title: "T", body: "B" } });
    const plan = buildTransactionalPlan([row], {
      contentType: "notifications", originalPayloadHash: "h",
      overwrite: false, publish: false,
    });
    expect(plan.items[0].target_key).toBeUndefined();
  });

  it("respects row.override when computing action", () => {
    const row = fakeRow({ status: "blocked", override: "skip", data: {} });
    const plan = buildTransactionalPlan([row], {
      contentType: "investigations", originalPayloadHash: "h",
      overwrite: false, publish: false,
    });
    expect(plan.items[0].action).toBe("skip");
  });
});
