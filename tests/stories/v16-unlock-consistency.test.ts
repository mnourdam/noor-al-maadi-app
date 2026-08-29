// ============================================================
// V16 — Story unlock consistency (ONE LOCAL SEMANTIC)
// ------------------------------------------------------------
// Regression cover for the three Android cases:
//   • story_alhambra_palace   — "all requirements green but locked"
//   • story_nasrid_dynastic_conflict — partial evidence stays locked
//   • story_abu_abdullah_al_saghir  — canonical encyclopedia reference
// plus the property invariant between derived prerequisites and the
// parent local evaluation, and the "progress never grants access" rule.
// ============================================================
import { describe, it, expect } from "vitest";

import { resolveLocalUnlocked, storyState, type StorySummary } from "@/lib/stories/summary";
import { deriveStoryPrereqs } from "@/lib/stories/unlock/derive-prereqs";
import { evaluateStoryRowUnlock } from "@/lib/stories/unlock/story-row";
import type { PlayerUnlockState } from "@/lib/stories/unlock/local";
import {
  collectUnlockEntityRefs,
  checkUnlockEntityReferences,
} from "@/lib/stories/unlock/reference-integrity";

// ── Production fixtures (exact ids from the published catalogue) ──────────
const ENTITY_ALHAMBRA = "34e2b5a4-a9ab-4227-9ac5-6742fc5f75e9";
const ENTITY_GRANADA = "0b8a6362-6825-4d7f-961c-6b8eac900ed5";
const ENTITY_ABU_ABDULLAH_CANONICAL = "3919a011-690e-48d5-b08a-99a0a75f1f6c";
const ENTITY_ABU_ABDULLAH_DEPRECATED = "10fc1316-e685-4080-bc0c-0f93de0ed65f";

const STORY_ABU_ABDULLAH = {
  id: "story_abu_abdullah_al_saghir",
  title_ar: "أبو عبد الله الصغير... آخر ملوك غرناطة",
  unlock_spec: {
    version: 2,
    expr: {
      type: "all",
      of: [
        { type: "story_complete", story_id: "story_andalus_before_the_end" },
        { type: "entity_discovered", entity_id: ENTITY_ABU_ABDULLAH_CANONICAL },
      ],
    },
  },
};

const STORY_ALHAMBRA = {
  id: "story_alhambra_palace",
  title_ar: "قصر الحمراء... ذاكرة الأندلس",
  unlock_spec: {
    version: 2,
    expr: {
      type: "all",
      of: [
        { type: "story_complete", story_id: "story_abu_abdullah_al_saghir" },
        { type: "entity_discovered", entity_id: ENTITY_ALHAMBRA },
      ],
    },
  },
};

const STORY_NASRID = {
  id: "story_nasrid_dynastic_conflict",
  title_ar: "الصراع داخل البيت النصري",
  unlock_spec: {
    version: 2,
    expr: {
      type: "all",
      of: [
        { type: "story_complete", story_id: "story_alhambra_palace" },
        { type: "entity_discovered", entity_id: ENTITY_GRANADA },
      ],
    },
  },
};

function evidence(p: {
  stories?: string[];
  entities?: string[];
}): PlayerUnlockState {
  return {
    completed_story_ids: new Set(p.stories ?? []),
    discovered_entity_ids: new Set(p.entities ?? []),
  };
}

function summaryFrom(
  row: { id: string },
  unlocked: boolean,
  progress: StorySummary["progress"],
): StorySummary {
  return {
    id: row.id,
    unlocked,
    completed: false,
    // Mirrors the local-summary rule: progress is dropped while locked.
    progress: unlocked ? progress : null,
  } as unknown as StorySummary;
}

// ─────────────────────────────────────────────────────────────────────────
describe("REGRESSION — story_alhambra_palace (all green ⇒ unlocked)", () => {
  const full = evidence({
    stories: ["story_abu_abdullah_al_saghir"],
    entities: [ENTITY_ALHAMBRA],
  });

  it("1. both prerequisites render satisfied under local evidence", () => {
    const p = deriveStoryPrereqs(STORY_ALHAMBRA, full);
    expect(p).toHaveLength(2);
    expect(p.every((x) => x.satisfied)).toBe(true);
  });

  it("2. the card cannot stay locked when every leaf is satisfied", () => {
    expect(resolveLocalUnlocked(STORY_ALHAMBRA, full, new Set())).toBe(true);
  });

  it("3. offline (no server-confirmed cache at all) agrees", () => {
    expect(resolveLocalUnlocked(STORY_ALHAMBRA, full, null)).toBe(true);
  });

  it("4. RPC timeout / local fallback path agrees with the dialog", () => {
    const unlocked = resolveLocalUnlocked(STORY_ALHAMBRA, full, new Set());
    const prereqs = deriveStoryPrereqs(STORY_ALHAMBRA, full);
    expect(unlocked).toBe(prereqs.every((x) => x.satisfied));
  });

  it("5. a successful server refresh (cache floor) keeps it unlocked", () => {
    expect(
      resolveLocalUnlocked(STORY_ALHAMBRA, {}, new Set(["story_alhambra_palace"])),
    ).toBe(true);
  });

  it("6. missing evidence still locks it (no false positive)", () => {
    const partial = evidence({ entities: [ENTITY_ALHAMBRA] });
    expect(resolveLocalUnlocked(STORY_ALHAMBRA, partial, new Set())).toBe(false);
  });
});

