/**
 * V16 — Story editorial content identity (two-stage detection).
 * Covers requirements G1–G16.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

import {
  canonicalStoryPayload,
  storyEditorialFingerprint,
  EXCLUDED_ROW_FIELDS,
} from "@/lib/stories/content-identity";
import {
  readStoryIdentity,
  writeStoryIdentity,
  emptyStoryIdentity,
  shouldRunStage2,
  recordAppliedIdentity,
  isKnownBenign,
  STAGE2_MIN_INTERVAL_MS,
  STORY_IDENTITY_KEY,
} from "@/lib/stories/content-identity-store";
import { verifyStoryEditorialChange } from "@/lib/stories/content-identity-check";
import { diffManifestDetailed } from "@/lib/offline-content-update";

// --- localStorage stub (node env) -----------------------------------------
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
(globalThis as any).localStorage = new MemStorage();

// --- fixtures --------------------------------------------------------------
const baseManifest = () => ({
  ok: true,
  generated_at: "2026-08-29T08:00:00Z",
  include_on_demand: false,
  stories: [
    {
      id: "s2", slug: "b", title_ar: "ب", summary_ar: "س2",
      unlock_spec: { type: "always" }, cover_media_id: "m2",
      metadata: { a: 1 }, scene_count: 2, reaction_count: 9,
      updated_at: "2026-08-29T08:01:00Z", content_version: 1,
    },
    {
      id: "s1", slug: "a", title_ar: "أ", summary_ar: "س1",
      unlock_spec: { type: "always" }, cover_media_id: "m1",
      metadata: { a: 1 }, scene_count: 1, reaction_count: 3,
      updated_at: "2026-08-29T08:01:00Z", content_version: 1,
    },
  ],
  story_scenes: [
    { id: "sc2", story_id: "s1", scene_index: 1, payload: { text: "two" }, updated_at: "x" },
    { id: "sc1", story_id: "s1", scene_index: 0, payload: { text: "one" }, updated_at: "y" },
  ],
  story_media: [
    { id: "m1", story_id: "s1", checksum_sha256: "aaa", storage_path: "p1", updated_at: "z" },
    { id: "m2", story_id: "s2", checksum_sha256: "bbb", storage_path: "p2", updated_at: "z" },
  ],
  story_collections: [{ id: "c1", title_ar: "مجموعة", display_order: 1, updated_at: "z" }],
});

const fp = (m: unknown) => storyEditorialFingerprint(m);

const localSnap = (counts: Record<string, number>) => ({
  content_counts: counts,
  generated_at: "2026-08-29T07:00:00Z",
});
const NOW = Date.parse("2026-08-29T09:00:00Z");
const manifestRow = (collection: string, total_count: number, last_updated: string) => ({
  collection, total_count, last_updated,
});

beforeEach(() => {
  (globalThis as any).localStorage.clear();
});

// ===========================================================================
describe("canonical fingerprint", () => {
  it("15. is stable regardless of key order and row order", async () => {
    const a = baseManifest();
    const shuffled = {
      story_media: [...a.story_media].reverse(),
      story_collections: a.story_collections,
      generated_at: "2026-08-29T09:59:00Z",
      stories: [...a.stories].reverse().map((s) => {
        const entries = Object.entries(s).reverse();
        return Object.fromEntries(entries);
      }),
      ok: true,
      story_scenes: [...a.story_scenes].reverse(),
      include_on_demand: true,
    };
    expect(await fp(shuffled)).toBe(await fp(a));
    expect(await fp(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("2/16. player reaction fields cannot change the fingerprint", async () => {
    const a = baseManifest();
    const b = baseManifest();
    b.stories[0].reaction_count = 999;
    b.stories[1].reaction_count = 0;
    b.stories[0].updated_at = "2026-08-29T09:30:00Z";
    expect(await fp(b)).toBe(await fp(a));
    expect(EXCLUDED_ROW_FIELDS.has("reaction_count")).toBe(true);
    expect(EXCLUDED_ROW_FIELDS.has("updated_at")).toBe(true);
  });

  it("excludes the volatile envelope from the canonical payload", () => {
    const payload = canonicalStoryPayload(baseManifest());
    expect(payload).not.toContain("generated_at");
    expect(payload).not.toContain("reaction_count");
    expect(payload).not.toContain("include_on_demand");
  });

  it("4. title edit changes the fingerprint (no row-count change)", async () => {
    const b = baseManifest();
    b.stories[1].title_ar = "أ معدلة";
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });

  it("5. summary/metadata edit changes the fingerprint", async () => {
    const b = baseManifest();
    b.stories[0].summary_ar = "ملخص جديد";
    const c = baseManifest();
    c.stories[0].metadata = { a: 2 };
    const base = await fp(baseManifest());
    expect(await fp(b)).not.toBe(base);
    expect(await fp(c)).not.toBe(base);
  });

  it("6. unlock_spec edit changes the fingerprint", async () => {
    const b = baseManifest();
    b.stories[0].unlock_spec = { type: "story_completed", story_id: "s1" } as any;
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });

  it("7. cover_media_id change changes the fingerprint", async () => {
    const b = baseManifest();
    b.stories[0].cover_media_id = "m9";
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });

  it("8. scene edit changes the fingerprint", async () => {
    const b = baseManifest();
    b.story_scenes[0].payload = { text: "two-edited" };
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });

  it("9. media replacement (checksum change) changes the fingerprint", async () => {
    const b = baseManifest();
    b.story_media[0].checksum_sha256 = "ccc";
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });

  it("10/11. added and removed stories change the fingerprint", async () => {
    const base = await fp(baseManifest());
    const added = baseManifest();
    added.stories.push({ ...added.stories[0], id: "s3", slug: "c" } as any);
    const removed = baseManifest();
    removed.stories.splice(0, 1);
    expect(await fp(added)).not.toBe(base);
    expect(await fp(removed)).not.toBe(base);
  });

  it("collection edits change the fingerprint", async () => {
    const b = baseManifest();
    b.story_collections[0].title_ar = "مجموعة جديدة";
    expect(await fp(b)).not.toBe(await fp(baseManifest()));
  });
});

// ===========================================================================
describe("Stage 1 manifest diff", () => {
  const local = localSnap({ stories: 186, story_scenes: 900, story_media: 1100, story_collections: 6 });

  it("1. current canonical content → no update, no candidate", () => {
    const d = diffManifestDetailed(local, [
      manifestRow("stories", 186, "2026-08-29T06:00:00Z"),
      manifestRow("story_scenes", 900, "2026-08-29T06:00:00Z"),
    ], NOW);
    expect(d.updates).toEqual([]);
    expect(d.storiesCandidate).toBeNull();
  });

  it("2. a reaction bump is a candidate only — never a direct update", () => {
    const d = diffManifestDetailed(local, [
      manifestRow("stories", 186, "2026-08-29T08:01:45Z"),
    ], NOW);
    expect(d.updates).toEqual([]);
    expect(d.storiesCandidate).toBe("2026-08-29T08:01:45Z");
  });

  it("10/11. a stories count change is a direct update", () => {
    const d = diffManifestDetailed(local, [
      manifestRow("stories", 187, "2026-08-29T08:01:45Z"),
    ], NOW);
    expect(d.updates).toEqual(["stories"]);
  });

  it("8/9. editorial child timestamps raise the banner directly", () => {
    const d = diffManifestDetailed(local, [
      manifestRow("story_scenes", 900, "2026-08-29T08:30:00Z"),
      manifestRow("story_media", 1100, "2026-08-29T08:30:00Z"),
      manifestRow("story_collections", 6, "2026-08-29T08:30:00Z"),
    ], NOW);
    expect(d.updates.sort()).toEqual(["story_collections", "story_media", "story_scenes"]);
  });
});

// ===========================================================================
describe("Stage 2 throttle + benign memory", () => {
  it("3/C. the same benign timestamp never triggers a second check", () => {
    let id = emptyStoryIdentity();
    id = recordAppliedIdentity({
      fingerprint: "f1", counts: {}, editorial: {},
      observedStoriesUpdatedAt: "T1", nowMs: 0,
    });
    expect(isKnownBenign(id, "T1")).toBe(true);
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T1", nowMs: 10 ** 9, online: true })).toBe(false);
  });

  it("C. a new timestamp waits for the ~12 minute window", () => {
    const id = { ...emptyStoryIdentity(), fingerprint: "f1", last_verified_at: 1_000_000 };
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T2", nowMs: 1_000_000 + 60_000, online: true })).toBe(false);
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T2", nowMs: 1_000_000 + STAGE2_MIN_INTERVAL_MS, online: true })).toBe(true);
  });

  it("13. offline never runs Stage 2", () => {
    const id = emptyStoryIdentity();
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T2", nowMs: NOW, online: false })).toBe(false);
  });
});

// ===========================================================================
describe("Stage 2 verification", () => {
  it("2/3. identical fingerprint → unchanged and timestamp remembered as benign", async () => {
    writeStoryIdentity({ ...emptyStoryIdentity(), fingerprint: "abc" });
    const { result, identity } = await verifyStoryEditorialChange({
      candidateTimestamp: "T5",
      nowMs: NOW,
      fetchFingerprint: async () => "abc",
    });
    expect(result).toBe("unchanged");
    expect(identity.benign_stories_updated_at).toContain("T5");
    expect(shouldRunStage2({ identity: readStoryIdentity(), candidateTimestamp: "T5", nowMs: NOW + 10 ** 8, online: true })).toBe(false);
  });

  it("4–9. different fingerprint → changed", async () => {
    writeStoryIdentity({ ...emptyStoryIdentity(), fingerprint: "abc" });
    const { result } = await verifyStoryEditorialChange({
      candidateTimestamp: "T6",
      nowMs: NOW,
      fetchFingerprint: async () => "def",
    });
    expect(result).toBe("changed");
    expect(readStoryIdentity().benign_stories_updated_at).not.toContain("T6");
  });

  it("14. Stage 2 failure/timeout → unknown, no banner, throttle recorded", async () => {
    writeStoryIdentity({ ...emptyStoryIdentity(), fingerprint: "abc" });
    const { result, identity } = await verifyStoryEditorialChange({
      candidateTimestamp: "T7",
      nowMs: NOW,
      fetchFingerprint: async () => null,
    });
    expect(result).toBe("unknown");
    expect(identity.last_verified_at).toBe(NOW);
    expect(identity.fingerprint).toBe("abc");
  });

  it("first observation adopts the server fingerprint without a banner", async () => {
    const { result, identity } = await verifyStoryEditorialChange({
      candidateTimestamp: "T8",
      nowMs: NOW,
      fetchFingerprint: async () => "seed",
    });
    expect(result).toBe("unchanged");
    expect(identity.fingerprint).toBe("seed");
  });

  it("12/D. applied identity persists fingerprint, counts, timestamps and clears candidates", () => {
    const id = recordAppliedIdentity({
      fingerprint: "final",
      counts: { stories: 186, story_scenes: 900 },
      editorial: { stories: "T9", story_scenes: "T9" },
      observedStoriesUpdatedAt: "T9",
      nowMs: NOW,
    });
    expect(readStoryIdentity()).toEqual(id);
    expect(JSON.parse(localStorage.getItem(STORY_IDENTITY_KEY)!).fingerprint).toBe("final");
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T9", nowMs: NOW + 10 ** 9, online: true })).toBe(false);
    expect(shouldRunStage2({ identity: id, candidateTimestamp: "T10", nowMs: NOW + 10 ** 9, online: true })).toBe(true);
  });
});
