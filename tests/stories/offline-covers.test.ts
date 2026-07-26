// ============================================================
// Guard: Story covers are an OFFLINE APPLICATION ASSET.
// ------------------------------------------------------------
// Same contract as Premium Emblems and Campaign Key Art:
//   • every id in the generated pack has a real bundled file
//   • the manifest and the generated module never drift
//   • every bundled cover stays inside the 20KB card budget
//   • story cards resolve through the local-first resolver only
// ============================================================

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync, statSync } from "node:fs";

const MANIFEST = "public/story-covers/manifest.json";
const GENERATED = "src/lib/stories/covers/offline-pack.generated.ts";
const MAX_BYTES = 20 * 1024;

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  assets: Record<string, { file: string; bytes: number }>;
};
const generated = readFileSync(GENERATED, "utf8");

describe("offline story cover pack", () => {
  it("ships a real file for every manifest entry, within budget", () => {
    for (const [id, asset] of Object.entries(manifest.assets)) {
      const path = `public/story-covers/${asset.file}`;
      expect(existsSync(path), `${id}: missing bundled cover`).toBe(true);
      expect(statSync(path).size).toBe(asset.bytes);
      expect(asset.bytes, `${id}: cover over the 20KB card budget`).toBeLessThanOrEqual(MAX_BYTES);
    }
  });

  it("keeps the generated id list in sync with the manifest", () => {
    for (const id of Object.keys(manifest.assets)) {
      expect(generated.includes(JSON.stringify(id)), `${id}: missing from generated pack`).toBe(true);
    }
  });
});

describe("story card cover resolution", () => {
  const card = readFileSync("src/components/stories/StoryCard.tsx", "utf8");

  it("uses the local-first resolver, never a raw media URL hook", () => {
    expect(card).toContain("useStoryCoverSrc");
    expect(card).not.toContain("useStoryMediaUrl");
  });

  it("never uses <picture>/<source> (WebView format-preference trap)", () => {
    expect(card).not.toContain("<picture");
    expect(card).not.toContain("<source");
  });
});
