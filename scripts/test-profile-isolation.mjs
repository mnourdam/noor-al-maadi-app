#!/usr/bin/env node
/**
 * Two-account RLS isolation proof for `public.profiles`.
 *
 * Impersonates the `authenticated` role with user A's JWT claims and asserts:
 *   1. A can read A's own profile row (all columns).
 *   2. A can read ZERO rows of B's profile from the base table.
 *   3. A can read B through `list_public_profiles`, but ONLY the curated
 *      public columns — no email / hearts / referral_code / marketing_opt_in.
 *   4. `anon` can read nothing at all (base table or RPC).
 *
 * Usage: node scripts/test-profile-isolation.mjs
 * Requires managed PG* env vars.
 */
import { execSync } from "node:child_process";

if (!process.env.PGHOST) {
  console.error("Skipping: PGHOST not set (no managed DB access).");
  process.exit(0);
}

const q = (sql) =>
  execSync(`psql -tA -c ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
  }).trim();

const tryQ = (sql) => {
  try {
    return { ok: true, out: q(sql) };
  } catch (err) {
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
};

const PRIVATE_COLUMNS = ["email", "referral_code", "marketing_opt_in", "hearts"];

const [A, B] = q(`select id from public.profiles order by created_at limit 2`)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (!A || !B) {
  console.error("Need at least two profiles in the database to run this test.");
  process.exit(1);
}

const as = (uid, sql) => `
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
  ${sql};
  rollback;
`;

const asAnon = (sql) => `
  begin;
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  ${sql};
  rollback;
`;

let failed = 0;
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 1. Owner can read own row.
const own = tryQ(as(A, `select count(*) from public.profiles where id = '${A}'`));
check("A reads own profile row", own.ok && own.out.includes("1"), own.out);

// 2. Owner cannot read another user's row from the base table.
const other = tryQ(as(A, `select count(*) from public.profiles where id = '${B}'`));
check("A reads 0 rows of B from base profiles", other.ok && other.out.includes("0"), other.out);

// 2b. Broad scan returns only the caller's own row.
const scan = tryQ(as(A, `select count(*) from public.profiles`));
check("A's full scan of profiles returns exactly 1 row", scan.ok && scan.out.includes("1"), scan.out);

// 3. Public RPC exposes B, but only curated columns.
const pub = tryQ(
  as(A, `select count(*) from public.list_public_profiles(array['${B}']::uuid[])`),
);
check("A reads B through list_public_profiles", pub.ok && pub.out.includes("1"), pub.out);

const cols = q(`
  select string_agg(p.name, ',' order by p.name)
  from pg_proc f
  cross join lateral unnest(f.proallargtypes, f.proargnames) with ordinality as p(t, name, ord)
  join unnest(f.proargmodes) with ordinality as m(mode, ord2) on m.ord2 = p.ord
  where f.proname = 'list_public_profiles' and m.mode = 't'
`);
const leaked = PRIVATE_COLUMNS.filter((c) => cols.split(",").includes(c));
check("list_public_profiles exposes no private columns", leaked.length === 0, `returns: ${cols}`);

// 4. anon has no access at all.
const anonBase = tryQ(asAnon(`select count(*) from public.profiles`));
check("anon cannot read profiles", !anonBase.ok, anonBase.ok ? `got ${anonBase.out}` : "permission denied");

const anonRpc = tryQ(asAnon(`select count(*) from public.list_public_profiles(null)`));
check("anon cannot execute list_public_profiles", !anonRpc.ok, anonRpc.ok ? `got ${anonRpc.out}` : "permission denied");

// 5. The removed permissive policy must not come back.
const policies = q(`
  select coalesce(string_agg(policyname || ' :: ' || coalesce(qual, ''), ' | '), '')
  from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
`);
check(
  "no permissive USING (true) SELECT policy on profiles",
  !/:: true/.test(policies),
  policies,
);

if (failed) {
  console.error(`\nProfile isolation FAILED (${failed} check${failed > 1 ? "s" : ""}).`);
  process.exit(1);
}
console.log("\nProfile isolation OK.");
