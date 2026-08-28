import { describe, it, expect } from "vitest";
import { mergeSnapshots, type OfflineSnapshot } from "@/lib/offline-storage";
import { formatError, formatIssues } from "@/lib/offline-error-format";

function snap(collections: Record<string, any[]>, version = 1): OfflineSnapshot {
  const content_counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(collections)) content_counts[k] = v.length;
  return {
    snapshot_version: version,
    generated_at: new Date(version).toISOString(),
    collections,
    content_counts,
  } as unknown as OfflineSnapshot;
}

describe("bundled snapshot adoption never deletes local story/game content", () => {
  const local = snap(
    {
      encyclopedia_entities: [{ id: "e1" }],
      stories: [{ id: "s1" }],
      story_scenes: [{ id: "sc1", story_id: "s1" }],
      story_media: [{ id: "m1", story_id: "s1", verified: true }],
      story_collections: [{ id: "c1" }],
      games: [{ id: "g1" }],
    },
    1,
  );

  it("keeps collections absent from a newer APK bundle", () => {
    const bundled = snap({ encyclopedia_entities: [{ id: "e1" }, { id: "e2" }] }, 2);
    const merged = mergeSnapshots(local, bundled);

    expect(merged.snapshot_version).toBe(2);
    expect(merged.collections.encyclopedia_entities).toHaveLength(2);
    expect(merged.collections.stories).toHaveLength(1);
    expect(merged.collections.story_scenes).toHaveLength(1);
    expect(merged.collections.story_media).toHaveLength(1);
    expect(merged.collections.story_collections).toHaveLength(1);
    expect(merged.collections.games).toHaveLength(1);
    expect(merged.content_counts.games).toBe(1);
  });

  it("an empty incoming collection never wipes populated local rows", () => {
    const bundled = snap({ encyclopedia_entities: [{ id: "e1" }], stories: [] }, 3);
    expect(mergeSnapshots(local, bundled).collections.stories).toHaveLength(1);
  });

  it("incoming rows win when the bundle actually carries the collection", () => {
    const bundled = snap({ stories: [{ id: "s1" }, { id: "s2" }] }, 4);
    const merged = mergeSnapshots(local, bundled);
    expect(merged.collections.stories).toHaveLength(2);
    expect(merged.content_counts.stories).toBe(2);
  });

  it("adopts the bundle verbatim when there is no local snapshot", () => {
    const bundled = snap({ stories: [{ id: "s1" }] }, 5);
    expect(mergeSnapshots(null, bundled)).toBe(bundled);
  });
});

describe("update failures are readable — never [object Object]", () => {
  it("formats validation issue objects", () => {
    const msg = formatIssues([
      { level: "error", collection: "games", message: "مجموعة غير معروفة" },
      { level: "warning", collection: "stories", message: "تحذير" },
    ] as any);
    expect(msg).toBe("games: مجموعة غير معروفة");
    expect(msg).not.toContain("[object Object]");
  });

  it("formats PostgREST-shaped error objects", () => {
    const msg = formatError({ message: "permission denied", code: "42501" });
    expect(msg).toContain("permission denied");
    expect(msg).toContain("42501");
    expect(msg).not.toContain("[object Object]");
  });

  it("never returns [object Object] for arbitrary values", () => {
    for (const v of [null, undefined, {}, { a: 1 }, new Error("boom"), "خطأ"]) {
      expect(formatError(v)).not.toContain("[object Object]");
    }
  });
});
