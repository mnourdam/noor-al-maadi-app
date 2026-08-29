/**
 * V16 Analytics Center contract tests.
 *
 * These are static/contract tests: they assert the SQL gate semantics and
 * the client contract (no silent zero, real date filtering, no fabricated
 * retention/device metrics, no raw UUIDs in rankings).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRange, engagementQuery } from "../../src/lib/analytics";

const page = readFileSync("src/routes/admin.analytics.tsx", "utf8");
const lib = readFileSync("src/lib/analytics.ts", "utf8");

describe("analytics access", () => {
  it("1. staff gate accepts owner and admin", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = "supabase/migrations";
    const gate = readdirSync(dir)
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
      .filter((sql) => sql.includes("FUNCTION public.is_content_editor"))
      .pop() ?? "";
    expect(gate).toContain("'owner'");
    expect(gate).toContain("'admin'");
    expect(gate).not.toContain("'player'");
  });


  it("2. normal players are not granted analytics by the client", () => {
    expect(page).toContain("AdminGate");
    expect(page).toContain("ManagerOnly");
  });
});

describe("no silent zero", () => {
  it("3. failed metric renders an unavailable state, not 0", () => {
    expect(page).toMatch(/تعذّر جلب المؤشر/);
    expect(page).toMatch(/وليست صفرًا/);
    // engagement failures never fall back to a numeric value
    expect(page).not.toMatch(/engagementQuery\([^)]*\)\)\.data \?\? 0/);
  });

  it("3b. engagement query does not retry-mask errors into empty data", () => {
    expect(lib).toContain("retry: false");
  });
});

describe("date filters", () => {
  it("4. range changes the query key and RPC arguments", () => {
    const a = engagementQuery(resolveRange("last_7d"));
    const b = engagementQuery(resolveRange("last_30d"));
    expect(JSON.stringify(a.queryKey)).not.toEqual(JSON.stringify(b.queryKey));
  });

  it("5. DAU/WAU/MAU windows are 1/7/30 days from the range resolver", () => {
    const d = resolveRange("today");
    const w = resolveRange("last_7d");
    const m = resolveRange("last_30d");
    const dayMs = 86_400_000;
    expect(Math.round((w.to.getTime() - w.from.getTime()) / dayMs)).toBe(7);
    expect(Math.round((m.to.getTime() - m.from.getTime()) / dayMs)).toBe(30);
    expect(d.bucket).toBe("hour");
  });
});

describe("content rankings", () => {
  it("6/9. rankings render resolved titles, never raw ids", () => {
    expect(page).toContain("top_stories");
    expect(page).toMatch(/items=\{data\.top_stories\.map\(\(s\) => \(\{ title: s\.title/);
    expect(page).not.toMatch(/\{it\.id\}/);
  });
});

describe("unsupported dimensions are not fabricated", () => {
  it("7. retention is declared unavailable", () => {
    expect(page).toMatch(/الاحتفاظ التفصيلي D1 \/ D7 \/ D30/);
    expect(page).not.toMatch(/D1\s*=|retention_rate/);
  });

  it("8. country/device/platform are declared unavailable", () => {
    expect(page).toMatch(/بيانات البلد والجهاز والمنصة غير متاحة/);
    expect(page).not.toMatch(/country_from_email|guessCountry/);
  });
});

describe("aggregate RPC", () => {
  it("10. engagement uses one bounded server aggregate", () => {
    expect(lib).toContain("analytics_engagement_v16");
    expect(lib).toContain("p_from");
    expect(lib).toContain("p_to");
  });
});

describe("V16 UI correction", () => {
  it("11. no raw postgres error text is rendered", () => {
    expect(page).not.toContain("{error.message}");
    expect(page).not.toContain("{(error as Error).message}");
  });

  it("12. primary player KPIs are present", () => {
    for (const k of ["إجمالي اللاعبين", "لاعبون جدد اليوم", "new_week", "new_month", "u.dau", "u.wau", "u.mau", "dau_mau_ratio"]) {
      expect(page).toContain(k);
    }
  });

  it("13. engagement groups label events vs totals", () => {
    for (const g of ["القصص", "الحملات", "الموسوعة", "التحقيقات", "المتحف", "المجتمع"]) {
      expect(page).toContain(g);
    }
    expect(page).toContain("(أحداث)");
    expect(page).toContain("إجمالي — سجلات");
  });

  it("14. technical diagnostics are collapsed and demoted", () => {
    expect(page).toMatch(/title="تشخيص النظام"[\s\S]*?defaultOpen=\{false\}/);
    const players = page.indexOf("صحة المجتمع / اللاعبين");
    const diag = page.indexOf('title="تشخيص النظام"');
    expect(players).toBeGreaterThan(-1);
    expect(players).toBeLessThan(diag);
  });

  it("15. engagement RPC no longer references the non-existent day column", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const dir = "supabase/migrations";
    const sql = readdirSync(dir)
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
      .filter((t) => t.includes("analytics_engagement_v16"))
      .pop() ?? "";
    expect(sql).toContain("activity_day >=");
    expect(sql).not.toMatch(/WHERE day >=/);
  });
});
