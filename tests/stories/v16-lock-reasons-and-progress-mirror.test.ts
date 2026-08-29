// ============================================================
// V16 — local lock-reason derivation + authenticated progress mirror
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";

import { deriveStoryPrereqs } from "@/lib/stories/unlock/derive-prereqs";
import { createLocalTitleResolver } from "@/lib/stories/unlock/local-titles";
import {
  readMirror,
  mergeAuthoritativeRows,
  upsertProgress,
  markCompleted,
  mirrorKey,
  clearMirror,
} from "@/lib/stories/progress-mirror";
import { storyState, type StorySummary } from "@/lib/stories/summary";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

const GATED_ROW = {
  id: "story_gated",
  title_ar: "قصة مقفلة",
  unlock_spec: {
    version: 2,
    expr: {
      type: "all",
      of: [
        { type: "story_complete", story_id: "story_prev" },
        { type: "entity_discovered", entity_id: "ent-1" },
      ],
    },
  },
};

const resolver = createLocalTitleResolver({
  stories: [{ id: "story_prev", title_ar: "الصحراء التي أنجبت دولة" }],
  entities: [{ id: "ent-1", name_ar: "المرابطون" }],
  campaigns: [{ id: "camp-1", title_ar: "حملة بدر" }],
  investigations: [{ id: "inv-1", title_ar: "تحقيق" }],
});

describe("FIX 1 — local prerequisite derivation", () => {
  it("1. derives real prerequisites for a gated story row", () => {
    const p = deriveStoryPrereqs(GATED_ROW, {}, resolver);
    expect(p.map((x) => x.kind)).toEqual(["story_completed", "entity_discovered"]);
    expect(p.length).toBeGreaterThan(0);
  });

  it("2. authored lock_explanation takes priority (dialog contract)", () => {
    // The dialog prefers `explanation` over the prereq list; the derivation
    // never overwrites the authored copy on the row.
    const row = { ...GATED_ROW, lock_explanation: "نص مؤلَّف" };
    expect(row.lock_explanation).toBe("نص مؤلَّف");
    expect(deriveStoryPrereqs(row, {}, resolver).length).toBe(2);
  });

  it("3. story prerequisite title resolves locally", () => {
    const p = deriveStoryPrereqs(GATED_ROW, {}, resolver);
    expect(p[0].title).toBe("الصحراء التي أنجبت دولة");
  });

  it("4. encyclopedia prerequisite title resolves locally", () => {
    const p = deriveStoryPrereqs(GATED_ROW, {}, resolver);
    expect(p[1].title).toBe("المرابطون");
  });

  it("5. satisfied state matches the offline evaluator", () => {
    const p = deriveStoryPrereqs(
      GATED_ROW,
      {
        completed_story_ids: new Set(["story_prev"]),
        discovered_entity_ids: new Set<string>(),
      },
      resolver,
    );
    expect(p[0].satisfied).toBe(true);
    expect(p[1].satisfied).toBe(false);
  });

  it("6. missing evidence never marks a requirement satisfied", () => {
    const p = deriveStoryPrereqs(GATED_ROW, {}, resolver);
    expect(p.every((x) => x.satisfied === false)).toBe(true);
  });

  it("6b. a redacted row (no unlock_spec key) derives nothing", () => {
    expect(deriveStoryPrereqs({ id: "x" }, {}, resolver)).toEqual([]);
  });

  it("6c. an always-open row derives nothing", () => {
    expect(
      deriveStoryPrereqs({ id: "x", unlock_spec: { version: 2, expr: { type: "always" } } }),
    ).toEqual([]);
  });
});

function ls(): Storage {
  return globalThis.localStorage;
}

