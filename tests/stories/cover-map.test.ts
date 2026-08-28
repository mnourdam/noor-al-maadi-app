// ============================================================
// V16 — Story cover map parity + local-first cover resolution
// ------------------------------------------------------------
// • every authored cover_media_id has a physically packaged asset
// • 114/114 authored library covers resolve locally, offline
// • the 2 stories without an authored cover expose no cover path
// • packaged covers never trigger an RPC / signed URL
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

import { STORY_COVER_MEDIA_MAP, STORIES_WITHOUT_COVER } from "@/lib/stories/covers/cover-map.generated";
import {
  hasOfflineStoryCover,
  localStoryCoverPath,
  packagedCoverMediaId,
  storyHasNoAuthoredCover,
} from "@/lib/stories/covers/offline-pack";
import { bundledCoverIsCurrent } from "@/lib/stories/covers/resolve";

const baseline = JSON.parse(readFileSync("public/baseline-content.json", "utf8")) as {
  collections: { stories: any[] };
};

const isIntro = (s: any) => s?.metadata?.kind === "campaign_intro";
const library = baseline.collections.stories.filter((s) => !isIntro(s));

describe("story cover map — generator parity", () => {
  it("packages a physical asset for every authored cover_media_id", () => {
    for (const s of baseline.collections.stories) {
      if (!s.cover_media_id) continue;
      expect(existsSync(`public/story-media/${s.cover_media_id}.webp`), `${s.id}: cover asset missing`).toBe(true);
      expect(STORY_COVER_MEDIA_MAP[s.id], `${s.id}: not in the generated cover map`).toBe(s.cover_media_id);
    }
  });

  it("covers all 116 published Library Stories: 114 packaged, 2 placeholders", () => {
    expect(library.length).toBe(116);
    const withCover = library.filter((s) => !!STORY_COVER_MEDIA_MAP[s.id]);
    const without = library.filter((s) => !s.cover_media_id);
    expect(withCover.length).toBe(114);
    expect(without.length).toBe(2);
    for (const s of without) expect(STORIES_WITHOUT_COVER).toContain(s.id);
  });
});

describe("story cover resolution — local first, zero network", () => {
  it("resolves every packaged library cover to a local /story-media path", () => {
    let resolved = 0;
    for (const s of library) {
      if (!s.cover_media_id) continue;
      expect(hasOfflineStoryCover(s.id)).toBe(true);
      expect(packagedCoverMediaId(s.id)).toBe(s.cover_media_id);
      expect(localStoryCoverPath(s.id)).toBe(`/story-media/${s.cover_media_id}.webp`);
      // The resolver short-circuits before any RPC when this is true.
      expect(bundledCoverIsCurrent({ id: s.id, cover_media_id: s.cover_media_id, content_version: s.content_version })).toBe(true);
      resolved += 1;
    }
    expect(resolved).toBe(114);
  });

  it("returns no local cover for the 2 stories without an authored cover", () => {
    for (const s of library.filter((x) => !x.cover_media_id)) {
      expect(storyHasNoAuthoredCover(s.id)).toBe(true);
      expect(packagedCoverMediaId(s.id)).toBeNull();
      expect(localStoryCoverPath(s.id)).toBeNull();
    }
  });
});
