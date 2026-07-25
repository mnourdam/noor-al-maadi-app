// Guard test for "Premium Emblems Local-First Resolution v2" (frozen).
// Locks the candidate order and forbids reintroducing <picture> / any
// format preference that can bypass the bundled local WebP asset.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EMBLEM_REGISTRY, getEmblemRecord } from "@/lib/emblems/registry";
import { emblemSourceCandidates } from "@/lib/emblems/asset-manifest";
import { DEFAULT_PREMIUM_EMBLEM_ID } from "@/lib/emblems/resolver";

const ROOT = process.cwd();

describe("emblem local-first resolution v2", () => {
  it("every registry emblem starts from a bundled local WebP", () => {
    const offenders = EMBLEM_REGISTRY.filter((record) => {
      const first = emblemSourceCandidates(record, 512)[0];
      return !first || !first.startsWith("/emblems/") || !first.endsWith(".webp");
    }).map((r) => r.id);
    expect(offenders).toEqual([]);
  });

  it("candidate order is local → CDN WebP → CDN AVIF → legacy", () => {
    const record = getEmblemRecord(DEFAULT_PREMIUM_EMBLEM_ID)!;
    const urls = emblemSourceCandidates(record, 512);
    const localIdx = urls.findIndex((u) => u.startsWith("/emblems/"));
    const webpIdx = urls.findIndex((u) => !u.startsWith("/emblems/") && u.endsWith(".webp"));
    const avifIdx = urls.findIndex((u) => u.endsWith(".avif"));
    expect(localIdx).toBe(0);
    if (webpIdx >= 0 && avifIdx >= 0) expect(webpIdx).toBeLessThan(avifIdx);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("the bundled pack backs every first candidate on disk", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public/emblems/manifest.json"), "utf8"),
    ) as { assets: Array<{ file: string }> };
    const files = new Set(manifest.assets.map((a) => a.file));
    const missing = EMBLEM_REGISTRY.map((record) => emblemSourceCandidates(record, 512)[0])
      .map((url) => url.replace("/emblems/", ""))
      .filter((file) => !files.has(file));
    expect(missing).toEqual([]);
  });

  it("no surface renders emblems through <picture> or a <source> format preference", () => {
    const art = fs.readFileSync(path.join(ROOT, "src/components/EmblemArt.tsx"), "utf8");
    expect(art).not.toMatch(/<picture/);
    expect(art).not.toMatch(/<source/);
  });
});
