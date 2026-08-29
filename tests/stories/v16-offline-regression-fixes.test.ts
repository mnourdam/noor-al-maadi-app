// V16 regression fixes — missing unlock_spec, redacted sync merge,
// celebration authority, false content-update loop.
import { describe, it, expect } from "vitest";
import {
  storyUnlockSpecOrNever,
  isStoryRowAlwaysUnlocked,
  evaluateStoryRowUnlock,
} from "@/lib/stories/unlock/story-row";
import {
  mergeStoryRowsPreserving,
  mergeStoryChildRows,
  mergeStoryCollection,
} from "@/lib/offline-snapshot";
import { diffAgainstManifest } from "@/lib/offline-content-update";
import { authoritativeRows, MAX_CELEBRATIONS_PER_SCAN } from "@/components/stories/StoryUnlockCelebration";

const GATED = { version: 2, expr: { type: "story_complete", story_id: "story_a" } };

describe("Fix 1 — missing unlock_spec fails closed", () => {
  it("1. row without the unlock_spec key is LOCKED", () => {
    const row = { id: "s1", slug: "s1", is_locked: true };
    expect(storyUnlockSpecOrNever(row).expr.type).not.toBe("always");
    expect(isStoryRowAlwaysUnlocked(row)).toBe(false);
    expect(evaluateStoryRowUnlock(row, {})).toBe(false);
  });

  it("2. explicit legacy null unlock_spec keeps legacy ALWAYS behaviour", () => {
    const row = { id: "s2", unlock_spec: null };
    expect(isStoryRowAlwaysUnlocked(row)).toBe(true);
    expect(evaluateStoryRowUnlock(row, {})).toBe(true);
  });

  it("valid always/gated specs behave normally", () => {
    expect(isStoryRowAlwaysUnlocked({ id: "s", unlock_spec: { version: 2, expr: { type: "always" } } })).toBe(true);
    expect(isStoryRowAlwaysUnlocked({ id: "s", unlock_spec: GATED })).toBe(false);
    expect(evaluateStoryRowUnlock({ id: "s", unlock_spec: GATED }, {
      completed_story_ids: new Set(["story_a"]),
    })).toBe(true);
  });

  it("7. direct access cannot be bypassed by stripped metadata", () => {
    const complete = { id: "s3", unlock_spec: GATED };
    const redacted = { id: "s3", slug: "s3", is_locked: true };
    expect(isStoryRowAlwaysUnlocked(complete)).toBe(false);
    expect(isStoryRowAlwaysUnlocked(redacted)).toBe(false);
  });
});

describe("Fix 2 — redacted sync must not degrade the baseline", () => {
  const baseline = [
    { id: "a", unlock_spec: GATED, cover_media_id: "m1", metadata: { k: 1 }, tags: ["x"] },
    { id: "b", unlock_spec: { version: 2, expr: { type: "always" } }, cover_media_id: "m2" },
  ];

  it("3. redacted incoming row preserves unlock_spec", () => {
    const out = mergeStoryRowsPreserving(baseline, [{ id: "a", slug: "a", is_locked: true, title_ar: "جديد" }]);
    const a = out.find((r) => r.id === "a")!;
    expect(a.unlock_spec).toEqual(GATED);
    expect(a.title_ar).toBe("جديد");
  });

  it("4. redacted incoming row preserves cover/media + prerequisite metadata; scenes survive", () => {
    const out = mergeStoryRowsPreserving(baseline, [{ id: "a", slug: "a", is_locked: true }]);
    const a = out.find((r) => r.id === "a")!;
    expect(a.cover_media_id).toBe("m1");
    expect(a.metadata).toEqual({ k: 1 });
    expect(a.tags).toEqual(["x"]);

    const scenes = [{ id: "sc1", story_id: "a" }, { id: "sc2", story_id: "b" }];
    const merged = mergeStoryChildRows(scenes, [{ id: "sc2", story_id: "b", scene_index: 0 }]);
    expect(merged.map((r) => r.id).sort()).toEqual(["sc1", "sc2"]);
  });

  it("5. an incoming subset cannot shrink the complete baseline", () => {
    const out = mergeStoryCollection("stories", baseline, [{ id: "b", slug: "b" }]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.id === "a")!.unlock_spec).toEqual(GATED);
  });

  it("6. local lock state after a redacted sync matches server truth", () => {
    const synced = mergeStoryCollection("stories", baseline, [
      { id: "a", slug: "a", is_locked: true },
      { id: "b", slug: "b", unlock_spec: { version: 2, expr: { type: "always" } }, is_locked: false },
    ]);
    expect(isStoryRowAlwaysUnlocked(synced.find((r) => r.id === "a"))).toBe(false); // server: locked
    expect(isStoryRowAlwaysUnlocked(synced.find((r) => r.id === "b"))).toBe(true);  // server: unlocked
  });
});

