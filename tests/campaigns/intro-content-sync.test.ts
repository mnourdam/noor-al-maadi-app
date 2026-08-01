import { describe, expect, it, beforeEach } from "vitest";
import { planIntroSync } from "@/lib/campaigns/intro/content-sync";

describe("planIntroSync", () => {
  it("downloads intros that are missing locally", () => {
    const plan = planIntroSync(
      [{ storyId: "story_intro_new", contentVersion: 1, updatedAt: null }],
      [],
    );
    expect(plan.fetchIds).toEqual(["story_intro_new"]);
    expect(plan.removeIds).toEqual([]);
  });

  it("downloads only newer versions, never identical content", () => {
    const catalog = [
      { storyId: "a", contentVersion: 2, updatedAt: null },
      { storyId: "b", contentVersion: 1, updatedAt: null },
    ];
    const plan = planIntroSync(catalog, [
      { storyId: "a", contentVersion: 1 },
      { storyId: "b", contentVersion: 1 },
    ]);
    expect(plan.fetchIds).toEqual(["a"]);
  });

  it("reconciles intros the server no longer publishes", () => {
    const plan = planIntroSync([{ storyId: "a", contentVersion: 1, updatedAt: null }], [
      { storyId: "a", contentVersion: 1 },
      { storyId: "gone", contentVersion: 3 },
    ]);
    expect(plan.fetchIds).toEqual([]);
    expect(plan.removeIds).toEqual(["gone"]);
  });
});

describe("resolveCampaignIntro with synced links", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
  });


  it("prefers the authored link on the campaign row", async () => {
    localStorage.setItem(
      "irth.introSync.links.v1",
      JSON.stringify([{ campaignId: "c1", slug: "c1", storyId: "story_synced", version: 3 }]),
    );
    const { resolveCampaignIntro } = await import("@/lib/campaigns/intro/resolve");
    const ref = resolveCampaignIntro({ id: "c1", intro_story_id: "story_authored" });
    expect(ref?.storyId).toBe("story_authored");
  });

  it("falls back to a synced link for a campaign row that predates the intro", async () => {
    localStorage.setItem(
      "irth.introSync.links.v1",
      JSON.stringify([{ campaignId: "c2", slug: "c2-slug", storyId: "story_late", version: 2 }]),
    );
    const store = await import("@/lib/campaigns/intro/content-store");
    // Force a re-hydration of the synchronous mirror for this test run.
    store.writeSyncedIntroLinks([
      { campaignId: "c2", slug: "c2-slug", storyId: "story_late", version: 2 },
    ]);
    const { resolveCampaignIntro } = await import("@/lib/campaigns/intro/resolve");
    const ref = resolveCampaignIntro({ id: "c2", slug: "c2-slug" });
    expect(ref).toEqual({ campaignId: "c2", storyId: "story_late", version: 2 });
  });

  it("returns null when neither the row nor the sync knows an intro", async () => {
    const store = await import("@/lib/campaigns/intro/content-store");
    store.writeSyncedIntroLinks([]);
    const { resolveCampaignIntro } = await import("@/lib/campaigns/intro/resolve");
    expect(resolveCampaignIntro({ id: "c3" })).toBeNull();
  });
});
