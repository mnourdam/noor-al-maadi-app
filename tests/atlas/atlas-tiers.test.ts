// V16 — Atlas zoom tier + coincidence contract tests.
import { describe, it, expect } from "vitest";
import {
  tierForScale,
  visibleKindsForTier,
  shouldShowAtlasPin,
  shouldShowAtlasLabel,
  isContextPin,
  ATLAS_TIER_THRESHOLDS as T,
  type AtlasTier,
} from "@/lib/atlas/atlas-tiers";
import {
  computeCoincidenceOffsets,
  applyCoincidenceOffset,
} from "@/lib/atlas/atlas-coincidence";
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

describe("tierForScale", () => {
  it("resolves stateless boundaries", () => {
    expect(tierForScale(1)).toBe(0);
    expect(tierForScale(1.59)).toBe(0);
    expect(tierForScale(1.6)).toBe(1);
    expect(tierForScale(3.39)).toBe(1);
    expect(tierForScale(3.4)).toBe(2);
    expect(tierForScale(50)).toBe(2);
  });

  it("is deterministic for identical inputs", () => {
    for (const s of [1, 1.6, 2.2, 3.4, 9]) {
      expect(tierForScale(s, 1)).toBe(tierForScale(s, 1));
    }
  });

  it("keeps the previous tier inside the dead-band", () => {
    expect(tierForScale(1.5, 1)).toBe(1); // between exit 1.45 and enter 1.6
    expect(tierForScale(1.5, 0)).toBe(0);
    expect(tierForScale(3.2, 2)).toBe(2); // between exit 3.05 and enter 3.4
    expect(tierForScale(3.2, 1)).toBe(1);
  });

  it("does not oscillate under jitter around 1.6", () => {
    let tier: AtlasTier = tierForScale(1.61);
    let flips = 0;
    for (let i = 0; i < 10000; i++) {
      const s = 1.6 + (i % 2 === 0 ? 0.01 : -0.01);
      const next = tierForScale(s, tier);
      if (next !== tier) flips++;
      tier = next;
    }
    expect(flips).toBe(0);
  });

  it("does not oscillate under jitter around 3.4", () => {
    let tier: AtlasTier = tierForScale(3.41);
    let flips = 0;
    for (let i = 0; i < 10000; i++) {
      const s = 3.4 + (i % 2 === 0 ? 0.01 : -0.01);
      const next = tierForScale(s, tier);
      if (next !== tier) flips++;
      tier = next;
    }
    expect(flips).toBe(0);
  });

  it("transitions correctly across a full zoom sweep", () => {
    let tier: AtlasTier = 0;
    const seen: AtlasTier[] = [];
    for (let s = 1; s <= 8; s += 0.05) { tier = tierForScale(s, tier); seen.push(tier); }
    expect(seen[0]).toBe(0);
    expect(tier).toBe(2);
    for (let s = 8; s >= 1; s -= 0.05) { tier = tierForScale(s, tier); }
    expect(tier).toBe(0);
    // exit thresholds are strictly below enter thresholds
    expect(T.mediumToFarExit).toBeLessThan(T.farToMediumEnter);
    expect(T.closeToMediumExit).toBeLessThan(T.mediumToCloseEnter);
  });
});

describe("visibility matrix", () => {
  it("FAR shows only regions", () => {
    expect(visibleKindsForTier(0)).toEqual(["region"]);
    expect(shouldShowAtlasPin("region", 0, false)).toBe(true);
    expect(shouldShowAtlasPin("place", 0, false)).toBe(false);
    expect(shouldShowAtlasPin("battle", 0, false)).toBe(false);
  });

  it("MEDIUM shows places primary, regions as context only", () => {
    expect(shouldShowAtlasPin("place", 1, false)).toBe(true);
    expect(shouldShowAtlasPin("region", 1, false)).toBe(true);
    expect(isContextPin("region", 1, false)).toBe(true);
    expect(shouldShowAtlasLabel("region", 1, false)).toBe(false);
    expect(shouldShowAtlasLabel("place", 1, false)).toBe(true);
    expect(shouldShowAtlasPin("battle", 1, false)).toBe(false);
  });

  it("CLOSE drops regions and shows places + battles", () => {
    expect(shouldShowAtlasPin("region", 2, false)).toBe(false);
    expect(shouldShowAtlasLabel("region", 2, false)).toBe(false);
    expect(shouldShowAtlasPin("place", 2, false)).toBe(true);
    expect(shouldShowAtlasPin("battle", 2, false)).toBe(true);
  });

  it("selected marker survives every tier, with its label", () => {
    for (const tier of [0, 1, 2] as AtlasTier[]) {
      for (const kind of ["region", "place", "battle"]) {
        expect(shouldShowAtlasPin(kind, tier, true)).toBe(true);
        expect(shouldShowAtlasLabel(kind, tier, true)).toBe(true);
        expect(isContextPin(kind, tier, true)).toBe(false);
      }
    }
    expect(shouldShowAtlasPin("battle", 0, true)).toBe(true);
    expect(shouldShowAtlasPin("region", 2, true)).toBe(true);
  });
});