describe("Fix 3 — celebrations only from authoritative rows", () => {
  const row = (id: string, unlocked: boolean, source?: "server" | "local") =>
    ({ id, unlocked, title_ar: id, source } as never);

  it("8/9. local fallback and baseline-seeded rows are ignored", () => {
    expect(authoritativeRows([row("a", true, "local"), row("b", true)])).toHaveLength(0);
    expect(authoritativeRows([row("a", true, "server")])).toHaveLength(1);
  });

  it("10. mass-transition threshold is small and explicit", () => {
    expect(MAX_CELEBRATIONS_PER_SCAN).toBe(3);
  });
});

describe("Fix 4 — content update identity", () => {
  const local = {
    generated_at: "2026-08-28T00:00:00.000Z",
    content_counts: { stories: 186, story_scenes: 1686, encyclopedia_entities: 1762 },
  };

  it("11. fresh APK with current content shows no update", () => {
    const out = diffAgainstManifest(local, [
      { collection: "stories", total_count: 186, last_updated: "2026-08-27T00:00:00.000Z" },
      { collection: "encyclopedia_entities", total_count: 1762, last_updated: "2026-08-27T00:00:00.000Z" },
    ], Date.parse("2026-08-29T00:00:00.000Z"));
    expect(out).toEqual([]);
  });

  it("12. a player reaction bumping stories.updated_at is NOT a content update", () => {
    const out = diffAgainstManifest(local, [
      { collection: "stories", total_count: 186, last_updated: "2026-08-29T07:41:00.000Z" },
    ], Date.parse("2026-08-29T08:00:00.000Z"));
    expect(out).toEqual([]);
  });

  it("13. a real editorial change (published catalog identity) is detected", () => {
    const out = diffAgainstManifest(local, [
      { collection: "stories", total_count: 187, last_updated: "2026-08-29T07:41:00.000Z" },
    ], Date.parse("2026-08-29T08:00:00.000Z"));
    expect(out).toEqual(["stories"]);
    const enc = diffAgainstManifest(local, [
      { collection: "encyclopedia_entities", total_count: 1762, last_updated: "2026-08-29T00:00:00.000Z" },
    ], Date.parse("2026-08-29T08:00:00.000Z"));
    expect(enc).toEqual(["encyclopedia_entities"]);
  });

  it("14/15. after apply, identity converges and repeated/offline-online checks stay quiet", () => {
    const applied = {
      generated_at: "2026-08-29T08:00:00.000Z",
      content_counts: { stories: 187, encyclopedia_entities: 1762 },
    };
    const manifest = [
      { collection: "stories", total_count: 187, last_updated: "2026-08-29T07:41:00.000Z" },
      { collection: "encyclopedia_entities", total_count: 1762, last_updated: "2026-08-29T00:00:00.000Z" },
    ];
    const now = Date.parse("2026-08-29T09:00:00.000Z");
    expect(diffAgainstManifest(applied, manifest, now)).toEqual([]);
    expect(diffAgainstManifest(applied, manifest, now + 600_000)).toEqual([]);
  });
});