describe("REGRESSION — story_nasrid_dynastic_conflict", () => {
  const partial = evidence({ entities: [ENTITY_GRANADA] });

  it("7. stays locked while Alhambra is not completed", () => {
    expect(resolveLocalUnlocked(STORY_NASRID, partial, new Set())).toBe(false);
  });

  it("8. Granada ✓ and Alhambra ✗ in the dialog", () => {
    const p = deriveStoryPrereqs(STORY_NASRID, partial);
    const story = p.find((x) => x.kind === "story_completed");
    const ent = p.find((x) => x.kind === "entity_discovered");
    expect(ent?.satisfied).toBe(true);
    expect(story?.satisfied).toBe(false);
  });

  it("9. progress on Alhambra never satisfies story_complete", () => {
    const withProgress: PlayerUnlockState = {
      ...partial,
      // progress/resume state is deliberately NOT part of the evidence shape
      completed_story_ids: new Set<string>(),
    };
    expect(resolveLocalUnlocked(STORY_NASRID, withProgress, new Set())).toBe(false);
  });

  it("10. genuine completion unlocks the parent", () => {
    const done = evidence({
      stories: ["story_alhambra_palace"],
      entities: [ENTITY_GRANADA],
    });
    expect(resolveLocalUnlocked(STORY_NASRID, done, new Set())).toBe(true);
    expect(deriveStoryPrereqs(STORY_NASRID, done).every((x) => x.satisfied)).toBe(true);
  });

  it("11. the CTA target obeys its own rules (Alhambra still gated)", () => {
    expect(resolveLocalUnlocked(STORY_ALHAMBRA, partial, new Set())).toBe(false);
  });
});

describe("REGRESSION — encyclopedia reference integrity", () => {
  it("12. Abu Abdullah now references the canonical ENABLED entity", () => {
    expect(collectUnlockEntityRefs(STORY_ABU_ABDULLAH.unlock_spec)).toEqual([
      ENTITY_ABU_ABDULLAH_CANONICAL,
    ]);
  });

  it("13. a disabled reference is reported, with its canonical replacement", () => {
    const bad = {
      version: 2,
      expr: { type: "entity_discovered", entity_id: ENTITY_ABU_ABDULLAH_DEPRECATED },
    };
    const f = checkUnlockEntityReferences(bad, {
      [ENTITY_ABU_ABDULLAH_DEPRECATED]: {
        enabled: false,
        canonicalId: ENTITY_ABU_ABDULLAH_CANONICAL,
      },
    });
    expect(f).toEqual([
      {
        entityId: ENTITY_ABU_ABDULLAH_DEPRECATED,
        problem: "disabled",
        canonicalId: ENTITY_ABU_ABDULLAH_CANONICAL,
      },
    ]);
  });

  it("14. an unknown reference fails closed as missing", () => {
    const f = checkUnlockEntityReferences(STORY_ALHAMBRA.unlock_spec, {});
    expect(f).toEqual([{ entityId: ENTITY_ALHAMBRA, problem: "missing" }]);
  });

  it("15. an enabled reference produces no finding", () => {
    expect(
      checkUnlockEntityReferences(STORY_ALHAMBRA.unlock_spec, {
        [ENTITY_ALHAMBRA]: { enabled: true },
      }),
    ).toEqual([]);
  });
});

