#!/usr/bin/env node
/**
 * Economy constant-parity guard.
 *
 * Postgres cannot import `src/lib/economy.ts`, so the client-side
 * constants and the DB definitions are two synchronized sources of
 * truth. This script queries the live DB (via `psql` using the
 * managed PG* env vars) and fails if any of these drift:
 *
 *   - profiles.dinars DEFAULT       vs STARTING_DINARS
 *   - handle_new_user() INSERT 300  vs STARTING_DINARS
 *   - purchase_heart() v_cost       vs HEART_COST_DINARS
 *   - purchase_heart() v_max        vs HEART_MAX_CANONICAL
 *   - HEART_MAX (src/lib/hearts.ts) vs HEART_MAX_CANONICAL
 *
 * Usage:  node scripts/check-economy-parity.mjs
 * Requires PGHOST/PGUSER/... in env (managed Supabase access).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function q(sql) {
  const flat = sql.replace(/\s+/g, " ").trim();
  return execSync(`psql -tA -c ${JSON.stringify(flat)}`, { encoding: "utf8" }).trim();
}

function readConst(path, name) {
  const src = readFileSync(path, "utf8");
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`Could not find ${name} in ${path}`);
  return Number(m[1]);
}

if (!process.env.PGHOST) {
  console.error("Skipping: PGHOST not set (no managed DB access).");
  process.exit(0);
}

const STARTING_DINARS   = readConst("src/lib/economy.ts", "STARTING_DINARS");
const HEART_COST_DINARS = readConst("src/lib/economy.ts", "HEART_COST_DINARS");
const HEART_MAX_CANON   = readConst("src/lib/economy.ts", "HEART_MAX_CANONICAL");
const HEART_MAX_HEARTS  = readConst("src/lib/hearts.ts",  "HEART_MAX");

const dbDefault = Number(q(
  `SELECT column_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='dinars'`,
));

const trigDef = q(
  `SELECT pg_get_functiondef(oid) FROM pg_proc
   WHERE proname='handle_new_user' AND pronamespace='public'::regnamespace`,
);
const trigInsertMatch = trigDef.match(/referred_by,\s*dinars\)\s*[\s\S]*?VALUES[\s\S]*?,\s*(\d+)\s*\)/);
if (!trigInsertMatch) throw new Error("Could not parse handle_new_user INSERT dinars value");
const trigInsert = Number(trigInsertMatch[1]);

const rpcDef = q(
  `SELECT pg_get_functiondef(oid) FROM pg_proc
   WHERE proname='purchase_heart' AND pronamespace='public'::regnamespace`,
);
const costMatch = rpcDef.match(/v_cost\s+constant\s+int\s*:=\s*(\d+)/);
const maxMatch  = rpcDef.match(/v_max\s+constant\s+int\s*:=\s*(\d+)/);
if (!costMatch || !maxMatch) throw new Error("Could not parse purchase_heart constants");
const rpcCost = Number(costMatch[1]);
const rpcMax  = Number(maxMatch[1]);

const checks = [
  ["profiles.dinars DEFAULT",           dbDefault,       STARTING_DINARS],
  ["handle_new_user() INSERT dinars",   trigInsert,      STARTING_DINARS],
  ["purchase_heart() v_cost",           rpcCost,         HEART_COST_DINARS],
  ["purchase_heart() v_max",            rpcMax,          HEART_MAX_CANON],
  ["hearts.ts HEART_MAX",               HEART_MAX_HEARTS, HEART_MAX_CANON],
];

let failed = 0;
for (const [label, db, client] of checks) {
  const ok = db === client;
  console.log(`${ok ? "✓" : "✗"} ${label}: db=${db} client=${client}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`\nEconomy parity FAILED (${failed} mismatch${failed > 1 ? "es" : ""}).`);
  process.exit(1);
}
console.log("\nEconomy parity OK.");
