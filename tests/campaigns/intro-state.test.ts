// ============================================================
// Stage 3 acceptance — campaign intro resolution + show-once state
// ============================================================
import { describe, it, expect, beforeEach } from "bun:test";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const store = new MemoryStorage();
(globalThis as any).window = { localStorage: store };

const { resolveCampaignIntro, normalizeIntroVersion } = await import(
  "@/lib/campaigns/intro/resolve"
);
const {
  shouldShowCampaignIntro,
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  markCampaignIntroStarted,
  recordCampaignIntroScene,
  readCampaignIntroState,
  resetCampaignIntro,
  __clearCampaignIntroStates,
} = await import("@/lib/campaigns/intro/state");

const CAMPAIGN = { id: "camp-1", intro_story_id: "story-1", intro_version: 1 };
const ref = () => resolveCampaignIntro(CAMPAIGN)!;

describe("campaign intro resolution", () => {
  it("returns null when no intro is authored", () => {
    expect(resolveCampaignIntro({ id: "c" })).toBeNull();
    expect(resolveCampaignIntro({ id: "c", intro_story_id: "  " })).toBeNull();
    expect(resolveCampaignIntro(null)).toBeNull();
  });

  it("never infers a version — defaults to 1", () => {
    expect(normalizeIntroVersion(undefined)).toBe(1);
    expect(normalizeIntroVersion(0)).toBe(1);
    expect(normalizeIntroVersion(-4)).toBe(1);
    expect(normalizeIntroVersion("3")).toBe(3);
    expect(normalizeIntroVersion(2.9)).toBe(2);
  });

  it("reads only authored fields", () => {
    const r = resolveCampaignIntro({
      id: "c",
      intro_story_id: "s",
      intro_version: 4,
    })!;
    expect(r).toEqual({ campaignId: "c", storyId: "s", version: 4 });
  });
});

describe("show-once contract", () => {
  beforeEach(() => __clearCampaignIntroStates());

  it("shows on first visit only", () => {
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(false);
  });

  it("stays hidden after a skip (reload / back from chapter)", () => {
    markCampaignIntroSkipped(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(false);
    expect(shouldShowCampaignIntro(ref())).toBe(false);
  });

  it("a bare 'started' record still shows (interrupted intro)", () => {
    markCampaignIntroStarted(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(true);
  });

  it("never downgrades a resolved status", () => {
    markCampaignIntroCompleted(ref(), 5);
    markCampaignIntroStarted(ref());
    recordCampaignIntroScene(ref(), 1);
    const rec = readCampaignIntroState(ref())!;
    expect(rec.status).toBe("completed");
    expect(rec.lastSceneIndex).toBe(5);
  });

  it("raising intro_version re-shows exactly once", () => {
    markCampaignIntroCompleted(ref());
    const v2 = resolveCampaignIntro({ ...CAMPAIGN, intro_version: 2 })!;
    expect(shouldShowCampaignIntro(v2)).toBe(true);
    markCampaignIntroCompleted(v2);
    expect(shouldShowCampaignIntro(v2)).toBe(false);
    // old record preserved (history is never deleted)
    expect(readCampaignIntroState(ref())?.status).toBe("completed");
  });

  it("changing intro_story_id without a version bump does NOT re-show", () => {
    markCampaignIntroCompleted(ref());
    const swapped = resolveCampaignIntro({ ...CAMPAIGN, intro_story_id: "story-2" })!;
    expect(shouldShowCampaignIntro(swapped)).toBe(false);
  });

  it("explicit replay is the only way back", () => {
    markCampaignIntroCompleted(ref());
    resetCampaignIntro(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(true);
  });

  it("no intro ⇒ never shows", () => {
    expect(shouldShowCampaignIntro(null)).toBe(false);
  });
});
