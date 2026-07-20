/**
 * Achievement definitions — aggregation point.
 *
 * The registry consumes `DEFINITIONS`. Legacy ids that could not be
 * represented canonically are enumerated (and permanently reserved) in
 * `retired.ts`.
 */

import type { AchievementDefinition } from "../types";
import { CANONICAL_DEFINITIONS } from "./all";

export const DEFINITIONS: readonly AchievementDefinition[] = CANONICAL_DEFINITIONS;
export { CANONICAL_DEFINITIONS } from "./all";
export { RETIRED_LEGACY_ACHIEVEMENTS, RETIRED_IDS } from "./retired";
