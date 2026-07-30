import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CAMPAIGN_SECTION_KEYS,
  asCampaignSectionKey,
} from "@/lib/campaigns/sections";
import { CAMPAIGN_THEME_SOURCES, campaignThemeSources } from "@/lib/audio/campaignThemes";

// ------------------------------------------------------------
// Stage 1 acceptance: section key set + theme source map +
// audioManager.setCampaignTheme lifecycle (no-op / swap / revert).
// ------------------------------------------------------------

describe("campaign section keys", () => {
  it("is the closed eight-key set", () => {
    expect(CAMPAIGN_SECTION_KEYS.length).toBe(8);
    expect(new Set(CAMPAIGN_SECTION_KEYS).size).toBe(8);
  });

  it("never guesses: unknown values resolve to null", () => {
    expect(asCampaignSectionKey("abbasid")).toBe("abbasid");
    expect(asCampaignSectionKey("Abbasid")).toBeNull();
    expect(asCampaignSectionKey("zangid")).toBeNull();
    expect(asCampaignSectionKey(undefined)).toBeNull();
    expect(asCampaignSectionKey(null)).toBeNull();
    expect(asCampaignSectionKey(3)).toBeNull();
  });
});

describe("campaign theme sources", () => {
  it("maps every section to a bundled local-first source", () => {
    for (const key of CAMPAIGN_SECTION_KEYS) {
      const sources = CAMPAIGN_THEME_SOURCES[key];
      expect(sources[0]).toBe(`/audio/sections/${key}.mp3`);
    }
  });

  it("returns null for no theme", () => {
    expect(campaignThemeSources(null)).toBeNull();
  });
});

describe("audioManager.setCampaignTheme", () => {
  let audioManager: typeof import("@/lib/audioManager").audioManager;

  beforeEach(async () => {
    // Minimal DOM/window surface: the manager must stay inert-safe.
    (globalThis as any).window = globalThis;
    (globalThis as any).performance ??= { now: () => Date.now() };
    (globalThis as any).Audio = class {
      loop = false; preload = ""; volume = 0; paused = true; readyState = 0;
      constructor(public src: string) {}
      addEventListener() {}
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    };
    (globalThis as any).window.setInterval = setInterval;
    (globalThis as any).window.clearInterval = clearInterval;
    (globalThis as any).window.addEventListener = () => {};
    (globalThis as any).window.removeEventListener = () => {};
    audioManager = (await import("@/lib/audioManager")).audioManager;
    audioManager.dispose();
  });

  afterEach(() => {
    audioManager.dispose();
  });

  it("starts with no theme (current behaviour)", () => {
    expect(audioManager.getCampaignTheme()).toBeNull();
    expect(audioManager.getDebugSnapshot().campaignSrc).toBe("/audio/campaign-ambient.mp3");
  });

  it("swaps the source when the section changes", () => {
    audioManager.setCampaignTheme("abbasid");
    expect(audioManager.getCampaignTheme()).toBe("abbasid");
    expect(audioManager.getDebugSnapshot().campaignSrc).toBe("/audio/sections/abbasid.mp3");

    audioManager.setCampaignTheme("andalus");
    expect(audioManager.getDebugSnapshot().campaignSrc).toBe("/audio/sections/andalus.mp3");
  });

  it("is an exact no-op when the same section is re-applied", () => {
    audioManager.setCampaignTheme("ottoman");
    const before = audioManager.getDebugSnapshot();
    audioManager.setCampaignTheme("ottoman");
    audioManager.setCampaignTheme("ottoman");
    const after = audioManager.getDebugSnapshot();
    expect(after.campaignSrc).toBe(before.campaignSrc);
    expect(after.campaignTheme).toBe("ottoman");
  });

  it("reverts to the default campaign ambience on null", () => {
    audioManager.setCampaignTheme("crusades");
    audioManager.setCampaignTheme(null);
    expect(audioManager.getCampaignTheme()).toBeNull();
    expect(audioManager.getDebugSnapshot().campaignSrc).toBe("/audio/campaign-ambient.mp3");
  });
});
