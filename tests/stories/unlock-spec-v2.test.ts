// ============================================================
// Stories M3 — Unlock Spec v2 comprehensive tests
// ------------------------------------------------------------
// Covers: every leaf, every logical node, nesting, invalid
// trees, unknown node types, missing fields, malformed JSON,
// cycle detection, depth/node budgets, v1 compatibility,
// determinism, and fail-closed behaviour.
// ============================================================

import { describe, it, expect } from "bun:test";
import {
  ALWAYS_SPEC,
  NEVER_SPEC,
  UNLOCK_LIMITS,
  UNLOCK_NODE_TYPES,
  detectUnlockCycles,
  evaluateUnlock,
  evaluateUnlockUnknown,
  extractStoryDeps,
  normalizeUnlockSpec,
  parseUnlockSpec,
  validateUnlockSpec,
  type UnlockContext,
  type UnlockNode,
  type UnlockSpecV2,
} from "@/lib/stories/unlock";

const EMPTY_CTX: UnlockContext = {
  completed_story_ids: new Set(),
  completed_campaign_ids: new Set(),
  completed_investigation_ids: new Set(),
  earned_achievement_ids: new Set(),
};

function ctx(over: Partial<Record<keyof UnlockContext, string[]>>): UnlockContext {
  return {
    completed_story_ids: new Set(over.completed_story_ids ?? []),
    completed_campaign_ids: new Set(over.completed_campaign_ids ?? []),
    completed_investigation_ids: new Set(over.completed_investigation_ids ?? []),
    earned_achievement_ids: new Set(over.earned_achievement_ids ?? []),
  };
}

function wrap(rule: UnlockNode): UnlockSpecV2 { return { v: 2, rule }; }

describe("unlock spec v2 — validator", () => {
  it("accepts every leaf and logical node", () => {
    for (const t of UNLOCK_NODE_TYPES) {
      let spec: UnlockSpecV2;
      switch (t) {
        case "always": spec = wrap({ type: "always" }); break;
        case "never": spec = wrap({ type: "never" }); break;
        case "all_of": spec = wrap({ type: "all_of", children: [{ type: "always" }] }); break;
        case "any_of": spec = wrap({ type: "any_of", children: [{ type: "never" }] }); break;
        case "not": spec = wrap({ type: "not", child: { type: "always" } }); break;
        case "story_complete": spec = wrap({ type: "story_complete", story_id: "s1" }); break;
        case "campaign_complete": spec = wrap({ type: "campaign_complete", campaign_id: "c1" }); break;
        case "investigation_complete": spec = wrap({ type: "investigation_complete", investigation_id: "i1" }); break;
        case "achievement_earned": spec = wrap({ type: "achievement_earned", achievement_id: "a1" }); break;
      }
      const r = validateUnlockSpec(spec);
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    }
  });

  it("rejects wrong version", () => {
    const r = validateUnlockSpec({ v: 1, rule: { type: "always" } });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "wrong_version")).toBe(true);
  });

  it("rejects missing rule", () => {
    const r = validateUnlockSpec({ v: 2 });
    expect(r.errors[0].code).toBe("missing_rule");
  });

  it("rejects non-object input", () => {
    expect(validateUnlockSpec(null).errors[0].code).toBe("not_an_object");
    expect(validateUnlockSpec("nope").errors[0].code).toBe("not_an_object");
    expect(validateUnlockSpec([]).errors[0].code).toBe("not_an_object");
  });

  it("rejects unknown node type", () => {
    const r = validateUnlockSpec({ v: 2, rule: { type: "bogus" } });
    expect(r.errors.some((e) => e.code === "unknown_type")).toBe(true);
  });

  it("rejects missing type", () => {
    const r = validateUnlockSpec({ v: 2, rule: {} });
    expect(r.errors.some((e) => e.code === "missing_type")).toBe(true);
  });

  it("rejects missing id fields on leaves", () => {
    for (const leaf of [
      { type: "story_complete" },
      { type: "campaign_complete" },
      { type: "investigation_complete" },
      { type: "achievement_earned" },
    ]) {
      const r = validateUnlockSpec({ v: 2, rule: leaf });
      expect(r.errors.some((e) => e.code === "missing_id_field")).toBe(true);
    }
  });

  it("rejects empty or non-string ids", () => {
    expect(validateUnlockSpec({ v: 2, rule: { type: "story_complete", story_id: "" } })
      .errors.some((e) => e.code === "id_empty")).toBe(true);
    expect(validateUnlockSpec({ v: 2, rule: { type: "story_complete", story_id: 42 } })
      .errors.some((e) => e.code === "id_not_string")).toBe(true);
  });

  it("rejects extra fields on any node", () => {
    const r = validateUnlockSpec({ v: 2, rule: { type: "always", story_id: "x" } });
    expect(r.errors.some((e) => e.code === "extra_fields")).toBe(true);
  });

  it("rejects empty logical children", () => {
    expect(validateUnlockSpec({ v: 2, rule: { type: "all_of", children: [] } })
      .errors.some((e) => e.code === "empty_children_forbidden")).toBe(true);
    expect(validateUnlockSpec({ v: 2, rule: { type: "any_of", children: [] } })
      .errors.some((e) => e.code === "empty_children_forbidden")).toBe(true);
  });

  it("rejects malformed children arrays", () => {
    expect(validateUnlockSpec({ v: 2, rule: { type: "all_of", children: "not-array" } })
      .errors.some((e) => e.code === "children_not_array")).toBe(true);
    expect(validateUnlockSpec({ v: 2, rule: { type: "all_of" } })
      .errors.some((e) => e.code === "missing_children")).toBe(true);
  });

  it("enforces max nesting depth (6)", () => {
    let node: UnlockNode = { type: "always" };
    for (let i = 0; i < UNLOCK_LIMITS.MAX_DEPTH + 1; i++) node = { type: "not", child: node };
    const r = validateUnlockSpec({ v: 2, rule: node });
    expect(r.errors.some((e) => e.code === "depth_exceeded")).toBe(true);
  });

  it("enforces max node count (64)", () => {
    const children: UnlockNode[] = [];
    for (let i = 0; i < UNLOCK_LIMITS.MAX_NODES + 5; i++) children.push({ type: "always" });
    const r = validateUnlockSpec({ v: 2, rule: { type: "all_of", children } });
    expect(r.errors.some((e) => e.code === "node_count_exceeded")).toBe(true);
  });

  it("parseUnlockSpec throws with joined error message", () => {
    expect(() => parseUnlockSpec({ v: 2, rule: { type: "bogus" } })).toThrow(/invalid_unlock_spec/);
  });

  it("deterministic error ordering", () => {
    const bad = { v: 2, rule: { type: "all_of", children: [{ type: "bogus" }, { type: "story_complete" }] } };
    const a = validateUnlockSpec(bad).errors.map((e) => `${e.path}:${e.code}`);
    const b = validateUnlockSpec(bad).errors.map((e) => `${e.path}:${e.code}`);
    expect(a).toEqual(b);
  });
});

