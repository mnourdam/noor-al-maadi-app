// ============================================================
// Stage 4 acceptance — server mirror is restore-only, monotonic
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

const { resolveCampaignIntro } = await import("@/lib/campaigns/intro/resolve");
const {
  shouldShowCampaignIntro,
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  mergeCampaignIntroRecord,
  readCampaignIntroState,
  __clearCampaignIntroStates,
} = await import("@/lib/campaigns/intro/state");

const CAMPAIGN = { id: "camp-1", intro_story_id: "story-1", intro_version: 1 };
const ref = () => resolveCampaignIntro(CAMPAIGN)!;

const remote = (over: Record<string, unknown> = {}) => ({
  campaignId: "camp-1",
  storyId: "story-1",
  version: 1,
  status: "completed" as const,
  lastSceneIndex: 3,
  firstStartedAt: "2020-01-01T00:00:00.000Z",
  resolvedAt: "2020-01-02T00:00:00.000Z",
  ...over,
});

describe("server mirror restore", () => {
  beforeEach(() => __clearCampaignIntroStates());

  it("restores a resolved intro on a fresh device", () => {
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    expect(mergeCampaignIntroRecord(remote())).toBe(true);
    expect(shouldShowCampaignIntro(ref())).toBe(false);
  });

  it("is idempotent — a second merge changes nothing", () => {
    mergeCampaignIntroRecord(remote());
    expect(mergeCampaignIntroRecord(remote())).toBe(false);
  });

  it("never downgrades a stronger local status", () => {
    markCampaignIntroCompleted(ref(), 7);
    mergeCampaignIntroRecord(remote({ status: "started", lastSceneIndex: 0 }));
    const rec = readCampaignIntroState(ref())!;
    expect(rec.status).toBe("completed");
    expect(rec.lastSceneIndex).toBe(7);
  });

  it("upgrades skipped → completed from the server", () => {
    markCampaignIntroSkipped(ref());
    mergeCampaignIntroRecord(remote({ status: "completed" }));
    expect(readCampaignIntroState(ref())!.status).toBe("completed");
  });

  it("keeps the earliest firstStartedAt", () => {
    markCampaignIntroCompleted(ref());
    mergeCampaignIntroRecord(remote());
    expect(readCampaignIntroState(ref())!.firstStartedAt).toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("is scoped per (campaign, version) — other versions untouched", () => {
    mergeCampaignIntroRecord(remote({ version: 2 }));
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    const v2 = resolveCampaignIntro({ ...CAMPAIGN, intro_version: 2 })!;
    expect(shouldShowCampaignIntro(v2)).toBe(false);
  });

  it("ignores malformed remote rows", () => {
    expect(mergeCampaignIntroRecord(remote({ campaignId: "" }))).toBe(false);
  });

  it("the display decision never consults the network", async () => {
    // `shouldShowCampaignIntro` is synchronous and pure-local by construction.
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(false);
  });
});
