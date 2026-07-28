import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { buildEnvelope, buildAuditCsv, buildAuditReport } from "@/lib/admin/campaignExport";

describe("campaign export", () => {
  it("is lossless and audits", () => {
    const rows = JSON.parse(fs.readFileSync("/tmp/camps.json", "utf8")).rows;
    const env = buildEnvelope(rows, { scope: "all", includeAudit: true });
    // losslessness: data emitted verbatim
    expect(JSON.stringify(env.campaigns[0].data)).toBe(JSON.stringify(rows.find((r:any)=>r.id===env.campaigns[0].id).data));
    console.log("counts", env.counts);
    const rep = buildAuditReport(env.campaigns);
    console.log("totals", rep.totals);
    const codes: Record<string, number> = {};
    for (const c of rep.campaigns) for (const i of c.issues) codes[i.severity+":"+i.code] = (codes[i.severity+":"+i.code]??0)+1;
    console.log(codes);
    const csv = buildAuditCsv(env.campaigns);
    console.log("csv rows", csv.split("\r\n").length, "cols", csv.split("\r\n")[0].split(",").length);
    expect(csv.split("\r\n").length - 1).toBe(env.counts.activities);
  });
});
