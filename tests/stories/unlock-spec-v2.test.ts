// ============================================================
// Stories M3 — Unlock Spec v2 tests (FROZEN CONTRACT)
// ------------------------------------------------------------
// Envelope: { version:2, expr }. Logical: all/any(of), not(child).
// Leaves per src/lib/stories/unlock/spec.ts.
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

function makeCtx(over: Partial<{
  stories: string[]; campaigns: string[]; chapters: string[];
  investigations: string[]; entities: string[]; artifacts: string[];
  locations: string[]; achievements: string[]; level: number; now: string;
}> = {}): UnlockContext {
  return {
    completed_story_ids: new Set(over.stories ?? []),
    completed_campaign_ids: new Set(over.campaigns ?? []),
    completed_campaign_chapter_keys: new Set(over.chapters ?? []),
    completed_investigation_ids: new Set(over.investigations ?? []),
    discovered_entity_ids: new Set(over.entities ?? []),
    owned_artifact_ids: new Set(over.artifacts ?? []),
    visited_atlas_location_ids: new Set(over.locations ?? []),
    unlocked_achievement_ids: new Set(over.achievements ?? []),
    player_level: over.level ?? 0,
    now: over.now,
  };
}

const EMPTY_CTX = makeCtx();
const wrap = (expr: UnlockNode): UnlockSpecV2 => ({ version: 2, expr });