describe("unlock spec v2 — evaluator", () => {
  it("always/never", () => {
    expect(evaluateUnlock(ALWAYS_SPEC, EMPTY_CTX)).toBe(true);
    expect(evaluateUnlock(NEVER_SPEC, EMPTY_CTX)).toBe(false);
  });

  it("story/campaign/investigation/achievement leaves", () => {
    expect(evaluateUnlock(wrap({ type: "story_complete", story_id: "s" }),
      ctx({ completed_story_ids: ["s"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "story_complete", story_id: "s" }), EMPTY_CTX)).toBe(false);
    expect(evaluateUnlock(wrap({ type: "campaign_complete", campaign_id: "c" }),
      ctx({ completed_campaign_ids: ["c"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "investigation_complete", investigation_id: "i" }),
      ctx({ completed_investigation_ids: ["i"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "achievement_earned", achievement_id: "a" }),
      ctx({ earned_achievement_ids: ["a"] }))).toBe(true);
  });

  it("all_of / any_of / not", () => {
    const spec = wrap({
      type: "all_of",
      children: [
        { type: "any_of", children: [
          { type: "story_complete", story_id: "s1" },
          { type: "story_complete", story_id: "s2" },
        ]},
        { type: "not", child: { type: "campaign_complete", campaign_id: "cX" } },
      ],
    });
    expect(evaluateUnlock(spec, ctx({ completed_story_ids: ["s2"] }))).toBe(true);
    expect(evaluateUnlock(spec, ctx({ completed_story_ids: ["s2"], completed_campaign_ids: ["cX"] }))).toBe(false);
    expect(evaluateUnlock(spec, EMPTY_CTX)).toBe(false);
  });

  it("fails closed on invalid raw json", () => {
    expect(evaluateUnlockUnknown({ v: 2, rule: { type: "bogus" } }, EMPTY_CTX)).toBe(false);
    expect(evaluateUnlockUnknown("garbage", EMPTY_CTX)).toBe(false);
    expect(evaluateUnlockUnknown({ v: 99, rule: { type: "always" } }, EMPTY_CTX)).toBe(false);
  });

  it("deterministic: same input → same output", () => {
    const spec = wrap({ type: "all_of", children: [
      { type: "story_complete", story_id: "s" },
      { type: "any_of", children: [
        { type: "campaign_complete", campaign_id: "c" },
        { type: "achievement_earned", achievement_id: "a" },
      ]},
    ]});
    const c = ctx({ completed_story_ids: ["s"], earned_achievement_ids: ["a"] });
    for (let i = 0; i < 20; i++) expect(evaluateUnlock(spec, c)).toBe(true);
  });
});

describe("unlock spec v2 — v1 compatibility", () => {
  it("null → ALWAYS", () => {
    expect(normalizeUnlockSpec(null)).toEqual(ALWAYS_SPEC);
    expect(evaluateUnlockUnknown(null, EMPTY_CTX)).toBe(true);
  });

  it("v1 always node", () => {
    expect(normalizeUnlockSpec({ type: "always" })).toEqual(ALWAYS_SPEC);
  });

  it("v1 and/or renamed to all_of/any_of", () => {
    const norm = normalizeUnlockSpec({ type: "and", children: [
      { type: "or", children: [{ type: "story_completed", story_id: "s1" }] },
      { type: "campaign_completed", campaign_id: "c1" },
    ]});
    expect(norm.v).toBe(2);
    expect(norm.rule.type).toBe("all_of");
    expect(evaluateUnlock(norm, ctx({ completed_story_ids: ["s1"], completed_campaign_ids: ["c1"] }))).toBe(true);
  });

  it("v1 leaf renames", () => {
    expect(evaluateUnlockUnknown({ type: "story_completed", story_id: "s" },
      ctx({ completed_story_ids: ["s"] }))).toBe(true);
    expect(evaluateUnlockUnknown({ type: "campaign_completed", campaign_id: "c" },
      ctx({ completed_campaign_ids: ["c"] }))).toBe(true);
    expect(evaluateUnlockUnknown({ type: "investigation_completed", investigation_id: "i" },
      ctx({ completed_investigation_ids: ["i"] }))).toBe(true);
  });

  it("garbage v1 → NEVER (fail closed)", () => {
    expect(normalizeUnlockSpec({ type: "story_completed" })).toEqual(NEVER_SPEC);
    expect(normalizeUnlockSpec({ type: "unknown_thing" })).toEqual(NEVER_SPEC);
    expect(normalizeUnlockSpec({ type: "and", children: [{ type: "bogus" }] })).toEqual(NEVER_SPEC);
  });

  it("does not mutate input", () => {
    const src = { type: "and", children: [{ type: "campaign_completed", campaign_id: "c" }] };
    const snap = JSON.stringify(src);
    normalizeUnlockSpec(src);
    expect(JSON.stringify(src)).toBe(snap);
  });
});

describe("unlock spec v2 — cycle detection", () => {
  it("detects a direct A↔B cycle", () => {
    const stories = new Map<string, unknown>([
      ["A", { v: 2, rule: { type: "story_complete", story_id: "B" } }],
      ["B", { v: 2, rule: { type: "story_complete", story_id: "A" } }],
    ]);
    const cycles = detectUnlockCycles(stories);
    expect(cycles.length).toBe(1);
    expect(new Set(cycles[0].path)).toEqual(new Set(["A", "B"]));
  });

  it("detects a 3-node cycle A→B→C→A", () => {
    const stories = new Map<string, unknown>([
      ["A", { v: 2, rule: { type: "story_complete", story_id: "B" } }],
      ["B", { v: 2, rule: { type: "story_complete", story_id: "C" } }],
      ["C", { v: 2, rule: { type: "story_complete", story_id: "A" } }],
    ]);
    expect(detectUnlockCycles(stories).length).toBe(1);
  });

  it("does not flag a DAG", () => {
    const stories = new Map<string, unknown>([
      ["A", { v: 2, rule: { type: "story_complete", story_id: "B" } }],
      ["B", { v: 2, rule: { type: "story_complete", story_id: "C" } }],
      ["C", { v: 2, rule: { type: "always" } }],
    ]);
    expect(detectUnlockCycles(stories)).toEqual([]);
  });

  it("ignores dependencies outside the batch", () => {
    const stories = new Map<string, unknown>([
      ["A", { v: 2, rule: { type: "story_complete", story_id: "external" } }],
    ]);
    expect(detectUnlockCycles(stories)).toEqual([]);
  });

  it("extractStoryDeps handles v1 nested trees", () => {
    const deps = extractStoryDeps({
      type: "and",
      children: [
        { type: "story_completed", story_id: "b" },
        { type: "or", children: [{ type: "story_completed", story_id: "a" }] },
      ],
    });
    expect(deps).toEqual(["a", "b"]);
  });

  it("deterministic cycle output", () => {
    const stories = new Map<string, unknown>([
      ["A", { v: 2, rule: { type: "story_complete", story_id: "B" } }],
      ["B", { v: 2, rule: { type: "story_complete", story_id: "A" } }],
    ]);
    const a = detectUnlockCycles(stories);
    const b = detectUnlockCycles(stories);
    expect(a).toEqual(b);
  });
});
