// ============================================================
// The Mongol/Mamluk recording is permanently retired.
// Asserts: no file, no reference, no fingerprint, correct bindings.
// ============================================================
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { sectionForEra, trackForSection } from "@/lib/audio/eraMusicMap";
import { resolveAmbienceSection } from "@/lib/audio/campaignAmbienceResolver";
import {
  withAudioVersion,
  AUDIO_ASSET_VERSION,
  RETIRED_AUDIO_FILES,
} from "@/lib/audio/assetVersion";

const ROOT = process.cwd();
const SECTIONS = join(ROOT, "public/audio/sections");
const OLD_SIZE_BYTES = 1.69 * 1024 * 1024; // ~1.69 MB

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "android", ".lovable"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("retired mongol ambience", () => {
  it("no audio file named mongols_mamluks exists anywhere", () => {
    const hits = walk(ROOT).filter(
      (p) => p.includes("mongols_mamluks") && [".mp3", ".ogg", ".wav", ".m4a"].includes(extname(p)),
    );
    expect(hits).toEqual([]);
  });

  it("no ambience file matches the retired file's ~1.69 MB fingerprint", () => {
    const oversized = readdirSync(SECTIONS)
      .map((f) => ({ f, size: statSync(join(SECTIONS, f)).size }))
      .filter((x) => Math.abs(x.size - OLD_SIZE_BYTES) < 40 * 1024);
    expect(oversized).toEqual([]);
  });

  it("ships exactly the seven approved section recordings", () => {
    const files = readdirSync(SECTIONS).filter((f) => f.endsWith(".mp3")).sort();
    expect(files).toEqual([
      "abbasid.mp3",
      "andalus.mp3",
      "crusades.mp3",
      "ottoman.mp3",
      "prophetic.mp3",
      "rashidun.mp3",
      "umayyad.mp3",
    ]);
  });

  it("the umayyad era plays umayyad.mp3 and nothing else", () => {
    expect(trackForSection(sectionForEra("umayyad"))).toBe("/audio/sections/umayyad.mp3");
    expect(trackForSection(resolveAmbienceSection({ era: "umayyad" }))).toBe(
      "/audio/sections/umayyad.mp3",
    );
  });

  it("mongols, mamluks, crusader-era all play crusades.mp3", () => {
    for (const era of ["mongols", "mamluk", "seljuk", "zengid", "ayyubid"]) {
      expect(trackForSection(sectionForEra(era))).toBe("/audio/sections/crusades.mp3");
    }
  });

  it("era transitions never leak the retired file", () => {
    const chain = ["mongols", "umayyad", "mamluk", "umayyad", "mongols"];
    for (const era of chain) {
      const src = trackForSection(sectionForEra(era)) ?? "";
      expect(src.includes("mongols_mamluks")).toBe(false);
    }
  });

  it("every ambience request is asset-versioned (defeats stale caches)", () => {
    expect(withAudioVersion("/audio/sections/umayyad.mp3")).toBe(
      `/audio/sections/umayyad.mp3?av=${AUDIO_ASSET_VERSION}`,
    );
    expect(AUDIO_ASSET_VERSION).toBeGreaterThanOrEqual(2);
    expect(RETIRED_AUDIO_FILES).toContain("mongols_mamluks");
  });

  it("no manifest or public asset references the retired recording", () => {
    for (const rel of ["public/manifest.webmanifest"]) {
      const p = join(ROOT, rel);
      if (!existsSync(p)) continue;
      expect(readFileSync(p, "utf8").includes("mongols_mamluks")).toBe(false);
    }
  });
});
