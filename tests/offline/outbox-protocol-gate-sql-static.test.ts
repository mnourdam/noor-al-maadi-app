/** Text inspection only. These are NOT PostgreSQL/RLS acceptance tests. */
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
const proposal = "docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql";
const raw = readFileSync(proposal, "utf8");
const sql = raw.replace(/--[^\n]*/g, "");
const body = sql.split("AS $gate$")[1].split("$gate$;")[0];

it("STATIC: proposal is documentation, not a deployable migration", () => {
  expect(proposal.startsWith("docs/proposals/")).toBe(true);
  expect(sql.trim().startsWith("BEGIN;")).toBe(true);
  expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  for (const file of readdirSync("supabase/migrations")) {
    expect(readFileSync("supabase/migrations/" + file, "utf8")).not.toContain(
      "get_economic_protocol_gate_v1",
    );
  }
});
it("STATIC: enrollment has only diagnostic states and no wallet/authority column", () => {
  expect(sql).toContain("CHECK (diagnostic_state IN ('candidate', 'incomplete'))");
  const table = sql.split("CREATE TABLE public.economic_protocol_candidates (")[1].split("\n);")[0];
  expect(table).not.toMatch(
    /authoritative|baseline|economic_authority_enabled|\bxp\b|\bdinars\b|\bhearts\b/i,
  );
});
it("STATIC: both RLS and ACL deny client enrollment writes", () => {
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  expect(sql).toContain(
    "REVOKE ALL ON TABLE public.economic_protocol_candidates FROM PUBLIC, anon, authenticated, service_role",
  );
  expect(sql).toContain(
    "GRANT SELECT ON TABLE public.economic_protocol_candidates TO authenticated",
  );
  expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)\b/i);
  expect(sql).not.toMatch(/FOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i);
  expect(sql).toContain("USING ((SELECT auth.uid()) = user_id)");
});
it("STATIC: zero-argument own-account read has invoker rights and fixed search_path", () => {
  expect(sql).toMatch(/CREATE FUNCTION public\.get_economic_protocol_gate_v1\(\)/);
  expect(sql).toContain("STABLE SECURITY INVOKER");
  expect(sql).not.toContain("SECURITY DEFINER");
  expect(sql).toContain("SET search_path = pg_catalog");
  expect(body).toContain("current_uid uuid := auth.uid()");
  expect(body).toContain("WHERE c.user_id = current_uid");
  expect(body).toContain("ERRCODE = '42501'");
});
it("STATIC: no economic or state-writing SQL exists in the read function", () => {
  expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|EXECUTE|PERFORM|CREATE|ALTER)\b/i);
  expect(body).toContain("'economic_authority_enabled', false");
  expect(body).toContain("THEN 'unresolved' ELSE 'legacy'");
  expect(body).not.toMatch(/'authoritative'|\bprofiles\b|applied_profile_deltas|cloud_saves/i);
});
it("STATIC: execute permission is revoked from PUBLIC/anon/service before authenticated-only grant", () => {
  expect(sql).toContain(
    "REVOKE ALL ON FUNCTION public.get_economic_protocol_gate_v1() FROM PUBLIC, anon, authenticated, service_role",
  );
  expect(sql).toContain(
    "GRANT EXECUTE ON FUNCTION public.get_economic_protocol_gate_v1() TO authenticated",
  );
});
