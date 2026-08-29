/**
 * V16 — Encyclopedia state routing + Granada visibility.
 *
 * Guards the three regressions fixed in this change:
 *  1. a state entity reached through /encyclopedia/entity/<id> forwards ONCE
 *     to the dedicated state route, decided before any content hook mounts;
 *  2. Story prerequisite CTAs for state entities point straight at the state
 *     route (no generic-entity hop), everything else keeps the entity route;
 *  3. مملكة غرناطة is public Encyclopedia content and searchable, without
 *     exposing any other previously hidden state row.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { resolveCanonicalCtaTarget, type CtaEntityRow } from "@/lib/stories/unlock/prereq-cta";
import { isPublicEntity, isPublicStateSlug, APPROVED_STATE_SLUGS } from "@/lib/taxonomy-public";
import { buildCanonicalizedEncyclopediaSearch } from "@/lib/encyclopedia-search";

const GRANADA_ID = "0b8a6362-6825-4d7f-961c-6b8eac900ed5";
const GRANADA_SLUG = "nasrid-kingdom-of-granada";
const NASRID_EMIRATE_ID = "aba2da47-f99a-4caa-a18e-81bb929aeeb7";

const granada = {
  id: GRANADA_ID,
  slug: GRANADA_SLUG,
  title: "مملكة غرناطة",
  entity_type: "state",
  enabled: true,
  summary: "آخر معاقل الإسلام في الأندلس، دولة بني نصر التي صمدت قرابة ثلاثة قرون حتى سقوطها سنة 1492م.",
  metadata: { canonical: true },
} as any;

const nasridEmirate = {
  id: NASRID_EMIRATE_ID,
  slug: "nasrid-emirate",
  title: "إمارة بني نصر بغرناطة",
  entity_type: "state",
  enabled: true,
  summary: "إمارة بني نصر بغرناطة، صفحة منفصلة عن مملكة غرناطة في الموسوعة التاريخية لإرث.",
  metadata: {},
} as any;

const granadaCity = {
  id: "c4b5454e-ebbc-4e8b-9162-5799836f8fe6",
  slug: "granada",
  title: "غرناطة",
  entity_type: "city",
  enabled: true,
  summary: "مدينة غرناطة الأندلسية، حاضرة قصر الحمراء ومركز الحياة العلمية والعمرانية في جنوب الأندلس.",
  metadata: {},
} as any;

// ── 1. routing gate ────────────────────────────────────────────────
describe("entity route → state route forwarding", () => {
  const routeSrc = readFileSync("src/routes/encyclopedia.entity.$id.tsx", "utf-8");

  it("decides forwarding in the gate, before the content page mounts", () => {
    expect(routeSrc).toContain("component: EntityRoute");
    const gateIdx = routeSrc.indexOf("function EntityRoute()");
    const pageIdx = routeSrc.indexOf("function EntityPage(");
    const navIdx = routeSrc.indexOf('<Navigate to="/encyclopedia/state/$id"');
    expect(gateIdx).toBeGreaterThan(0);
    expect(navIdx).toBeGreaterThan(gateIdx);
    expect(navIdx).toBeLessThan(pageIdx);
  });

  it("mounts no discovery / atlas / relationship hook before the redirect decision", () => {
    const gate = routeSrc.slice(
      routeSrc.indexOf("function EntityRoute()"),
      routeSrc.indexOf("function EntityPage("),
    );
    expect(gate).not.toContain("useEntityReadCompletion");
    expect(gate).not.toContain("atlas-link");
    expect(gate).not.toContain("resolveRelatedEntities");
  });

  it("EntityPage carries no render-time navigation (loop source)", () => {
    const page = routeSrc.slice(routeSrc.indexOf("function EntityPage("));
    expect(page).not.toContain("<Navigate");
  });

  it("forwards exactly the rows that need the state route", async () => {
    const { shouldForwardToStateRoute } = await import("@/routes/encyclopedia.entity.$id");
    expect(shouldForwardToStateRoute(granada)).toBe(true);
    expect(shouldForwardToStateRoute(granadaCity)).toBe(false);
    expect(shouldForwardToStateRoute(null)).toBe(false);
    expect(shouldForwardToStateRoute({ entity_type: "state", slug: "" })).toBe(false);
  });

  it("state route never forwards back by slug (no ping-pong)", () => {
    const stateSrc = readFileSync("src/routes/encyclopedia.state.$id.tsx", "utf-8");
    expect(stateSrc).toContain('params={{ id: stateQuery.data!.id }}');
  });
});

// ── 7. fail-safe loading ───────────────────────────────────────────
describe("fail-safe loading", () => {
  it("both encyclopedia detail routes gate the spinner on a stall timer", () => {
    for (const f of [
      "src/routes/encyclopedia.entity.$id.tsx",
      "src/routes/encyclopedia.state.$id.tsx",
    ]) {
      const src = readFileSync(f, "utf-8");
      expect(src).toContain("useStalled");
      expect(src).toMatch(/isLoading && !stalled/);
    }
  });

  it("stall timeout is generous enough for slow valid loads", () => {
    const src = readFileSync("src/hooks/useStalled.ts", "utf-8");
    const m = src.match(/ms = (\d[\d_]*)/);
    expect(m).toBeTruthy();
    expect(Number(m![1].replace(/_/g, ""))).toBeGreaterThanOrEqual(15_000);
  });

  it("a resolver miss settles to null rather than pending", async () => {
    const { entityQueryOptions } = await import("@/routes/encyclopedia.entity.$id");
    const opts = entityQueryOptions("");
    await expect((opts.queryFn as any)()).resolves.toBeNull();
  });
});

// ── 2. prerequisite CTA ────────────────────────────────────────────
describe("prerequisite CTA canonical path", () => {
  const lookup = (id: string): CtaEntityRow | null =>
    id === GRANADA_ID ? granada : id === granadaCity.id ? granadaCity : null;

  it("state prerequisites go straight to the dedicated state route", () => {
    const r = resolveCanonicalCtaTarget(GRANADA_ID, lookup);
    expect(r.reason).toBe("canonical");
    expect(r.entityType).toBe("state");
    expect(r.path).toBe(`/encyclopedia/state/${GRANADA_SLUG}`);
  });

  it("non-state prerequisites keep the generic entity route", () => {
    const r = resolveCanonicalCtaTarget(granadaCity.id, lookup);
    expect(r.path).toBe(`/encyclopedia/entity/${granadaCity.id}`);
  });

  it("unresolvable refs still produce no CTA", () => {
    const r = resolveCanonicalCtaTarget("missing", lookup);
    expect(r.targetId).toBeNull();
    expect(r.path).toBeNull();
  });

  it("a disabled state duplicate redirects to the canonical state route", () => {
    const dup: CtaEntityRow = {
      id: "dup",
      enabled: false,
      entity_type: "state",
      slug: "old-granada",
      metadata: { canonical_id: GRANADA_ID },
    };
    const r = resolveCanonicalCtaTarget("dup", (id) => (id === "dup" ? dup : lookup(id)));
    expect(r.reason).toBe("redirected");
    expect(r.path).toBe(`/encyclopedia/state/${GRANADA_SLUG}`);
  });

  it("the locked-story dialog uses the resolved canonical path", () => {
    const src = readFileSync("src/components/stories/LockedStoryDialog.tsx", "utf-8");
    expect(src).toContain("to: resolved.path");
    expect(src).not.toContain("`/encyclopedia/entity/${resolved.targetId}`");
  });
});

// ── 3 + 4. Granada taxonomy and search ─────────────────────────────
describe("Granada public visibility", () => {
  it("the canonical slug is approved public content", () => {
    expect(isPublicStateSlug(GRANADA_SLUG)).toBe(true);
    expect(isPublicEntity(granada)).toBe(true);
  });

  it("does not expose other hidden state rows", () => {
    expect(isPublicStateSlug("nasrid-emirate")).toBe(false);
    expect(isPublicEntity(nasridEmirate)).toBe(false);
    expect(isPublicStateSlug("buyid")).toBe(false);
    expect(isPublicStateSlug("fatimid")).toBe(false);
    expect(isPublicStateSlug("safavid")).toBe(false);
    // exactly one slug was added to the approved set
    expect(APPROVED_STATE_SLUGS.filter((s) => s === GRANADA_SLUG)).toHaveLength(1);
    expect(APPROVED_STATE_SLUGS).toHaveLength(13);
  });

  it("search for مملكة غرناطة returns the canonical row", () => {
    const rows = [granada, nasridEmirate, granadaCity];
    const res = buildCanonicalizedEncyclopediaSearch({ rows, query: "مملكة غرناطة" });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].e.id).toBe(GRANADA_ID);
    // the distinct emirate row must not surface as a duplicate of it
    expect(res.filter((r) => r.e.id === NASRID_EMIRATE_ID)).toHaveLength(0);
  });

  it("normalized search for غرناطة finds the canonical state", () => {
    const rows = [granada, nasridEmirate, granadaCity];
    const res = buildCanonicalizedEncyclopediaSearch({ rows, query: "غرناطة" });
    const ids = res.map((r) => r.e.id);
    expect(ids).toContain(GRANADA_ID);
    expect(ids).toContain(granadaCity.id);
    expect(ids).not.toContain(NASRID_EMIRATE_ID);
  });
});
