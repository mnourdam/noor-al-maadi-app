// ============================================================
// LEGACY REFERENCE DATA — FROZEN (PR 1b)
// ------------------------------------------------------------
// These hardcoded content packs are NO LONGER the source of
// truth for playable campaigns. They remain ONLY as read-only
// reference data for: encyclopedia, atlas/map, timeline, and
// audit/migration tooling.
//
// Active playable campaigns live in:
//   • Supabase `admin_campaigns`
//   • Imported-campaign registry (admin/import + /campaigns/imported/$id/...)
//
// DO NOT add new playable campaign content here.
// DO NOT wire these into campaign gameplay UI.
// ============================================================
export * from "./types";
export * from "./registry";
