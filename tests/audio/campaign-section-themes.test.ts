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

// ------------------------------------------------------------
// Stage 2 acceptance: explicit section resolution + rapid-switch safety
// ------------------------------------------------------------

describe("resolveCampaignSection", () => {
  it("prefers the campaign override over the divider", async () => {
    const { resolveCampaignSection } = await import("@/lib/campaigns/sections");
    expect(resolveCampaignSection({ section_key: "andalus" }, { sectionKey: "abbasid" })).toBe("andalus");
  });

  it("falls back to the divider key", async () => {
    const { resolveCampaignSection } = await import("@/lib/campaigns/sections");
    expect(resolveCampaignSection({}, { sectionKey: "ottoman" })).toBe("ottoman");
  });

  it("never infers from worldSlug / era / title", async () => {
    const { resolveCampaignSection } = await import("@/lib/campaigns/sections");
    expect(
      resolveCampaignSection({ worldSlug: "ottoman", era: "ottoman", title: "الدولة العثمانية" } as never, null),
    ).toBeNull();
    expect(resolveCampaignSection({ section_key: "Ottoman" }, null)).toBeNull();
  });
});

describe("sectionKeysFromFeed", () => {
  it("assigns each campaign the key of the divider that opens its section", async () => {
    const { sectionKeysFromFeed } = await import("@/lib/campaignDividers");
    const feed = [
      { type: "campaign", campaign: { id: "c0" } },
      { type: "divider", divider: { type: "divider", id: "d1", title: "أ", sectionKey: "abbasid", order: 1 } },
      { type: "campaign", campaign: { id: "c1" } },
      { type: "campaign", campaign: { id: "c2", section_key: "andalus" } },
      { type: "divider", divider: { type: "divider", id: "d2", title: "ب", sectionKey: null, order: 2 } },
      { type: "campaign", campaign: { id: "c3" } },
    ] as never;
    const map = sectionKeysFromFeed(feed);
    expect(map.get("c0")).toBeNull();
    expect(map.get("c1")).toBe("abbasid");
    expect(map.get("c2")).toBe("andalus");
    expect(map.get("c3")).toBeNull();
  });
});

describe("rapid section switching", () => {
  let audioManager: typeof import("@/lib/audioManager").audioManager;
  let intervals: number;

  beforeEach(async () => {
    intervals = 0;
    (globalThis as any).window = globalThis;
    (globalThis as any).performance ??= { now: () => Date.now() };
    (globalThis as any).Audio = class {
      loop = false; preload = ""; volume = 0; paused = true; readyState = 0;
      constructor(public src: string) {}
      addEventListener() {}
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    };
    (globalThis as any).window.setInterval = (...a: any[]) => { intervals++; return (setInterval as any)(...a); };
    (globalThis as any).window.clearInterval = (id: any) => { intervals--; clearInterval(id); };
    (globalThis as any).window.addEventListener = () => {};
    (globalThis as any).window.removeEventListener = () => {};
    audioManager = (await import("@/lib/audioManager")).audioManager;
    audioManager.dispose();
  });

  afterEach(() => audioManager.dispose());

  it("never accumulates crossfade timers when switching fast", () => {
    audioManager.setAmbienceLayer("campaign");
    for (const k of ["abbasid", "andalus", "ottoman", "crusades", "prophetic"] as const) {
      audioManager.setCampaignTheme(k);
    }
    audioManager.setCampaignTheme(null);
    expect(intervals).toBeLessThanOrEqual(1);
    expect(audioManager.getDebugSnapshot().campaignSrc).toBe("/audio/campaign-ambient.mp3");
  });
});
