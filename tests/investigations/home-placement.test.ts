// ============================================================
// Historical Investigations placement — regression coverage
// ------------------------------------------------------------
// Covers the Home spotlight states, the clickable Home stat, the
// corrected notification deep link, and the navigation registry.
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { selectHomeInvestigationSpotlight } from "@/lib/investigations/home-spotlight";
import type { InvestigationRecommendation } from "@/lib/investigations/recommend";
import type { InvestigationRow } from "@/lib/investigations-source";
import { resolveDeclaration } from "@/lib/navigation/registry";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

function row(over: Partial<InvestigationRow> = {}): InvestigationRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "case-of-the-missing-caliph",
    title: "قضية الرسالة المفقودة",
    subtitle: "وثيقة تناقض الرواية الرسمية",
    description: null,
    difficulty: "medium",
    reward: {},
    steps: [],
    related_entities: [],
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...over,
  } as InvestigationRow;
}

function rec(over: Partial<InvestigationRecommendation> = {}): InvestigationRecommendation {
  return {
    ready: true,
    kind: "new",
    slug: null,
    row: null,
    total: 12,
    completed: 3,
    ...over,
  } as InvestigationRecommendation;
}

describe("Home investigations spotlight — states", () => {
  it("renders the discovery state with the library CTA", () => {
    const v = selectHomeInvestigationSpotlight(rec({ kind: "new", row: row(), slug: "x" }));
    expect(v.state).toBe("discovery");
    expect(v.title).toBe("التحقيقات التاريخية");
    expect(v.cta).toBe("افتح ملفات التحقيق");
    expect(v.to).toBe("/investigations");
    expect(v.params).toBeNull();
    expect(v.href).toBe("/investigations");
    expect(v.total).toBe(12);
    expect(v.completed).toBe(3);
  });

  it("renders the continuation state pointing at the EXACT investigation", () => {
    const r = row();
    const v = selectHomeInvestigationSpotlight(rec({ kind: "continue", row: r, slug: r.slug }));
    expect(v.state).toBe("continue");
    expect(v.eyebrow).toBe("واصل التحقيق");
    expect(v.title).toBe(r.title);
    expect(v.cta).toBe("متابعة القضية");
    expect(v.to).toBe("/investigation/$id");
    expect(v.params).toEqual({ id: r.slug });
    expect(v.href).toBe(`/investigation/${r.slug}`);
  });

  it("falls back to discovery when kind=continue but no row resolved", () => {
    const v = selectHomeInvestigationSpotlight(rec({ kind: "continue", row: null }));
    expect(v.state).toBe("discovery");
    expect(v.to).toBe("/investigations");
  });

  it("hides on an empty catalogue instead of rendering a dead CTA", () => {
    const v = selectHomeInvestigationSpotlight(rec({ kind: "none", row: null, total: 0, completed: 0 }));
    expect(v.state).toBe("hidden");
    expect(v.to).toBeNull();
  });

  it("hides while the local-first catalogue is still resolving", () => {
    const v = selectHomeInvestigationSpotlight(rec({ ready: false, total: 0 }));
    expect(v.state).toBe("hidden");
  });

  it("stays in discovery (never hidden) once every case is completed", () => {
    const v = selectHomeInvestigationSpotlight(rec({ kind: "none", row: null, total: 9, completed: 9 }));
    expect(v.state).toBe("discovery");
    expect(v.to).toBe("/investigations");
    expect(v.completed).toBe(9);
  });

  it("clamps nonsensical counts", () => {
    const v = selectHomeInvestigationSpotlight(rec({ total: 4, completed: 99 }));
    expect(v.completed).toBe(4);
  });

  it("is pure — no network, storage or timers in the module source", () => {
    const src = read("src/lib/investigations/home-spotlight.ts");
    expect(src).not.toMatch(/fetch\(|supabase|localStorage|setTimeout/);
  });
});

describe("Home wiring", () => {
  const home = read("src/routes/index.tsx");

  it("places the spotlight AFTER Daily Quest and BEFORE Daily Challenges", () => {
    const quest = home.indexOf("<DailyQuestCard />");
    const spot = home.indexOf("<InvestigationsSpotlight />");
    const challenges = home.indexOf("<DailyChallengesSection />");
    expect(quest).toBeGreaterThan(-1);
    expect(spot).toBeGreaterThan(quest);
    expect(challenges).toBeGreaterThan(spot);
  });

  it("makes the التحقيقات المنجزة stat a link to the library", () => {
    expect(home).toMatch(/label="التحقيقات المنجزة"[^/]*to="\/investigations"/);
    expect(home).toContain('data-testid="home-stat-investigations"');
  });

  it("does not introduce a new Home network query for investigations", () => {
    const card = read("src/components/home/InvestigationsSpotlight.tsx");
    expect(card).toContain("useRecommendedInvestigation");
    expect(card).not.toMatch(/supabase|useQuery|fetch\(/);
  });

  it("keeps investigations out of the bottom navigation (still 6 tabs)", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).not.toContain("/investigations");
    expect(shell).toContain("grid-cols-6");
  });
});

describe("Account keeps investigation progress", () => {
  const profile = read("src/routes/profile.tsx");

  it("keeps the canonical progress wiring and the progress-tab entry", () => {
    expect(profile).toContain("useCanonicalInvestigationProgress");
    expect(profile).toMatch(/label: "التحقيقات"[\s\S]{0,160}to: "\/investigations"/);
  });

  it("keeps the Overview secondary entry", () => {
    expect(profile).toContain('to="/investigations"');
  });
});

describe("Notification deep links", () => {
  const src = read("src/lib/notifications/deepLink.ts");

  it("routes a per-investigation payload at the singular player route", () => {
    expect(src).toContain("if (payload.investigationId) return `/investigation/${payload.investigationId}`;");
    expect(src).not.toContain("`/investigations/${payload.investigationId}`");
  });

  it("keeps the category-level fallback on the library route", () => {
    expect(src).toMatch(/case "investigation":\s*return "\/investigations";/);
  });
});

describe("Navigation registry is unchanged", () => {
  it("still declares both investigation routes with the same parents", () => {
    expect(resolveDeclaration("/investigations")?.parentRoute).toBe("/");
    expect(resolveDeclaration("/investigation/$id")?.parentRoute).toBe("/investigations");
  });
});
