// ============================================================
// Era → ambience binding: full published-campaign audit
// ------------------------------------------------------------
// Walks EVERY published campaign in the bundled offline snapshot
// (the exact rows the app reads) and asserts the file that will
// actually play, through the ONE authority:
//     campaign.section_key ?? ERA_SECTION_MUSIC[canonical era]
// No array order, no index, no Arabic title, no neighbour fallback.
//
// Also asserts the eight ambience files are byte-distinct, so two
// eras can never share one recording.
// ============================================================
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { resolveAmbienceSection } from "@/lib/audio/campaignAmbienceResolver";
import { trackForSection, ERA_SECTION_MUSIC } from "@/lib/audio/eraMusicMap";
import { CAMPAIGN_SECTION_KEYS } from "@/lib/campaigns/sections";

const ROOT = process.cwd();

/** The official binding from the approved table (era key → file stem). */
const OFFICIAL: Record<string, string> = {
  prophetic: "prophetic",
  rashidun: "rashidun",
  umayyad: "umayyad",
  abbasid: "abbasid",
  andalus: "andalus",
  zengid: "crusades",
  ayyubid: "crusades",
  seljuk: "crusades",
  mongols: "mongols_mamluks",
  mamluk: "mongols_mamluks",
  ottoman: "ottoman",
};

interface Row {
  id: string;
  title: string;
  era: string;
  file: string | null;
}

function publishedCampaigns(): Row[] {
  const path = join(ROOT, "public/offline-snapshot.json");
  const snap = JSON.parse(readFileSync(path, "utf8"));
  const rows: any[] = snap.collections?.admin_campaigns ?? [];
  return rows
    .map((r) => ({ raw: r, d: (r.data ?? {}) as any }))
    .filter(({ raw, d }) => (d.status ?? raw.status) === "published")
    // section dividers are not campaigns: they carry a section_key and no era
    .filter(({ raw, d }) => !String(d.id ?? raw.id).startsWith("div_"))
    .map(({ raw, d }) => ({
      id: String(d.id ?? raw.id),
      title: String(d.title ?? raw.title ?? ""),
      era: String(d.era ?? ""),
      file: trackForSection(resolveAmbienceSection(d)),
    }));
}

describe("campaign ambience — every published campaign", () => {
  const campaigns = publishedCampaigns();

  it("audits a non-trivial catalogue", () => {
    expect(campaigns.length).toBeGreaterThanOrEqual(60);
  });

  it("every campaign carries an authored era key", () => {
    const missing = campaigns.filter((c) => !c.era);
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it("resolves to the officially bound file — no exceptions", () => {
    const anomalies = campaigns
      .map((c) => ({ ...c, expected: OFFICIAL[c.era] ? `/audio/sections/${OFFICIAL[c.era]}.mp3` : null }))
      .filter((c) => c.file !== c.expected)
      .map((c) => `${c.id} (${c.era}) → ${c.file} ≠ ${c.expected}`);
    expect(anomalies).toEqual([]);
  });

  it("prints the full binding table", () => {
    const lines = campaigns
      .slice()
      .sort((a, b) => (a.era + a.id).localeCompare(b.era + b.id))
      .map((c) => `${c.era.padEnd(10)} | ${c.file} | ${c.id}`);
    console.log(`\n${lines.join("\n")}\n(${lines.length} campaigns)`);
    expect(lines.length).toBe(campaigns.length);
  });

  for (const [era, section] of Object.entries(ERA_SECTION_MUSIC)) {
    it(`era "${era}" is bound exactly as approved`, () => {
      expect(section).toBe((OFFICIAL[era] ?? null) as never);
    });
  }
});

describe("ambience files", () => {
  const files = CAMPAIGN_SECTION_KEYS.map((k) => ({
    key: k,
    path: join(ROOT, "public/audio/sections", `${k}.mp3`),
  }));

  it("every section has a bundled file", () => {
    expect(files.filter((f) => !existsSync(f.path)).map((f) => f.key)).toEqual([]);
  });

  it("no two eras share the same recording", () => {
    const byHash = new Map<string, string[]>();
    for (const f of files) {
      if (!existsSync(f.path)) continue;
      const h = createHash("sha256").update(readFileSync(f.path)).digest("hex");
      byHash.set(h, [...(byHash.get(h) ?? []), f.key]);
    }
    const shared = [...byHash.values()].filter((v) => v.length > 1).map((v) => v.join(" == "));
    expect(shared).toEqual([]);
  });
});
