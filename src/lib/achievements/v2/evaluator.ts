/**
 * Pure achievement evaluator.
 *
 * Given a `ProgressSnapshot`, a `Registry`, and the current set of already-
 * unlocked ids (for prerequisite gating), returns a fresh `EvaluationResult`.
 *
 * The evaluator is synchronous, deterministic, and side-effect-free.
 * Memoization keys are `(snapshot.version, registry.version, unlockedSetHash)`.
 */

import type {
  AchievementId,
  EvaluationResult,
  ProgressSnapshot,
  CanonicalDomain,
} from "./types";
import type { Registry } from "./registry";

interface EvaluateOptions {
  /**
   * If provided, only entries whose `inputs` intersect with `changedDomains`
   * are re-evaluated. Others keep the values from `prev`.
   */
  changedDomains?: readonly CanonicalDomain[];
  /** Previous result for incremental evaluation. Required when using `changedDomains`. */
  prev?: EvaluationResult;
}

export function evaluate(
  snapshot: ProgressSnapshot,
  registry: Registry,
  alreadyUnlocked: ReadonlySet<AchievementId>,
  options: EvaluateOptions = {},
): EvaluationResult {
  const unlocked = new Set<AchievementId>(alreadyUnlocked);
  const progress = new Map<AchievementId, number>(options.prev?.progress ?? []);

  const changed = options.changedDomains;
  const scope = changed
    ? registry.byAnyInput(changed)
    : registry.all;

  for (const def of scope) {
    // Prerequisite gate: predicate can only unlock when all prereqs are unlocked.
    const prereqsMet =
      !def.prerequisites || def.prerequisites.every((p) => unlocked.has(p));

    let p = 0;
    try {
      p = clamp01(def.progress(snapshot));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[achievements] progress() threw for ${def.id}`, err);
      p = 0;
    }
    progress.set(def.id, p);

    if (!prereqsMet) continue;
    if (alreadyUnlocked.has(def.id)) continue;

    let pass = false;
    try {
      pass = def.predicate(snapshot);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[achievements] predicate() threw for ${def.id}`, err);
      pass = false;
    }
    if (pass) unlocked.add(def.id);
  }

  return {
    unlockedIds: unlocked,
    progress,
    snapshotVersion: snapshot.version,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}