describe("unlock spec v2 — validator (frozen)", () => {
  it("accepts every supported node type", () => {
    const cases: Record<string, UnlockSpecV2> = {
      always: wrap({ type: "always" }),
      all: wrap({ type: "all", of: [{ type: "always" }] }),
      any: wrap({ type: "any", of: [{ type: "always" }] }),
      not: wrap({ type: "not", child: { type: "always" } }),
      campaign_complete: wrap({ type: "campaign_complete", campaign_id: "c1" }),
      campaign_chapter_complete: wrap({ type: "campaign_chapter_complete", campaign_id: "c1", chapter_id: "ch1" }),
      investigation_complete: wrap({ type: "investigation_complete", investigation_id: "i1" }),
      entity_discovered: wrap({ type: "entity_discovered", entity_id: "e1" }),
      entities_discovered: wrap({ type: "entities_discovered", ids: ["e1", "e2"], min: 2 }),
      artifact_owned: wrap({ type: "artifact_owned", artifact_id: "a1" }),
      atlas_location_visited: wrap({ type: "atlas_location_visited", location_id: "l1" }),
      achievement_unlocked: wrap({ type: "achievement_unlocked", achievement_id: "ach1" }),
      player_level: wrap({ type: "player_level", min: 5 }),
      story_complete: wrap({ type: "story_complete", story_id: "s1" }),
      date_window: wrap({ type: "date_window", start: "2025-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }),
    };
    // Sanity: registry matches the frozen list.
    expect(new Set(UNLOCK_NODE_TYPES)).toEqual(new Set(Object.keys(cases)));
    for (const [name, spec] of Object.entries(cases)) {
      const r = validateUnlockSpec(spec);
      expect({ name, ok: r.ok, errors: r.errors }).toEqual({ name, ok: true, errors: [] });
    }
  });

  it("rejects legacy vocabulary (never, all_of, any_of, achievement_earned)", () => {
    for (const bad of [
      { version: 2, expr: { type: "never" } },
      { version: 2, expr: { type: "all_of", of: [{ type: "always" }] } },
      { version: 2, expr: { type: "any_of", of: [{ type: "always" }] } },
      { version: 2, expr: { type: "achievement_earned", achievement_id: "x" } },
    ]) {
      const r = validateUnlockSpec(bad);
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => e.code === "unknown_type")).toBe(true);
    }
  });

  it("rejects legacy envelope { v, rule }", () => {
    const r = validateUnlockSpec({ v: 2, rule: { type: "always" } });
    expect(r.errors.some((e) => e.code === "wrong_version")).toBe(true);
    expect(r.errors.some((e) => e.code === "missing_expr")).toBe(true);
  });

  it("rejects wrong version / non-object / missing expr", () => {
    expect(validateUnlockSpec(null).errors[0].code).toBe("not_an_object");
    expect(validateUnlockSpec({ version: 1, expr: { type: "always" } })
      .errors.some((e) => e.code === "wrong_version")).toBe(true);
    expect(validateUnlockSpec({ version: 2 }).errors[0].code).toBe("missing_expr");
  });

  it("logical: rejects missing/empty/non-array 'of' and legacy 'children'", () => {
    expect(validateUnlockSpec(wrap({ type: "all" } as unknown as UnlockNode))
      .errors.some((e) => e.code === "missing_of")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "any", of: [] } })
      .errors.some((e) => e.code === "empty_of_forbidden")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "all", of: "no" } })
      .errors.some((e) => e.code === "of_not_array")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "all", children: [{ type: "always" }] } })
      .errors.some((e) => e.code === "extra_fields")).toBe(true);
  });

  it("leaves: rejects missing/non-string/empty ids", () => {
    for (const leaf of [
      { type: "story_complete" },
      { type: "campaign_complete" },
      { type: "investigation_complete" },
      { type: "entity_discovered" },
      { type: "artifact_owned" },
      { type: "atlas_location_visited" },
      { type: "achievement_unlocked" },
    ]) {
      const r = validateUnlockSpec({ version: 2, expr: leaf });
      expect(r.errors.some((e) => e.code === "missing_id_field")).toBe(true);
    }
    expect(validateUnlockSpec({ version: 2, expr: { type: "story_complete", story_id: "" } })
      .errors.some((e) => e.code === "id_empty")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "story_complete", story_id: 42 } })
      .errors.some((e) => e.code === "id_not_string")).toBe(true);
  });

  it("campaign_chapter_complete requires both ids", () => {
    const r = validateUnlockSpec({ version: 2, expr: { type: "campaign_chapter_complete", campaign_id: "c" } });
    expect(r.errors.some((e) => e.code === "missing_id_field" && e.path.endsWith(".chapter_id"))).toBe(true);
  });

  it("entities_discovered enforces ids + min shape", () => {
    expect(validateUnlockSpec({ version: 2, expr: { type: "entities_discovered", ids: [], min: 1 } })
      .errors.some((e) => e.code === "ids_empty")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "entities_discovered", ids: ["a"], min: 0 } })
      .errors.some((e) => e.code === "min_out_of_range")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "entities_discovered", ids: ["a"], min: 5 } })
      .errors.some((e) => e.code === "min_out_of_range")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "entities_discovered", ids: [1], min: 1 } })
      .errors.some((e) => e.code === "ids_item_not_string")).toBe(true);
  });

  it("player_level requires positive integer min", () => {
    expect(validateUnlockSpec({ version: 2, expr: { type: "player_level" } })
      .errors.some((e) => e.code === "missing_id_field")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "player_level", min: 0 } })
      .errors.some((e) => e.code === "min_out_of_range")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "player_level", min: 1.5 } })
      .errors.some((e) => e.code === "min_not_integer")).toBe(true);
  });

  it("date_window requires at least one bound and valid ISO dates", () => {
    expect(validateUnlockSpec({ version: 2, expr: { type: "date_window" } })
      .errors.some((e) => e.code === "date_window_empty")).toBe(true);
    expect(validateUnlockSpec({ version: 2, expr: { type: "date_window", start: "not-a-date" } })
      .errors.some((e) => e.code === "date_not_string")).toBe(true);
  });

  it("rejects extra fields on any node", () => {
    const r = validateUnlockSpec({ version: 2, expr: { type: "always", story_id: "x" } });
    expect(r.errors.some((e) => e.code === "extra_fields")).toBe(true);
  });

  it("enforces max depth (6) and max node count (64)", () => {
    let node: UnlockNode = { type: "always" };
    for (let i = 0; i < UNLOCK_LIMITS.MAX_DEPTH + 1; i++) node = { type: "not", child: node };
    expect(validateUnlockSpec({ version: 2, expr: node })
      .errors.some((e) => e.code === "depth_exceeded")).toBe(true);
    const of: UnlockNode[] = [];
    for (let i = 0; i < UNLOCK_LIMITS.MAX_NODES + 5; i++) of.push({ type: "always" });
    expect(validateUnlockSpec({ version: 2, expr: { type: "all", of } })
      .errors.some((e) => e.code === "node_count_exceeded")).toBe(true);
  });

  it("parseUnlockSpec throws on invalid input", () => {
    expect(() => parseUnlockSpec({ version: 2, expr: { type: "bogus" } })).toThrow(/invalid_unlock_spec/);
  });
});