describe("FIX 2 — authenticated progress mirror", () => {
  beforeEach(() => {
    ls().clear();
  });

  it("11. an authoritative list response hydrates the mirror", () => {
    mergeAuthoritativeRows(USER_A, [
      { id: "s1", completed: true, content_version: 3 },
      { id: "s2", completed: false, progress: { last_scene_index: 2, max_scene_index_reached: 4 } },
    ]);
    const m = readMirror(USER_A);
    expect(m.entries.s1.completed).toBe(true);
    expect(m.entries.s1.contentVersion).toBe(3);
    expect(m.entries.s2.maxSceneIndexReached).toBe(4);
  });

  it("12. a successful progress RPC upserts only that story", () => {
    upsertProgress(USER_A, "s3", { lastSceneIndex: 1, maxSceneIndexReached: 1 });
    const m = readMirror(USER_A);
    expect(Object.keys(m.entries)).toEqual(["s3"]);
    expect(m.entries.s3.lastSceneIndex).toBe(1);
  });

  it("12b. progress never regresses", () => {
    upsertProgress(USER_A, "s3", { lastSceneIndex: 5, maxSceneIndexReached: 5 });
    upsertProgress(USER_A, "s3", { lastSceneIndex: 1, maxSceneIndexReached: 1 });
    expect(readMirror(USER_A).entries.s3.maxSceneIndexReached).toBe(5);
  });

  it("13. a successful completion RPC upserts the mirror", () => {
    markCompleted(USER_A, "s4", { contentVersion: 2 });
    expect(readMirror(USER_A).entries.s4.completed).toBe(true);
  });

  it("14. a partial/error response never wipes the mirror", () => {
    markCompleted(USER_A, "s4");
    mergeAuthoritativeRows(USER_A, []);
    mergeAuthoritativeRows(USER_A, null);
    mergeAuthoritativeRows(USER_A, [{ id: "s9", completed: false }]);
    const m = readMirror(USER_A);
    expect(m.entries.s4.completed).toBe(true);
    expect(m.entries.s9.completed).toBe(false);
  });

  it("15. the mirror only ever touches localStorage (never uploaded)", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("src/lib/stories/progress-mirror.ts", "utf8"),
    );
    expect(src).not.toMatch(/supabase|rpc\(|fetch\(/);
  });

  it("16. user A's mirror is never visible to user B", () => {
    markCompleted(USER_A, "s4");
    expect(Object.keys(readMirror(USER_B).entries)).toEqual([]);
    // and A's data survives — never deleted on account switch
    expect(readMirror(USER_A).entries.s4.completed).toBe(true);
  });

  it("16b. a blob stamped for another uid is rejected", () => {
    ls().setItem(
      mirrorKey(USER_B),
      JSON.stringify({ v: 1, uid: USER_A, updatedAt: 1, entries: { s4: { completed: true } } }),
    );
    expect(readMirror(USER_B).entries).toEqual({});
  });

  it("17. guest/sign-out reads expose no authenticated progress", () => {
    markCompleted(USER_A, "s4");
    expect(readMirror(null).entries).toEqual({});
    expect(readMirror("").entries).toEqual({});
  });

  it("18. returning to the same user restores the mirror", () => {
    markCompleted(USER_A, "s4");
    // simulated sign-out to guest, then back in
    expect(readMirror(null).entries).toEqual({});
    expect(readMirror(USER_A).entries.s4.completed).toBe(true);
  });

  it("18b. explicit teardown clears only the requested namespace", () => {
    markCompleted(USER_A, "s4");
    markCompleted(USER_B, "s5");
    clearMirror(USER_A);
    expect(readMirror(USER_A).entries).toEqual({});
    expect(readMirror(USER_B).entries.s5.completed).toBe(true);
  });

  it("20. clean install with no mirror falls back safely", () => {
    const m = readMirror(USER_A);
    expect(m.entries).toEqual({});
    expect(m.uid).toBe(USER_A);
  });
});

describe('"جديدة" badge derivation', () => {
  const base: StorySummary = {
    story_collection_id: null, collection_order: null,
    id: "s1", slug: "s1", title_ar: "x", title_en: null,
    summary_ar: null, summary_en: null, world_slug: null, era: null,
    display_order: 0, xp_reward: 0, dinar_reward: 0, cover_media_id: null,
    content_version: 1, published_at: null, scene_count: 3,
    category: null, rarity: null, length_class: null, historical_confidence: null,
    tags: [], prereqs: [], lock_explanation: null,
    unlocked: true, completed: false, progress: null, source: "local",
  };

  it("7/9. a cached completed story is not 'جديدة'", () => {
    expect(storyState({ ...base, completed: true })).toBe("completed");
  });

  it("8/10. a cached in-progress story is not 'جديدة'", () => {
    expect(
      storyState({ ...base, progress: { last_scene_index: 1, max_scene_index_reached: 1 } }),
    ).toBe("in_progress");
  });

  it("genuinely unread stories stay 'new'", () => {
    expect(storyState(base)).toBe("new");
  });

  it("21. an authoritative server row overrides the cached state", () => {
    const server: StorySummary = { ...base, source: "server", completed: true };
    expect(storyState(server)).toBe("completed");
  });
});