// ── Property: derived prerequisites and parent evaluation agree ──────────
describe("PROPERTY — prereq display ⇔ parent local evaluation", () => {
  const SPECS: Array<{ name: string; row: any }> = [
    { name: "alhambra", row: STORY_ALHAMBRA },
    { name: "nasrid", row: STORY_NASRID },
    { name: "abu_abdullah", row: STORY_ABU_ABDULLAH },
    {
      name: "any-branch",
      row: {
        id: "s_any",
        unlock_spec: {
          version: 2,
          expr: {
            type: "any",
            of: [
              { type: "story_complete", story_id: "a" },
              { type: "entity_discovered", entity_id: "e" },
            ],
          },
        },
      },
    },
    {
      name: "nested",
      row: {
        id: "s_nested",
        unlock_spec: {
          version: 2,
          expr: {
            type: "all",
            of: [
              { type: "story_complete", story_id: "a" },
              {
                type: "any",
                of: [
                  { type: "entity_discovered", entity_id: "e1" },
                  { type: "entity_discovered", entity_id: "e2" },
                ],
              },
            ],
          },
        },
      },
    },
  ];

  const EVIDENCES: PlayerUnlockState[] = [
    {},
    evidence({ stories: ["a"] }),
    evidence({ entities: ["e"] }),
    evidence({ stories: ["a"], entities: ["e1"] }),
    evidence({ stories: ["a"], entities: ["e1", "e2"] }),
    evidence({
      stories: ["story_abu_abdullah_al_saghir", "story_alhambra_palace", "story_andalus_before_the_end"],
      entities: [ENTITY_ALHAMBRA, ENTITY_GRANADA, ENTITY_ABU_ABDULLAH_CANONICAL],
    }),
  ];

  it("16. `all` — every displayed leaf satisfied ⇒ parent unlocked", () => {
    for (const { name, row } of SPECS) {
      if (row.unlock_spec.expr.type !== "all") continue;
      for (const ev of EVIDENCES) {
        const leaves = deriveStoryPrereqs(row, ev);
        if (leaves.length > 0 && leaves.every((l) => l.satisfied)) {
          expect(evaluateStoryRowUnlock(row, ev), name).toBe(true);
        }
      }
    }
  });

  it("17. `any` — one satisfied branch ⇒ parent unlocked", () => {
    const row = SPECS.find((s) => s.name === "any-branch")!.row;
    for (const ev of EVIDENCES) {
      const leaves = deriveStoryPrereqs(row, ev);
      if (leaves.some((l) => l.satisfied)) {
        expect(evaluateStoryRowUnlock(row, ev)).toBe(true);
      }
    }
  });

  it("18. locked parent ⇒ at least one unsatisfied leaf (all-specs)", () => {
    for (const { name, row } of SPECS) {
      if (row.unlock_spec.expr.type !== "all") continue;
      for (const ev of EVIDENCES) {
        if (!evaluateStoryRowUnlock(row, ev)) {
          const leaves = deriveStoryPrereqs(row, ev);
          expect(leaves.some((l) => !l.satisfied), name).toBe(true);
        }
      }
    }
  });

  it("19. nested expression semantics are preserved (not flattened)", () => {
    const row = SPECS.find((s) => s.name === "nested")!.row;
    // Only the `any` branch satisfied — parent must stay locked even though
    // one displayed leaf shows ✓.
    const ev = evidence({ entities: ["e1"] });
    expect(deriveStoryPrereqs(row, ev).some((l) => l.satisfied)).toBe(true);
    expect(evaluateStoryRowUnlock(row, ev)).toBe(false);
    expect(evaluateStoryRowUnlock(row, evidence({ stories: ["a"], entities: ["e2"] }))).toBe(true);
  });

  it("20. a row with NO unlock_spec key stays fail-closed", () => {
    expect(resolveLocalUnlocked({ id: "redacted" }, EVIDENCES[5], new Set())).toBe(false);
    expect(deriveStoryPrereqs({ id: "redacted" }, EVIDENCES[5])).toEqual([]);
  });
});

// ── Progress never grants access ─────────────────────────────────────────
describe("PROGRESS — never unlock evidence", () => {
  const stale = { last_scene_index: 3, max_scene_index_reached: 3 };

  it("21. stale progress on a locked story shows no استئناف", () => {
    const unlocked = resolveLocalUnlocked(STORY_ALHAMBRA, {}, new Set());
    const s = summaryFrom(STORY_ALHAMBRA, unlocked, stale);
    expect(unlocked).toBe(false);
    expect(s.progress).toBeNull();
    expect(storyState(s)).toBe("locked");
  });

  it("22. the progress itself is preserved upstream (mirror untouched)", () => {
    // The mirror entry is the input; dropping it from the SUMMARY does not
    // erase it, so a later unlock can resume normally.
    const unlockedLater = resolveLocalUnlocked(
      STORY_ALHAMBRA,
      evidence({ stories: ["story_abu_abdullah_al_saghir"], entities: [ENTITY_ALHAMBRA] }),
      new Set(),
    );
    const s = summaryFrom(STORY_ALHAMBRA, unlockedLater, stale);
    expect(unlockedLater).toBe(true);
    expect(s.progress).toEqual(stale);
    expect(storyState(s)).toBe("in_progress");
  });

  it("23. the server-confirmed floor is not derived from progress", () => {
    // Only ids the authoritative RPC reported unlocked may enter the cache.
    expect(resolveLocalUnlocked(STORY_NASRID, {}, new Set(["other_story"]))).toBe(false);
  });
});