describe("unlock spec v2 — evaluator (frozen)", () => {
  it("always / not(always) (fail-closed NEVER)", () => {
    expect(evaluateUnlock(ALWAYS_SPEC, EMPTY_CTX)).toBe(true);
    expect(evaluateUnlock(NEVER_SPEC, EMPTY_CTX)).toBe(false);
  });

  it("all / any / not", () => {
    const spec = wrap({
      type: "all",
      of: [
        { type: "any", of: [
          { type: "story_complete", story_id: "s1" },
          { type: "story_complete", story_id: "s2" },
        ]},
        { type: "not", child: { type: "campaign_complete", campaign_id: "cX" } },
      ],
    });
    expect(evaluateUnlock(spec, makeCtx({ stories: ["s2"] }))).toBe(true);
    expect(evaluateUnlock(spec, makeCtx({ stories: ["s2"], campaigns: ["cX"] }))).toBe(false);
    expect(evaluateUnlock(spec, EMPTY_CTX)).toBe(false);
  });

  it("every leaf evaluates against its context set", () => {
    expect(evaluateUnlock(wrap({ type: "campaign_complete", campaign_id: "c" }),
      makeCtx({ campaigns: ["c"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "campaign_chapter_complete", campaign_id: "c", chapter_id: "h" }),
      makeCtx({ chapters: ["c::h"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "investigation_complete", investigation_id: "i" }),
      makeCtx({ investigations: ["i"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "entity_discovered", entity_id: "e" }),
      makeCtx({ entities: ["e"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "entities_discovered", ids: ["a", "b", "c"], min: 2 }),
      makeCtx({ entities: ["a", "c"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "entities_discovered", ids: ["a", "b", "c"], min: 3 }),
      makeCtx({ entities: ["a", "c"] }))).toBe(false);
    expect(evaluateUnlock(wrap({ type: "artifact_owned", artifact_id: "x" }),
      makeCtx({ artifacts: ["x"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "atlas_location_visited", location_id: "L" }),
      makeCtx({ locations: ["L"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "achievement_unlocked", achievement_id: "u" }),
      makeCtx({ achievements: ["u"] }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "player_level", min: 5 }),
      makeCtx({ level: 5 }))).toBe(true);
    expect(evaluateUnlock(wrap({ type: "player_level", min: 5 }),
      makeCtx({ level: 4 }))).toBe(false);
    expect(evaluateUnlock(wrap({ type: "story_complete", story_id: "s" }),
      makeCtx({ stories: ["s"] }))).toBe(true);
    expect(evaluateUnlock(
      wrap({ type: "date_window", start: "2025-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }),
      makeCtx({ now: "2025-06-01T00:00:00Z" }))).toBe(true);
    expect(evaluateUnlock(
      wrap({ type: "date_window", start: "2025-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" }),
      makeCtx({ now: "2027-01-01T00:00:00Z" }))).toBe(false);
  });

  it("fails closed on invalid raw input", () => {
    expect(evaluateUnlockUnknown({ version: 2, expr: { type: "bogus" } }, EMPTY_CTX)).toBe(false);
    expect(evaluateUnlockUnknown("garbage", EMPTY_CTX)).toBe(false);
    expect(evaluateUnlockUnknown({ version: 99, expr: { type: "always" } }, EMPTY_CTX)).toBe(false);
  });
});

describe("unlock spec v2 — v1 compatibility (in-memory only)", () => {
  it("null → ALWAYS", () => {
    expect(normalizeUnlockSpec(null)).toEqual(ALWAYS_SPEC);
    expect(evaluateUnlockUnknown(null, EMPTY_CTX)).toBe(true);
  });

  it("legacy 'never' → not(always)", () => {
    expect(normalizeUnlockSpec({ type: "never" })).toEqual(NEVER_SPEC);
  });

  it("legacy all_of/any_of/and/or → all/any with 'of'", () => {
    const norm = normalizeUnlockSpec({
      type: "and",
      children: [
        { type: "or", children: [{ type: "story_completed", story_id: "s1" }] },
        { type: "campaign_completed", campaign_id: "c1" },
      ],
    });
    expect(norm.version).toBe(2);
    expect(norm.expr.type).toBe("all");
    expect(evaluateUnlock(norm, makeCtx({ stories: ["s1"], campaigns: ["c1"] }))).toBe(true);
  });

  it("legacy achievement_earned → achievement_unlocked", () => {
    const norm = normalizeUnlockSpec({ type: "achievement_earned", achievement_id: "a" });
    expect(norm.expr).toEqual({ type: "achievement_unlocked", achievement_id: "a" });
    expect(evaluateUnlock(norm, makeCtx({ achievements: ["a"] }))).toBe(true);
  });

  it("legacy envelope {v:2, rule} unwraps into {version:2, expr}", () => {
    const norm = normalizeUnlockSpec({ v: 2, rule: { type: "campaign_completed", campaign_id: "c" } });
    expect(norm).toEqual({ version: 2, expr: { type: "campaign_complete", campaign_id: "c" } });
  });

  it("garbage → NEVER", () => {
    expect(normalizeUnlockSpec({ type: "story_completed" })).toEqual(NEVER_SPEC);
    expect(normalizeUnlockSpec({ type: "unknown_thing" })).toEqual(NEVER_SPEC);
  });

  it("does not mutate input", () => {
    const src = { type: "and", children: [{ type: "campaign_completed", campaign_id: "c" }] };
    const snap = JSON.stringify(src);
    normalizeUnlockSpec(src);
    expect(JSON.stringify(src)).toBe(snap);
  });
});

describe("unlock spec v2 — cycle detection (frozen)", () => {
  it("detects direct A↔B cycle", () => {
    const stories = new Map<string, unknown>([
      ["A", { version: 2, expr: { type: "story_complete", story_id: "B" } }],
      ["B", { version: 2, expr: { type: "story_complete", story_id: "A" } }],
    ]);
    const cycles = detectUnlockCycles(stories);
    expect(cycles.length).toBe(1);
    expect(new Set(cycles[0].path)).toEqual(new Set(["A", "B"]));
  });

  it("detects 3-node cycle A→B→C→A", () => {
    const stories = new Map<string, unknown>([
      ["A", { version: 2, expr: { type: "story_complete", story_id: "B" } }],
      ["B", { version: 2, expr: { type: "story_complete", story_id: "C" } }],
      ["C", { version: 2, expr: { type: "story_complete", story_id: "A" } }],
    ]);
    expect(detectUnlockCycles(stories).length).toBe(1);
  });

  it("no cycle on a DAG", () => {
    const stories = new Map<string, unknown>([
      ["A", { version: 2, expr: { type: "story_complete", story_id: "B" } }],
      ["B", { version: 2, expr: { type: "story_complete", story_id: "C" } }],
      ["C", { version: 2, expr: { type: "always" } }],
    ]);
    expect(detectUnlockCycles(stories)).toEqual([]);
  });

  it("ignores deps outside the batch", () => {
    const stories = new Map<string, unknown>([
      ["A", { version: 2, expr: { type: "story_complete", story_id: "external" } }],
    ]);
    expect(detectUnlockCycles(stories)).toEqual([]);
  });

  it("extractStoryDeps traverses legacy nested trees", () => {
    const deps = extractStoryDeps({
      type: "and",
      children: [
        { type: "story_completed", story_id: "b" },
        { type: "or", children: [{ type: "story_completed", story_id: "a" }] },
      ],
    });
    expect(deps).toEqual(["a", "b"]);
  });
});
