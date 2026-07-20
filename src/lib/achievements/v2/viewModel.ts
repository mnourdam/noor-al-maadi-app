/**
 * Unified view-model builder.
 *
 * Turns `(Registry, EvaluationResult, persisted records)` into an
 * `AchievementView[]` — the single projection consumed by Home, Profile,
 * Achievements page, and notifications.
 *
 * Pure function. No side effects.
 */

import { resolveI18n } from "./i18n";
import type { Registry } from "./registry";
import type {
  AchievementDefinition,
  AchievementId,
  AchievementState,
  AchievementView,
  EvaluationResult,
  UserAchievementRecord,
} from "./types";

export interface ViewModelInput {
  registry: Registry;
  evaluation: EvaluationResult;
  persisted: ReadonlyMap<AchievementId, UserAchievementRecord>;
}

export function buildViews(input: ViewModelInput): AchievementView[] {
  const { registry, evaluation, persisted } = input;
  const unlockedSet = evaluation.unlockedIds;

  const views: AchievementView[] = [];
  for (const def of registry.all) {
    const rec = persisted.get(def.id);
    const isUnlocked = Boolean(rec) || unlockedSet.has(def.id);
    const isClaimed = Boolean(rec?.rewardsGrantedAt);

    const state = deriveState(def, isUnlocked, isClaimed, unlockedSet);
    const progress = evaluation.progress.get(def.id) ?? 0;

    const showText = state !== "locked-secret";
    views.push({
      id: def.id,
      state,
      progress: isUnlocked ? 1 : progress,
      category: def.category,
      rarity: def.rarity,
      sortOrder: def.sortOrder,
      family: def.family,
      tier: def.tier,
      displayTitle: showText ? resolveI18n(def.i18n.titleKey) : null,
      displaySubtitle: showText ? resolveI18n(def.i18n.subtitleKey) : null,
      displayDescription: showText
        ? resolveI18n(
            isUnlocked
              ? def.i18n.descriptionKey
              : def.i18n.lockedDescriptionKey ?? def.i18n.descriptionKey,
          )
        : null,
      media: def.media,
      rewards: def.rewards,
      chain: def.family ? buildChain(registry, def) : undefined,
      unlockedAt: rec?.unlockedAt ?? null,
      claimedAt: rec?.rewardsGrantedAt ?? null,
    });
  }

  // Hide entries with `locked-hidden` — they are absent from lists entirely.
  return views.filter((v) => v.state !== "locked-hidden");
}

function deriveState(
  def: AchievementDefinition,
  isUnlocked: boolean,
  isClaimed: boolean,
  unlockedSet: ReadonlySet<AchievementId>,
): AchievementState {
  if (isClaimed) return "claimed";
  if (isUnlocked) return "unlocked";

  const prereqsMet =
    !def.prerequisites || def.prerequisites.every((p) => unlockedSet.has(p));

  if (def.visibility?.hidden) {
    if (def.visibility.revealOn === "prerequisite-met" && prereqsMet) {
      return "locked-visible";
    }
    return "locked-hidden";
  }
  if (def.visibility?.secret) {
    if (def.visibility.revealOn === "prerequisite-met" && prereqsMet) {
      return "locked-visible";
    }
    return "locked-secret";
  }
  return "locked-visible";
}

function buildChain(
  registry: Registry,
  def: AchievementDefinition,
): AchievementView["chain"] {
  if (!def.family) return undefined;
  const family = registry.byFamily.get(def.family) ?? [];
  const ordered = [...family].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = ordered.findIndex((d) => d.id === def.id);
  return {
    family: def.family,
    prevId: idx > 0 ? ordered[idx - 1].id : null,
    nextId: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1].id : null,
  };
}
