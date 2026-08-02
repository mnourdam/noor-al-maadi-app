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
import { join, basename } from "node:path";
import { resolveAmbienceSection } from "@/lib/audio/campaignAmbienceResolver";
import { trackForSection, ERA_SECTION_MUSIC } from "@/lib/audio/eraMusicMap";
import { CAMPAIGN_SECTION_KEYS } from "@/lib/campaigns/sections";
import { SECTION_THEME_FILE } from "@/lib/audio/campaignThemes";

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
  // Approved v1: Mongols + Mamluks share the crusader ambience.
  mongols: "crusades",
  mamluk: "crusades",
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
    path: join(ROOT, "public/audio/sections", `${SECTION_THEME_FILE[k]}.mp3`),
  }));

  it("every section has a bundled file", () => {
    expect(files.filter((f) => !existsSync(f.path)).map((f) => f.key)).toEqual([]);
  });

  // Approved decision: the Rashidun and Andalus eras intentionally share one
  // approved recording. Any OTHER byte-identical pair is still a bug.
  const APPROVED_SHARED_RECORDINGS: readonly string[][] = [["rashidun", "andalus"]];

  it("no two distinct recordings collide", () => {
    const byHash = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const f of files) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      if (!existsSync(f.path)) continue;
      const h = createHash("sha256").update(readFileSync(f.path)).digest("hex");
      byHash.set(h, [...(byHash.get(h) ?? []), basename(f.path, ".mp3")]);
    }
    const isApproved = (group: string[]) =>
      APPROVED_SHARED_RECORDINGS.some(
        (allowed) =>
          group.length === allowed.length && group.every((n) => allowed.includes(n)),
      );
    const collisions = [...byHash.values()]
      .filter((v) => v.length > 1 && !isApproved(v))
      .map((v) => v.join(" == "));
    expect(collisions).toEqual([]);
  });


  it("ships exactly the seven approved recordings", () => {
    const distinct = new Set(files.map((f) => f.path));
    expect(distinct.size).toBe(7);
  });
});
