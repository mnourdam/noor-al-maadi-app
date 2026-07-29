// ============================================================
// Memory Engine — Public API surface
// ------------------------------------------------------------
// Feature modules import ONLY from this file. Registers built-in
// providers as a side-effect of first import.
// ============================================================

import { registerProvider } from "./providers";
import { campaignProvider } from "./providers/campaignProvider";

registerProvider(campaignProvider);

export { memoryEnabled, setMemoryRuntimeEnabled } from "./flags";
export {
  ensurePlan,
  resolveReviewFromPlan,
  buildRuntimeActivities,
  isReviewMarker,
  markReviewCompleted,
  clearPlan,
  planKeyFor,
} from "./plan";
export { grantReviewXp, computeReviewXp } from "./rewards";
export { getEntry, upsertEntry, bumpDaily, dailyCount, dailyCap } from "./history";
export { nextAfterCorrect, nextAfterWrong } from "./spacing";
export { findItem } from "./bank";
export type {
  ReviewItem,
  RuntimeChapterPlan,
  MemoryReviewActivityMarker,
  MemoryItemKind,
  MemorySourceType,
} from "./types";
export { MEMORY_ENGINE_VERSION, MEMORY_PLAN_STRUCTURE_VERSION } from "./types";
