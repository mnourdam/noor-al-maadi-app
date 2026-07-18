// ============================================================
// Shared investigation boundary normalizer (Phase B).
//
// SINGLE SOURCE OF TRUTH for converting legacy payload shapes into
// the canonical on-disk investigation shape:
//
//   • `related_entities`: legacy objects ({ id } / { entity_id } /
//     { slug } / { type, slug }) → canonical string[].
//     Preferred canonical form is `type:slug` when a type hint is
//     available, otherwise a bare slug — both are already understood
//     by src/lib/import/relation-resolver.ts.
//
//   • `reward.coins` → `reward.dinars`. Rejects rows that carry both
//     with conflicting numeric values.
//
// Non-mutating: always returns a shallow-cloned copy so callers can
// still inspect the original payload. Reused by:
//   • admin list/detail readers (display only),
//   • import classification/commit,
//   • the future structured editor (Phase C).
// ============================================================

export interface InvestigationBoundaryWarning {
  kind:
    | "related_entity_object"      // one or more legacy object entries were normalized
    | "reward_coins_legacy"        // reward.coins normalized to reward.dinars
    | "reward_conflict"            // reward.coins and reward.dinars disagree
    | "related_entity_dropped"     // an entry could not be normalized (malformed)
    | "related_entities_malformed"; // related_entities was not an array
  detail?: string;
}

export interface InvestigationNormalizeResult<T = Record<string, unknown>> {
  data: T;
  changed: boolean;
  warnings: InvestigationBoundaryWarning[];
  /** true when at least one legacy shape was seen. Callers can badge
   * "صيغة قديمة" without re-checking every field. */
  hasLegacy: boolean;
  /** true when the row cannot be safely persisted without human review
   * (e.g. reward conflict). Use to gate "save" in the future editor. */
  hasBlockingIssue: boolean;
}

function coerceSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t;
}

/** Normalize one related-entities entry into a canonical string, or null
 * when the entry is unusable. Preserves `type:slug` form when a type hint
 * exists. */
export function normalizeRelatedEntry(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t || null;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const slug =
      coerceSlug(obj.slug) ??
      coerceSlug(obj.entity_slug) ??
      coerceSlug(obj.id) ??
      coerceSlug(obj.entity_id);
    if (!slug) return null;
    const type =
      coerceSlug(obj.type) ??
      coerceSlug(obj.entity_type) ??
      coerceSlug(obj.kind);
    if (type && !slug.includes(":")) return `${type}:${slug}`;
    return slug;
  }
  return null;
}

/** Normalize the entire related_entities array. */
export function normalizeRelatedEntities(input: unknown): {
  list: string[];
  legacyObjects: number;
  dropped: number;
  malformed: boolean;
} {
  if (!Array.isArray(input)) {
    // Treat non-arrays as empty; caller decides whether to warn.
    return { list: [], legacyObjects: 0, dropped: 0, malformed: input != null };
  }
  const list: string[] = [];
  let legacyObjects = 0;
  let dropped = 0;
  for (const raw of input) {
    const canonical = normalizeRelatedEntry(raw);
    if (canonical == null) {
      dropped++;
      continue;
    }
    if (raw && typeof raw === "object") legacyObjects++;
    list.push(canonical);
  }
  return { list, legacyObjects, dropped, malformed: false };
}

/** Normalize reward.coins → reward.dinars, detecting conflicts. */
export function normalizeReward(input: unknown): {
  reward: Record<string, unknown>;
  legacyCoins: boolean;
  conflict: { dinars: number; coins: number } | null;
} {
  const src: Record<string, unknown> =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>) }
      : {};

  const hasDinars = typeof src.dinars === "number" && Number.isFinite(src.dinars);
  const hasCoins = typeof src.coins === "number" && Number.isFinite(src.coins);

  if (hasDinars && hasCoins && src.dinars !== src.coins) {
    return {
      reward: src,
      legacyCoins: true,
      conflict: { dinars: src.dinars as number, coins: src.coins as number },
    };
  }

  let legacyCoins = false;
  if (hasCoins && !hasDinars) {
    src.dinars = src.coins;
    legacyCoins = true;
  }
  // Drop the legacy key from the canonical view (import/editor persist
  // this normalized object; callers that want to preserve the original
  // untouched must clone before normalizing).
  if ("coins" in src) delete src.coins;

  return { reward: src, legacyCoins: legacyCoins || hasCoins, conflict: null };
}

/** Normalize a whole investigation row payload at the boundary. */
export function normalizeInvestigationRow<T extends Record<string, unknown>>(
  input: T,
): InvestigationNormalizeResult<T> {
  const warnings: InvestigationBoundaryWarning[] = [];
  const out: Record<string, unknown> = { ...input };
  let changed = false;
  let hasLegacy = false;
  let hasBlockingIssue = false;

  // related_entities
  const rel = normalizeRelatedEntities(out.related_entities);
  if (rel.malformed) {
    warnings.push({
      kind: "related_entities_malformed",
      detail: "related_entities is not an array",
    });
    hasBlockingIssue = true;
  }
  if (rel.legacyObjects > 0) {
    warnings.push({
      kind: "related_entity_object",
      detail: `${rel.legacyObjects} legacy object entr${rel.legacyObjects === 1 ? "y" : "ies"} normalized to strings`,
    });
    hasLegacy = true;
    changed = true;
  }
  if (rel.dropped > 0) {
    warnings.push({
      kind: "related_entity_dropped",
      detail: `${rel.dropped} unusable entr${rel.dropped === 1 ? "y" : "ies"}`,
    });
    hasBlockingIssue = true;
  }
  if (
    changed ||
    !Array.isArray(out.related_entities) ||
    rel.dropped > 0 ||
    rel.malformed
  ) {
    out.related_entities = rel.list;
  }

  // reward
  const rew = normalizeReward(out.reward);
  if (rew.conflict) {
    warnings.push({
      kind: "reward_conflict",
      detail: `dinars=${rew.conflict.dinars} vs coins=${rew.conflict.coins}`,
    });
    hasBlockingIssue = true;
    // Leave the original reward untouched — the editor must resolve it.
  } else {
    if (rew.legacyCoins) {
      warnings.push({ kind: "reward_coins_legacy" });
      hasLegacy = true;
      changed = true;
    }
    out.reward = rew.reward;
  }

  return { data: out as T, changed, warnings, hasLegacy, hasBlockingIssue };
}

/** Compact reward summary used by the admin list (values only, no UI). */
export interface RewardSummary {
  xp?: number;
  dinars?: number;
  hearts?: number;
  unlocks: number;
  legacyCoins: boolean;
  conflict: boolean;
}

export function summarizeReward(input: unknown): RewardSummary {
  const rew = normalizeReward(input);
  const canonical = rew.reward;
  const badge = typeof canonical.badge === "string" ? 1 : 0;
  const artifact = typeof canonical.artifact === "string" ? 1 : 0;
  return {
    xp: typeof canonical.xp === "number" ? canonical.xp : undefined,
    dinars: typeof canonical.dinars === "number" ? canonical.dinars : undefined,
    hearts: typeof canonical.hearts === "number" ? canonical.hearts : undefined,
    unlocks: badge + artifact,
    legacyCoins: rew.legacyCoins,
    conflict: !!rew.conflict,
  };
}
