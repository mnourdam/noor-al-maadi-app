#!/usr/bin/env node
/**
 * End-to-end two-account isolation proof for `public.profiles`.
 *
 * Creates two throwaway accounts, signs both in to get real user JWTs, then
 * exercises the Data API exactly like the app does:
 *
 *   1. A can read A's own profile row.
 *   2. A reads ZERO rows of B's profile from the base `profiles` table.
 *   3. A's unfiltered scan of `profiles` returns only A's own row.
 *   4. A can read B through `list_public_profiles`, and the payload contains
 *      ONLY curated public columns — no email / hearts / referral_code /
 *      marketing_opt_in.
 *   5. An anonymous caller can read neither the table nor the RPC.
 *   6. No permissive `USING (true)` SELECT policy exists on `profiles`.
 *
 * Both accounts are deleted afterwards, pass or fail.
 *
 * Usage: node scripts/test-profile-isolation.mjs
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ PGHOST for check 6).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!URL_BASE || !SERVICE_KEY || !ANON_KEY) {
  console.error("Skipping: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / publishable key not set.");
  process.exit(0);
}

const PRIVATE_COLUMNS = ["email", "referral_code", "marketing_opt_in", "hearts"];

let failed = 0;
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const admin = (path, init = {}) =>
  fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** Data API call as a specific end user (or anonymous when token is null). */
const asUser = async (token, path, init = {}) => {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

async function createAccount(tag) {
  const email = `rls-isolation-${tag}-${randomUUID()}@example.test`;
  const password = `Pw-${randomUUID()}`;
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: `rlstest_${tag}_${Date.now()}` },
    }),
  });
  const user = await created.json();
  if (!user?.id) throw new Error(`could not create user: ${JSON.stringify(user)}`);

  const signIn = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await signIn.json();
  if (!session?.access_token) throw new Error(`could not sign in: ${JSON.stringify(session)}`);

  return { id: user.id, token: session.access_token };
}

const cleanup = async (ids) => {
  for (const id of ids) {
    try {
      await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    } catch {
      /* best effort */
    }
  }
};

const created = [];
try {
  const A = await createAccount("a");
  created.push(A.id);
  const B = await createAccount("b");
  created.push(B.id);

  // 1. Owner reads own row.
  const own = await asUser(A.token, `/rest/v1/profiles?id=eq.${A.id}&select=id`);
  check("A reads own profile row", Array.isArray(own.body) && own.body.length === 1, JSON.stringify(own.body));

  // 2. Owner cannot read B's row from the base table.
  const other = await asUser(A.token, `/rest/v1/profiles?id=eq.${B.id}&select=*`);
  check(
    "A reads 0 rows of B from base profiles",
    Array.isArray(other.body) && other.body.length === 0,
    JSON.stringify(other.body),
  );

  // 3. Unfiltered scan leaks nothing.
  const scan = await asUser(A.token, `/rest/v1/profiles?select=id`);
  const scanIds = Array.isArray(scan.body) ? scan.body.map((r) => r.id) : [];
  check(
    "A's full scan of profiles returns only A's own row",
    scanIds.length === 1 && scanIds[0] === A.id,
    `rows=${scanIds.length}`,
  );

  // 4. Public RPC returns B, curated columns only.
  const pub = await asUser(A.token, `/rest/v1/rpc/list_public_profiles`, {
    method: "POST",
    body: JSON.stringify({ p_ids: [B.id] }),
  });
  const row = Array.isArray(pub.body) ? pub.body[0] : null;
  check("A reads B through list_public_profiles", !!row && row.id === B.id, JSON.stringify(pub.body));
  const leaked = row ? PRIVATE_COLUMNS.filter((c) => c in row) : [];
  check(
    "public payload exposes no private columns",
    !!row && leaked.length === 0,
    row ? `keys: ${Object.keys(row).sort().join(",")}` : "no row",
  );

  // 5. Anonymous access is fully denied.
  const anonBase = await asUser(null, `/rest/v1/profiles?select=id`);
  check(
    "anon cannot read profiles",
    anonBase.status >= 400 || (Array.isArray(anonBase.body) && anonBase.body.length === 0),
    `status=${anonBase.status}`,
  );
  const anonRpc = await asUser(null, `/rest/v1/rpc/list_public_profiles`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  check("anon cannot execute list_public_profiles", anonRpc.status >= 400, `status=${anonRpc.status}`);

  // 6. The permissive policy must not come back.
  if (process.env.PGHOST) {
    const policies = execSync(
      `psql -tA -c ${JSON.stringify(
        "select coalesce(string_agg(policyname || ' :: ' || coalesce(qual,''), ' | '), '') from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT'",
      )}`,
      { encoding: "utf8" },
    ).trim();
    check("no permissive USING (true) SELECT policy on profiles", !/:: true/.test(policies), policies);
  }
} finally {
  await cleanup(created);
}

if (failed) {
  console.error(`\nProfile isolation FAILED (${failed} check${failed > 1 ? "s" : ""}).`);
  process.exit(1);
}
console.log("\nProfile isolation OK.");
