// ============================================================
// V16 — Story baseline + auth hydration regression tests
// ============================================================
import { describe, expect, it } from "vitest";
import { resolveCanonicalCtaTarget, type CtaEntityRow } from "@/lib/stories/unlock/prereq-cta";
import { storyIdentityKey, storySummaryQueryKey, STORY_SUMMARY_PREFIX } from "@/lib/stories/query-keys";
import { storyState, type StorySummary } from "@/lib/stories/summary";

const DUPLICATE = "10fc1316-e685-4080-bc0c-0f93de0ed65f";
const CANONICAL = "3919a011-690e-48d5-b08a-99a0a75f1f6c";

const rows: Record<string, CtaEntityRow> = {
  [DUPLICATE]: { id: DUPLICATE, enabled: false, title: "نسخة مكررة", metadata: { canonical_id: CANONICAL } },
  [CANONICAL]: { id: CANONICAL, enabled: true, title: "قصر الحمراء" },
  orphanDisabled: { id: "orphanDisabled", enabled: false, title: "بدون بديل", metadata: {} },
  loopA: { id: "loopA", enabled: false, metadata: { canonical_id: "loopB" } },
  loopB: { id: "loopB", enabled: false, metadata: { canonical_id: "loopA" } },
};
const lookup = (id: string) => rows[id] ?? null;

describe("prerequisite CTA canonicalization", () => {
  it("navigates a disabled duplicate to its enabled canonical replacement", () => {
    const r = resolveCanonicalCtaTarget(DUPLICATE, lookup);
    expect(r.targetId).toBe(CANONICAL);
    expect(r.reason).toBe("redirected");
  });

  it("keeps an already-canonical enabled ref untouched", () => {
    const r = resolveCanonicalCtaTarget(CANONICAL, lookup);
    expect(r.targetId).toBe(CANONICAL);
    expect(r.reason).toBe("canonical");
  });

  it("produces NO CTA for a disabled entity without a replacement", () => {
    expect(resolveCanonicalCtaTarget("orphanDisabled", lookup).targetId).toBeNull();
  });

  it("produces NO CTA for a missing/empty ref", () => {
    expect(resolveCanonicalCtaTarget("nope", lookup).targetId).toBeNull();
    expect(resolveCanonicalCtaTarget("", lookup).targetId).toBeNull();
  });

  it("terminates on a redirect loop without hanging", () => {
    expect(resolveCanonicalCtaTarget("loopA", lookup).targetId).toBeNull();
  });

  it("fails closed when the lookup throws", () => {
    expect(resolveCanonicalCtaTarget(CANONICAL, () => { throw new Error("boom"); }).targetId).toBeNull();
  });
});

describe("identity-scoped summary cache keys", () => {
  it("never shares a cache entry between guest, pending and a user", () => {
    const guest = storyIdentityKey(null, false);
    const pending = storyIdentityKey(null, true);
    const user = storyIdentityKey({ id: "uid-1" }, false);
    expect(new Set([guest, pending, user]).size).toBe(3);
    expect(storySummaryQueryKey(guest, null, "catalog")).not.toEqual(
      storySummaryQueryKey(user, null, "catalog"),
    );
  });

  it("separates two different users", () => {
    expect(storyIdentityKey({ id: "a" }, false)).not.toBe(storyIdentityKey({ id: "b" }, false));
  });

  it("keeps the stories-summary prefix so invalidation still matches", () => {
    expect(storySummaryQueryKey("uid", "andalus", "rail")[0]).toBe(STORY_SUMMARY_PREFIX);
  });
});

describe("completion survives a temporarily incomplete unlock evaluation", () => {
  const base = { id: "s1", title: "t", progress: null } as unknown as StorySummary;

  it("shows completed even when local unlock is momentarily false", () => {
    expect(storyState({ ...base, unlocked: false, completed: true })).toBe("completed");
  });

  it("still reports locked for an unfinished locked story carrying progress", () => {
    expect(
      storyState({
        ...base,
        unlocked: false,
        completed: false,
        progress: { last_scene_index: 3, max_scene_index_reached: 3 },
      } as StorySummary),
    ).toBe("locked");
  });

  it("reports in_progress only when unlocked", () => {
    expect(
      storyState({
        ...base,
        unlocked: true,
        completed: false,
        progress: { last_scene_index: 1, max_scene_index_reached: 1 },
      } as StorySummary),
    ).toBe("in_progress");
  });
});
