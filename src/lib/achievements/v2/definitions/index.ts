/**
 * Achievement definitions — aggregation point.
 *
 * The registry consumes `DEFINITIONS`. Legacy achievements that cannot be
 * represented canonically are enumerated in `flagged.ts` for the migration
 * audit and are NEVER evaluated by v2.
 */

import type { AchievementDefinition } from "../types";
import { CANONICAL_DEFINITIONS } from "./all";

export const DEFINITIONS: readonly AchievementDefinition[] = CANONICAL_DEFINITIONS;
export { CANONICAL_DEFINITIONS } from "./all";
export { FLAGGED_LEGACY_ACHIEVEMENTS, FLAGGED_IDS } from "./flagged";
