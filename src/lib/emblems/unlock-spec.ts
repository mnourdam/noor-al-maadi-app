// ============================================================
// Emblem Unlock Spec — validator only (foundation)
// ------------------------------------------------------------
// Phase 9 ships types + a shallow validator. NO new unlock
// gating is enforced: the resolver keeps existing behaviour so
// that no player loses an emblem they already have.
// ============================================================

import type { EmblemUnlockSpec } from "./types";

export function isValidUnlockSpec(spec: unknown): spec is EmblemUnlockSpec {
  if (!spec || typeof spec !== "object") return false;
  const s = spec as { version?: unknown; expr?: { type?: unknown } };
  if (s.version !== 1) return false;
  if (!s.expr || typeof s.expr !== "object") return false;
  const t = s.expr.type;
  return (
    t === "always" ||
    t === "level" ||
    t === "achievement" ||
    t === "campaign_complete" ||
    t === "investigation_complete" ||
    t === "story_complete" ||
    t === "museum_item_owned" ||
    t === "streak_milestone" ||
    t === "admin_grant" ||
    t === "event"
  );
}

/** Default, always-unlocked spec used by every seed entry. */
export const ALWAYS_UNLOCKED: EmblemUnlockSpec = {
  version: 1,
  expr: { type: "always" },
};
