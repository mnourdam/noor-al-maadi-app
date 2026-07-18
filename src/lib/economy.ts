// ============================================================
// Canonical starting-economy constants.
// ------------------------------------------------------------
// The DB is authoritative for authenticated accounts (see
// public.handle_new_user + profiles.dinars DEFAULT). This module
// mirrors those constants for the local guest profile and for
// UI copy so we never hardcode magic numbers in multiple places.
// ============================================================

/** Starting dinar grant for a genuinely new player (auth account or fresh guest). */
export const STARTING_DINARS = 300;

/** Cost in dinars to buy one heart via `purchase_heart` RPC / local reducer. */
export const HEART_COST_DINARS = 20;