describe("coincidence micro-offsets", () => {
  const pair = [
    { id: "a", x: 5000, y: 3000 },
    { id: "b", x: 5000, y: 3000 },
    { id: "c", x: 9000, y: 1000 },
  ];

  it("separates exact-coordinate markers and leaves unique ones untouched", () => {
    const off = computeCoincidenceOffsets(pair);
    expect(off.has("a")).toBe(true);
    expect(off.has("b")).toBe(true);
    expect(off.has("c")).toBe(false);
    const a = applyCoincidenceOffset("a", 5000, 3000, off);
    const b = applyCoincidenceOffset("b", 5000, 3000, off);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60);
    const c = applyCoincidenceOffset("c", 9000, 1000, off);
    expect(c).toEqual({ x: 9000, y: 1000 });
  });

  it("is deterministic and idempotent", () => {
    const a = computeCoincidenceOffsets(pair);
    const b = computeCoincidenceOffsets([...pair].reverse());
    for (const k of ["a", "b"]) {
      expect(a.get(k)).toEqual(b.get(k));
    }
  });

  it("separates near-identical coordinates", () => {
    const off = computeCoincidenceOffsets([
      { id: "p", x: 4000, y: 2000 },
      { id: "q", x: 4010, y: 2005 },
    ]);
    const p = applyCoincidenceOffset("p", 4000, 2000, off);
    const q = applyCoincidenceOffset("q", 4010, 2005, off);
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(50);
  });

  it("never pushes a marker outside APS bounds", () => {
    const corners = [
      { id: "tl1", x: 0, y: 0 }, { id: "tl2", x: 0, y: 0 },
      { id: "br1", x: ATLAS_V1_PIXEL_SIZE.width - 1, y: ATLAS_V1_PIXEL_SIZE.height - 1 },
      { id: "br2", x: ATLAS_V1_PIXEL_SIZE.width - 1, y: ATLAS_V1_PIXEL_SIZE.height - 1 },
    ];
    const off = computeCoincidenceOffsets(corners);
    for (const c of corners) {
      const r = applyCoincidenceOffset(c.id, c.x, c.y, off);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThanOrEqual(ATLAS_V1_PIXEL_SIZE.width - 1);
      expect(r.y).toBeLessThanOrEqual(ATLAS_V1_PIXEL_SIZE.height - 1);
    }
  });
});

describe("density against the real published fixture shape", () => {
  // 223 renderable rows: 32 regions, 92 places, 99 battles.
  const fixture = [
    ...Array.from({ length: 32 }, (_, i) => ({ id: `r${i}`, kind: "region" })),
    ...Array.from({ length: 92 }, (_, i) => ({ id: `p${i}`, kind: "place" })),
    ...Array.from({ length: 99 }, (_, i) => ({ id: `b${i}`, kind: "battle" })),
  ];
  const countAt = (tier: AtlasTier) =>
    fixture.filter((e) => shouldShowAtlasPin(e.kind, tier, false)).length;

  it("FAR renders only the 32 regions", () => {
    expect(countAt(0)).toBe(32);
  });

  it("MEDIUM renders places plus region context, no battles", () => {
    expect(countAt(1)).toBe(124);
  });

  it("CLOSE renders places + battles with regions dropped", () => {
    expect(countAt(2)).toBe(191);
  });

  it("no tier exceeds the old cumulative total of 223", () => {
    for (const tier of [0, 1, 2] as AtlasTier[]) {
      expect(countAt(tier)).toBeLessThan(223);
    }
  });
});
