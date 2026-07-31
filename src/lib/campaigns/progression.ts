// ============================================================
// Campaign Progression v1 — era-scoped sequential unlocking
// ------------------------------------------------------------
// Frozen rules (approved for launch):
//   1. The FIRST campaign of every era (section) is always open.
//   2. Inside an era, progress is sequential: campaign N+1 opens
//      only when campaign N is completed. No skipping, no dinars.
//   3. SPECIAL campaigns are excluded from the sequential chain and
//      may carry their own authored condition (achievement, level,
//      story, campaign). Absent a condition they stay locked.
//
// This module is PURE. It never reads storage or the network; the
// caller supplies the progression state. Locked campaigns are never
// hidden — the UI shows them with a lock and a human reason.
// ============================================================

export interface CampaignUnlockRule {
  /** Requires this achievement to be unlocked. */
  achievementId?: string;
  /** Requires the player to be at least this level. */
  level?: number;
  /** Requires this story to be finished. */
  storyId?: string;
  /** Requires this campaign to be completed. */
  campaignId?: string;
  /** Authored Arabic explanation shown on the lock bar. */
  hint?: string;
}

export interface CampaignLike {
  id: string;
  slug?: string;
  title?: string;
  tags?: string[];
  category?: string;
  /** Authored "special campaign" marker. */
  special?: boolean;
  /** Authored unlock condition (special campaigns only). */
  unlock?: CampaignUnlockRule | null;
}

export interface ProgressionState {
  completedCampaignIds: ReadonlySet<string>;
  completedStoryIds?: ReadonlySet<string>;
  unlockedAchievementIds?: ReadonlySet<string>;
  level?: number;
}

export type CampaignLockKind = "open" | "sequential" | "special";

export interface CampaignLockStatus {
  locked: boolean;
  kind: CampaignLockKind;
  /** Arabic reason, null when unlocked. */
  reason: string | null;
}

const SPECIAL_TAGS = new Set(["special", "secret", "خاصة", "خاصه", "سرية", "سريه"]);

/** Special campaigns sit OUTSIDE the era chain and use authored conditions. */
export function isSpecialCampaign(c: CampaignLike | null | undefined): boolean {
  if (!c) return false;
  if (c.special === true) return true;
  if (typeof c.category === "string" && SPECIAL_TAGS.has(c.category.trim().toLowerCase())) return true;
  for (const t of c.tags ?? []) {
    if (typeof t === "string" && SPECIAL_TAGS.has(t.trim().toLowerCase())) return true;
  }
  return false;
}

function matchesId(set: ReadonlySet<string> | undefined, c: CampaignLike, id: string): boolean {
  if (!set) return false;
  return set.has(id);
}

function completedCampaign(state: ProgressionState, c: CampaignLike): boolean {
  return (
    state.completedCampaignIds.has(c.id) ||
    (!!c.slug && state.completedCampaignIds.has(c.slug))
  );
}

function evaluateSpecial(c: CampaignLike, state: ProgressionState): CampaignLockStatus {
  const rule = c.unlock ?? null;
  const fallbackHint = rule?.hint?.trim();
  if (!rule) {
    return {
      locked: true,
      kind: "special",
      reason: fallbackHint || "حملة خاصة — تُفتح بشرط خاص.",
    };
  }
  const missing: string[] = [];
  if (rule.campaignId && !state.completedCampaignIds.has(rule.campaignId)) {
    missing.push("إنهاء حملة مرتبطة");
  }
  if (rule.storyId && !matchesId(state.completedStoryIds, c, rule.storyId)) {
    missing.push("إكمال قصة مرتبطة");
  }
  if (rule.achievementId && !matchesId(state.unlockedAchievementIds, c, rule.achievementId)) {
    missing.push("الحصول على إنجاز معيّن");
  }
  if (typeof rule.level === "number" && (state.level ?? 0) < rule.level) {
    missing.push(`بلوغ المستوى ${rule.level.toLocaleString("en-US")}`);
  }
  if (missing.length === 0) return { locked: false, kind: "special", reason: null };
  return {
    locked: true,
    kind: "special",
    reason: fallbackHint || `حملة خاصة — تُفتح بعد ${missing.join(" و")}.`,
  };
}

/**
 * Lock map for ONE era section, in authored order.
 * The first non-special campaign is always open.
 */
export function computeSectionLockMap(
  campaigns: readonly CampaignLike[],
  state: ProgressionState,
): Map<string, CampaignLockStatus> {
  const out = new Map<string, CampaignLockStatus>();
  let previousRegular: CampaignLike | null = null;

  for (const c of campaigns) {
    if (isSpecialCampaign(c)) {
      out.set(c.id, completedCampaign(state, c)
        ? { locked: false, kind: "special", reason: null }
        : evaluateSpecial(c, state));
      continue;
    }
    if (!previousRegular) {
      out.set(c.id, { locked: false, kind: "open", reason: null });
      previousRegular = c;
      continue;
    }
    const unlocked = completedCampaign(state, c) || completedCampaign(state, previousRegular);
    out.set(c.id, unlocked
      ? { locked: false, kind: "sequential", reason: null }
      : {
          locked: true,
          kind: "sequential",
          reason: previousRegular.title
            ? `سيتم فتحها بعد إنهاء «${previousRegular.title}».`
            : "سيتم فتحها بعد إنهاء الحملة السابقة.",
        });
    previousRegular = c;
  }
  return out;
}

/** Lock map across all era sections of the feed. */
export function computeFeedLockMap(
  sections: readonly { campaigns: readonly CampaignLike[] }[],
  state: ProgressionState,
): Map<string, CampaignLockStatus> {
  const out = new Map<string, CampaignLockStatus>();
  for (const s of sections) {
    for (const [k, v] of computeSectionLockMap(s.campaigns ?? [], state)) out.set(k, v);
  }
  return out;
}

export const OPEN_STATUS: CampaignLockStatus = { locked: false, kind: "open", reason: null };
