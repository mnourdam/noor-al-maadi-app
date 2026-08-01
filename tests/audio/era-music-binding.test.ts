import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { APPROVED_ERA_SLUGS } from "@/lib/taxonomy-labels";
import {
  ERA_SECTION_MUSIC,
  sectionForEra,
  trackForSection,
  auditEraMusicIntegrity,
} from "@/lib/audio/eraMusicMap";
import { resolveAmbienceSection } from "@/lib/audio/campaignAmbienceResolver";

describe("era → music binding", () => {
  it("binds every approved era explicitly (no missing entries)", () => {
    for (const era of APPROVED_ERA_SLUGS) {
      expect(Object.prototype.hasOwnProperty.call(ERA_SECTION_MUSIC, era)).toBe(true);
    }
  });

  it("maps each era to its own dedicated file", () => {
    expect(trackForSection(sectionForEra("prophetic"))).toBe("/audio/sections/prophetic.mp3");
    expect(trackForSection(sectionForEra("rashidun"))).toBe("/audio/sections/rashidun.mp3");
    expect(trackForSection(sectionForEra("umayyad"))).toBe("/audio/sections/umayyad.mp3");
    expect(trackForSection(sectionForEra("abbasid"))).toBe("/audio/sections/abbasid.mp3");
    expect(trackForSection(sectionForEra("andalus"))).toBe("/audio/sections/andalus.mp3");
    expect(trackForSection(sectionForEra("zengid"))).toBe("/audio/sections/crusades.mp3");
    expect(trackForSection(sectionForEra("ayyubid"))).toBe("/audio/sections/crusades.mp3");
    expect(trackForSection(sectionForEra("mongols"))).toBe("/audio/sections/mongols_mamluks.mp3");
    expect(trackForSection(sectionForEra("mamluk"))).toBe("/audio/sections/mongols_mamluks.mp3");
    expect(trackForSection(sectionForEra("ottoman"))).toBe("/audio/sections/ottoman.mp3");
  });

  it("never borrows another era's track when none is authored", () => {
    for (const era of ["fatimid", "seljuk", "timurid", "safavid", "made-up-era"]) {
      expect(sectionForEra(era)).toBeNull();
    }
  });

  it("resolves ambience from the campaign's own era, not its neighbours", () => {
    expect(resolveAmbienceSection({ era: "prophetic" })).toBe("prophetic");
    expect(resolveAmbienceSection({ era: "mongols" })).toBe("mongols_mamluks");
    // authored override wins, arabic titles never do
    expect(resolveAmbienceSection({ era: "mongols", section_key: "prophetic" })).toBe("prophetic");
    expect(resolveAmbienceSection({ era: "prophetic", section_key: "غير" })).toBe("prophetic");
    expect(resolveAmbienceSection(null)).toBeNull();
    expect(resolveAmbienceSection({})).toBeNull();
  });

  it("integrity audit reports no unknown key / unused / duplicate track", () => {
    const issues = auditEraMusicIntegrity([
      "prophetic", "rashidun", "umayyad", "abbasid", "andalus",
      "zengid", "ayyubid", "mamluk", "mongols", "ottoman",
    ]);
    expect(issues.filter((i) => i.code === "unknown_era_key")).toEqual([]);
    expect(issues.filter((i) => i.code === "unused_track")).toEqual([]);
    expect(issues.filter((i) => i.code === "duplicate_track")).toEqual([]);
    // only the four eras with no authored track
    expect(issues.filter((i) => i.code === "era_without_track").map((i) => i.detail).sort())
      .toEqual(["fatimid", "safavid", "seljuk", "timurid"]);
  });
});

describe("era transitions swap the track immediately", () => {
  let audioManager: typeof import("@/lib/audioManager").audioManager;
  const created: any[] = [];

  beforeEach(async () => {
    created.length = 0;
    (globalThis as any).window = globalThis;
    (globalThis as any).performance ??= { now: () => Date.now() };
    (globalThis as any).Audio = class {
      loop = false; preload = ""; volume = 0; paused = true; readyState = 0;
      constructor(public src: string) { created.push(this); }
      addEventListener() {}
      removeAttribute() { this.src = ""; }
      load() {}
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    };
    (globalThis as any).window.setInterval = setInterval;
    (globalThis as any).window.clearInterval = clearInterval;
    (globalThis as any).window.addEventListener = () => {};
    (globalThis as any).window.removeEventListener = () => {};
    audioManager = (await import("@/lib/audioManager")).audioManager;
    audioManager.dispose();
    audioManager.setAmbienceLayer("campaign");
  });

  afterEach(() => audioManager.dispose());

  const enterEra = (era: string) => {
    audioManager.setCampaignTheme(resolveAmbienceSection({ era }));
    return audioManager.getDebugSnapshot().campaignSrc;
  };

  it("walks the full era chain with the correct file each time", () => {
    expect(enterEra("prophetic")).toBe("/audio/sections/prophetic.mp3");
    expect(enterEra("rashidun")).toBe("/audio/sections/rashidun.mp3");
    expect(enterEra("umayyad")).toBe("/audio/sections/umayyad.mp3");
    expect(enterEra("abbasid")).toBe("/audio/sections/abbasid.mp3");
    expect(enterEra("mongols")).toBe("/audio/sections/mongols_mamluks.mp3");
    expect(enterEra("ottoman")).toBe("/audio/sections/ottoman.mp3");
    // back to the prophetic era — must NOT inherit the previous track
    expect(enterEra("prophetic")).toBe("/audio/sections/prophetic.mp3");
  });

  it("stops and releases the previous era's element on every switch", () => {
    enterEra("mongols");
    const mongolEl = created[created.length - 1];
    enterEra("prophetic");
    expect(mongolEl.paused).toBe(true);
    expect(mongolEl.src).toBe("");
    expect(audioManager.getCampaignTheme()).toBe("prophetic");
  });

  it("falls back to the generic ambience, never to a neighbouring era", () => {
    enterEra("mongols");
    expect(enterEra("fatimid")).toBe("/audio/campaign-ambient.mp3");
    expect(audioManager.getCampaignTheme()).toBeNull();
  });
});

// ------------------------------------------------------------
// Integrity over the real authored content pack
// ------------------------------------------------------------
describe("authored campaign content ↔ era music integrity", () => {
  it("every published campaign resolves to a known era with a track", async () => {
    const fs = await import("node:fs");
    const snap = JSON.parse(fs.readFileSync("public/offline-snapshot.json", "utf8"));
    const rows: any[] = snap.collections.admin_campaigns ?? [];
    const campaigns = rows.filter((r) => !String(r.id).startsWith("div_"));
    const unknown: string[] = [];
    const noTrack: string[] = [];
    for (const r of campaigns) {
      const data = r.data ?? {};
      const section = resolveAmbienceSection(data);
      if (!data.era) { unknown.push(`${r.id}: missing era`); continue; }
      if (!sectionForEra(data.era) && !data.section_key) unknown.push(`${r.id}: era=${data.era}`);
      if (!section) noTrack.push(`${r.id}: era=${data.era}`);
    }
    expect(unknown).toEqual([]);
    expect(noTrack).toEqual([]);
  });
});
