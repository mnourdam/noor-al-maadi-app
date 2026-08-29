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
    expect(page).toMatch(/تعذّر جلب هذا المؤشر/);
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
    expect(page).toMatch(/لا تتوفر بيانات تاريخية كافية بعد/);
    expect(page).not.toMatch(/D1\s*=|retention_rate/);
  });

  it("8. country/device/platform are declared unavailable", () => {
    expect(page).toMatch(/الدولة\/الجهاز\/المنصّة/);
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
