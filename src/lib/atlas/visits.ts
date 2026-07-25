// ============================================================
// Atlas location visits — the missing progression signal.
// ------------------------------------------------------------
// `atlas_location_visited` unlock nodes read
// `user_entity_discoveries` rows with entity_type='atlas_location',
// but nothing in the client ever wrote them, so the node could
// never become true. Opening an Atlas entity detail panel and
// dwelling on it is the canonical "visit".
//
// Writes go through the same durable ledger as encyclopedia
// discoveries (local mirror + outbox upsert), so the row is
// unique per (user, entity) and survives offline sessions.
// ============================================================

import { markEntityDiscovered } from "@/lib/entityDiscoveries";

export const ATLAS_VISIT_EVENT = "irth:atlas-visit:changed";

/** Dwell before a pin tap counts as a visit (ms). */
export const ATLAS_VISIT_DWELL_MS = 2000;

export function recordAtlasVisit(params: {
  userKey: string;
  entityId: string;
  entitySlug: string;
}): void {
  if (!params.entityId) return;
  try {
    markEntityDiscovered({
      userKey: params.userKey,
      entityId: params.entityId,
      entitySlug: params.entitySlug || params.entityId,
      entityType: "atlas_location",
      source: "atlas",
    });
  } catch {
    return;
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(ATLAS_VISIT_EVENT, { detail: { entityId: params.entityId } }),
      );
    } catch { /* noop */ }
  }
}
