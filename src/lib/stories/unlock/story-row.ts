// ============================================================
// Story-row unlock resolution — FAIL CLOSED on missing metadata (V16)
// ------------------------------------------------------------
// `normalizeUnlockSpec(null | undefined)` intentionally returns
// ALWAYS_SPEC so genuine legacy rows that were authored with a NULL
// `unlock_spec` keep working. That default is correct for authoring,
// but it is DANGEROUS for a story row whose `unlock_spec` KEY was
// stripped by a redacting server projection
// (`stories_snapshot_manifest_v2` omits `unlock_spec` for every
// locked-visible story). Such a row would silently evaluate as
// "always unlocked".
//
// Rule enforced here:
//   * key absent from the row          → NEVER (locked)
//   * key present with null/undefined  → legacy behaviour (ALWAYS)
//   * key present with a spec          → normal normalization
//
// Every Story access/summary surface MUST use these helpers instead of
// reading `row.unlock_spec` directly.
// ============================================================

import { normalizeUnlockSpec } from "./normalize";
import { validateUnlockSpec } from "./validate";
import { evaluateUnlock } from "./evaluate";
import { NEVER_SPEC, type UnlockSpecV2 } from "./spec";
import { toUnlockContext, type PlayerUnlockState } from "./local";

/** True when the row object literally carries an `unlock_spec` key. */
export function hasUnlockSpecKey(row: unknown): boolean {
  return !!row && typeof row === "object" && "unlock_spec" in (row as Record<string, unknown>);
}

/**
 * Resolve the unlock spec of a STORY ROW.
 * Missing key ⇒ NEVER. Explicit null ⇒ legacy ALWAYS.
 */
export function storyUnlockSpecOrNever(row: unknown): UnlockSpecV2 {
  if (!hasUnlockSpecKey(row)) return NEVER_SPEC;
  return normalizeUnlockSpec((row as { unlock_spec?: unknown }).unlock_spec);
}

/** True only when the row is unconditionally open (fail-closed). */
export function isStoryRowAlwaysUnlocked(row: unknown): boolean {
  const spec = storyUnlockSpecOrNever(row);
  if (!validateUnlockSpec(spec).ok) return false;
  return spec.expr.type === "always";
}

/** Evaluate a story row against local player evidence (fail-closed). */
export function evaluateStoryRowUnlock(
  row: unknown,
  playerState: PlayerUnlockState = {},
): boolean {
  const spec = storyUnlockSpecOrNever(row);
  if (!validateUnlockSpec(spec).ok) return false;
  return evaluateUnlock(spec, toUnlockContext(playerState));
}
