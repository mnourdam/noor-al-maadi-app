// ============================================================
// Canonical starting-economy constants (CLIENT SIDE).
// ------------------------------------------------------------
// Postgres cannot literally `import` this TypeScript file, so
// these values are DUPLICATED in the migration that defines:
//   - profiles.dinars DEFAULT 300
//   - handle_new_user() INSERT ... 300
//   - purchase_heart() v_cost = 20, v_max = 5
//
// The values here MUST match the DB definitions. The parity
// script `scripts/check-economy-parity.mjs` reads the live DB
// (via psql) and fails CI/local checks if the two sides drift.
// ============================================================

/** Starting dinar grant for a genuinely new player (auth account or fresh guest). */
export const STARTING_DINARS = 300;

/** Cost in dinars to buy one heart via `purchase_heart` RPC / local reducer. */
export const HEART_COST_DINARS = 20;

/** Canonical maximum hearts. Mirrors `purchase_heart()` v_max and `src/lib/hearts.ts` HEART_MAX. */
export const HEART_MAX_CANONICAL = 5;
