// Encyclopedia reference resolution tests — module-level unit tests
// that stub the local-first store so we can exercise dedup + hidden
// unresolved behaviour without loading the offline snapshot.
import { describe, it, expect, mock, beforeAll } from "bun:test";

// Fake entity store — canonical `muhammad` figure + a redirect alias.
const ENTITIES: Record<string, any> = {
  "u-muhammad": { id: "u-muhammad", slug: "muhammad", entity_type: "figure", title: "محمد ﷺ" },
  "u-yarmouk": { id: "u-yarmouk", slug: "yarmouk", entity_type: "battle", title: "معركة اليرموك" },
};
const BY_SLUG: Record<string, any> = {
  muhammad: ENTITIES["u-muhammad"],
  "figure:muhammad": ENTITIES["u-muhammad"],
  yarmouk: ENTITIES["u-yarmouk"],
};

beforeAll(() => {
  mock.module("@/lib/local-first-store", () => ({
    localEncyclopediaById: (id: string) => ENTITIES[id] ?? null,
    localEncyclopediaBySlug: (slug: string, type?: string) =>
      BY_SLUG[type ? `${type}:${slug}` : slug] ?? BY_SLUG[slug] ?? null,
  }));
  mock.module("@/lib/encyclopedia-canonical", () => ({
    resolveCanonicalLocal: (e: any) => e,
  }));
  mock.module("@/lib/encyclopedia-source", () => ({
    normalizeEntitySlug: (s: string) => String(s ?? "").toLowerCase().trim(),
  }));
});

describe("encyclopedia-refs", () => {
  it("resolves + dedupes canonical refs across multiple aliases", async () => {
    const { resolveRelatedRefs } = await import("../../src/lib/encyclopedia-refs");
    const out = resolveRelatedRefs(["muhammad", "figure:muhammad", "u-muhammad", "yarmouk"]);
    // muhammad appears three ways → one dedup entry; yarmouk → one entry.
    expect(out.length).toBe(2);
    expect(out.every((r) => r.resolved)).toBe(true);
    expect(out[0].label).toBe("شخصية · محمد ﷺ");
  });

  it("flags unresolved refs without inventing a title", async () => {
    const { resolveRelatedRefs, getBrokenEncyclopediaRefs } = await import("../../src/lib/encyclopedia-refs");
    const out = resolveRelatedRefs(["definitely-missing-slug"]);
    expect(out.length).toBe(1);
    expect(out[0].resolved).toBe(false);
    // Broken refs are logged for diagnostics.
    expect(getBrokenEncyclopediaRefs()).toContain("definitely-missing-slug");
  });

  it("filter(resolved) removes unresolved refs from player-facing list", async () => {
    const { resolveRelatedRefs } = await import("../../src/lib/encyclopedia-refs");
    const raw = ["muhammad", "definitely-missing-slug", "yarmouk"];
    const playerFacing = resolveRelatedRefs(raw).filter((r) => r.resolved);
    expect(playerFacing.map((r) => r.canonicalSlug)).toEqual(["muhammad", "yarmouk"]);
  });
});
