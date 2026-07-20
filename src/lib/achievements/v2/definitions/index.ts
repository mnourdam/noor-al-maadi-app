/**
 * Achievement definitions — content only, no engine logic.
 *
 * This file is the aggregation point. Each definition file exports one or
 * more `AchievementDefinition`s. Adding a definition = one entry here.
 *
 * NOTE: This slice ships a small sample set to prove the registry pipeline.
 * The full port of the 57 existing definitions happens in the next slice
 * so that the wire-up milestone is reviewable in isolation.
 */

import type { AchievementDefinition } from "../types";
import { campaignFirst } from "./campaigns";
import { investigationFirst } from "./investigations";
import { levelFive } from "./level";

export const DEFINITIONS: readonly AchievementDefinition[] = Object.freeze([
  campaignFirst,
  investigationFirst,
  levelFive,
]);
