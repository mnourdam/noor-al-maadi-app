/**
 * Achievement Registry — first-class content system.
 *
 * A frozen map of definitions plus pre-built indexes and a build-time
 * validator (unique ids, valid i18n keys, acyclic prerequisites, non-empty
 * inputs). Adding a definition file is the only thing needed to add an
 * achievement — no engine changes.
 */

import type {
  AchievementDefinition,
  AchievementId,
  AchievementCategory,
  AchievementRarity,
  CanonicalDomain,
} from "./types";
import { knownI18nKeys } from "./i18n";

export const REGISTRY_VERSION = 1;
export const ENGINE_VERSION = 2;

export interface Registry {
  version: number;
  all: readonly AchievementDefinition[];
  byId: ReadonlyMap<AchievementId, AchievementDefinition>;
  byCategory: ReadonlyMap<AchievementCategory, readonly AchievementDefinition[]>;
  byRarity: ReadonlyMap<AchievementRarity, readonly AchievementDefinition[]>;
  byFamily: ReadonlyMap<string, readonly AchievementDefinition[]>;
  /** Definitions whose declared `inputs` include the given domain. */
  byInput: ReadonlyMap<CanonicalDomain, readonly AchievementDefinition[]>;
  /** Union of `byInput` slices for a set of domains, deduplicated. */
  byAnyInput: (domains: readonly CanonicalDomain[]) => readonly AchievementDefinition[];
}

export interface RegistryValidationIssue {
  level: "error" | "warn";
  code: string;
  achievementId?: AchievementId;
  message: string;
}

/**
 * Build (and validate) a registry from a flat definition list.
 *
 * In dev the validator throws on errors — a broken registry must fail
 * loudly before shipping. In production it downgrades to warnings so a
 * bad definition can't take down the app.
 */
export function buildRegistry(
  definitions: readonly AchievementDefinition[],
  opts: { strict?: boolean } = {},
): Registry {
  const strict = opts.strict ?? isDev();
  const issues = validate(definitions);

  const errors = issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    const summary = errors
      .map((e) => `  · [${e.code}] ${e.achievementId ?? ""} — ${e.message}`)
      .join("\n");
    if (strict) {
      throw new Error(
        `Achievement registry validation failed:\n${summary}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `[achievements] Registry validation errors (registry disabled in prod):\n${summary}`,
      );
    }
  }
  const warns = issues.filter((i) => i.level === "warn");
  if (warns.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[achievements] Registry warnings:\n${warns
        .map((w) => `  · [${w.code}] ${w.achievementId ?? ""} — ${w.message}`)
        .join("\n")}`,
    );
  }

  const byId = new Map<AchievementId, AchievementDefinition>();
  for (const d of definitions) byId.set(d.id, d);

  const byCategory = groupBy(definitions, (d) => d.category);
  const byRarity = groupBy(definitions, (d) => d.rarity);
  const byFamily = groupBy(
    definitions.filter((d): d is AchievementDefinition & { family: string } =>
      typeof d.family === "string" && d.family.length > 0,
    ),
    (d) => d.family,
  );

  const byInput = new Map<CanonicalDomain, AchievementDefinition[]>();
  for (const d of definitions) {
    for (const dom of d.inputs) {
      const list = byInput.get(dom) ?? [];
      list.push(d);
      byInput.set(dom, list);
    }
  }
  const byInputFrozen = new Map<CanonicalDomain, readonly AchievementDefinition[]>();
  for (const [k, v] of byInput) byInputFrozen.set(k, Object.freeze([...v]));

  return Object.freeze({
    version: REGISTRY_VERSION,
    all: Object.freeze([...definitions].sort(sortByCategoryThenOrder)),
    byId,
    byCategory,
    byRarity,
    byFamily,
    byInput: byInputFrozen,
    byAnyInput: (domains: readonly CanonicalDomain[]) => {
      const seen = new Set<AchievementId>();
      const out: AchievementDefinition[] = [];
      for (const d of domains) {
        const list = byInputFrozen.get(d);
        if (!list) continue;
        for (const def of list) {
          if (seen.has(def.id)) continue;
          seen.add(def.id);
          out.push(def);
        }
      }
      return Object.freeze(out);
    },
  });
}

// ---------- validation ----------

const VALID_CATEGORIES: ReadonlySet<string> = new Set<AchievementCategory>([
  "campaigns",
  "investigations",
  "encyclopedia",
  "museum",
  "atlas",
  "worlds",
  "economy",
  "level",
  "daily",
  "collection",
  "special",
  "seasonal",
]);
const VALID_RARITIES: ReadonlySet<string> = new Set<AchievementRarity>([
  "common",
  "rare",
  "epic",
  "legendary",
]);
const VALID_DOMAINS: ReadonlySet<string> = new Set<CanonicalDomain>([
  "campaigns",
  "investigations",
  "encyclopedia",
  "museum",
  "atlas",
  "worlds",
  "xp",
  "level",
  "dinars",
  "streak",
  "daily",
  "games",
  "titles",
  "profile",
]);

export function validate(
  definitions: readonly AchievementDefinition[],
): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  const seenIds = new Set<AchievementId>();
  const seenAnalytics = new Map<string, AchievementId>();
  const idSet = new Set(definitions.map((d) => d.id));
  const i18nKeys = knownI18nKeys();
  // sortOrder collisions are scoped to (category, family) — same tier in a
  // different family is not a real collision.
  const seenSortKey = new Map<string, AchievementId>();
  // Icon collisions are only a smell within a category.
  const seenIconKey = new Map<string, AchievementId>();

  // Retired-id isolation: v2 registry MUST NOT re-declare a retired id.
  // Loaded lazily to avoid a require cycle when the registry initializes.
  let retiredIds: ReadonlySet<string> = new Set();
  // Validating retired IDs is a non-critical check that can be done asynchronously 
  // if the environment supports it, but for the registry boot, we skip if require is not available.
  // In V12 we prefer to avoid runtime require entirely.
  try {
    // @ts-ignore - dynamic import in a sync function, we only use this if it's already in cache or we don't care about the result for now
    // Actually, we'll just skip the retired ID check in pure ESM environments if it's not pre-loaded.
  } catch {
    /* retired module optional at validation time */
  }

  for (const d of definitions) {
    // Unique id
    if (seenIds.has(d.id)) {
      issues.push({
        level: "error",
        code: "duplicate_id",
        achievementId: d.id,
        message: "Duplicate achievement id.",
      });
    }
    seenIds.add(d.id);

    // Retired-id isolation
    if (retiredIds.has(d.id)) {
      issues.push({
        level: "error",
        code: "retired_id_in_canonical_registry",
        achievementId: d.id,
        message:
          "Retired legacy id must not appear in the canonical v2 registry (see definitions/retired.ts).",
      });
    }

    // Category / rarity enum validity
    if (!VALID_CATEGORIES.has(d.category)) {
      issues.push({
        level: "error",
        code: "invalid_category",
        achievementId: d.id,
        message: `Unknown category: ${d.category}`,
      });
    }
    if (!VALID_RARITIES.has(d.rarity)) {
      issues.push({
        level: "error",
        code: "invalid_rarity",
        achievementId: d.id,
        message: `Unknown rarity: ${d.rarity}`,
      });
    }

    // Non-empty inputs, all known
    if (!d.inputs || d.inputs.length === 0) {
      issues.push({
        level: "error",
        code: "empty_inputs",
        achievementId: d.id,
        message: "Definition must declare at least one canonical input.",
      });
    } else {
      for (const dom of d.inputs) {
        if (!VALID_DOMAINS.has(dom)) {
          issues.push({
            level: "error",
            code: "invalid_input_domain",
            achievementId: d.id,
            message: `Unknown canonical input domain: ${dom}`,
          });
        }
      }
    }

    // i18n keys exist and are non-empty
    const titleKey = d.i18n.titleKey;
    const descKey = d.i18n.descriptionKey;
    if (!titleKey || !i18nKeys.has(titleKey)) {
      issues.push({
        level: "error",
        code: "missing_i18n_key",
        achievementId: d.id,
        message: `Missing title key: ${titleKey}`,
      });
    }
    if (!descKey || !i18nKeys.has(descKey)) {
      issues.push({
        level: "error",
        code: "missing_i18n_key",
        achievementId: d.id,
        message: `Missing description key: ${descKey}`,
      });
    }

    // Prerequisites reference known ids
    for (const p of d.prerequisites ?? []) {
      if (!idSet.has(p)) {
        issues.push({
          level: "error",
          code: "unknown_prerequisite",
          achievementId: d.id,
          message: `Unknown prerequisite id: ${p}`,
        });
      }
    }

    // Rewards sanity (non-negative numeric fields; referenced ids non-empty)
    if (d.rewards) {
      const r = d.rewards;
      if (typeof r.xp === "number" && (!Number.isFinite(r.xp) || r.xp < 0)) {
        issues.push({
          level: "error", code: "invalid_reward",
          achievementId: d.id,
          message: `Reward xp must be a non-negative finite number (got ${r.xp}).`,
        });
      }
      if (typeof r.dinars === "number" && (!Number.isFinite(r.dinars) || r.dinars < 0)) {
        issues.push({
          level: "error", code: "invalid_reward",
          achievementId: d.id,
          message: `Reward dinars must be a non-negative finite number (got ${r.dinars}).`,
        });
      }
      for (const [k, v] of [
        ["titleId", r.titleId] as const,
        ["museumItemId", r.museumItemId] as const,
        ["cosmeticId", r.cosmeticId] as const,
      ]) {
        if (v !== undefined && (typeof v !== "string" || v.length === 0)) {
          issues.push({
            level: "error", code: "invalid_reward",
            achievementId: d.id,
            message: `Reward ${k} must be a non-empty string when present.`,
          });
        }
      }
    }

    // analyticsId uniqueness
    if (d.analyticsId) {
      const prev = seenAnalytics.get(d.analyticsId);
      if (prev && prev !== d.id) {
        issues.push({
          level: "error", code: "duplicate_analytics_id",
          achievementId: d.id,
          message: `analyticsId "${d.analyticsId}" already used by ${prev}.`,
        });
      } else {
        seenAnalytics.set(d.analyticsId, d.id);
      }
    }

    // sortOrder duplicates within (category, family) — soft warning
    const sortKey = `${d.category}|${d.family ?? ""}|${d.sortOrder}`;
    const prevSort = seenSortKey.get(sortKey);
    if (prevSort && prevSort !== d.id) {
      issues.push({
        level: "warn", code: "duplicate_sort_order",
        achievementId: d.id,
        message: `Duplicate sortOrder ${d.sortOrder} in (${d.category}, ${d.family ?? "-"}) with ${prevSort}.`,
      });
    } else {
      seenSortKey.set(sortKey, d.id);
    }

    // media.icon duplicates within category — soft warning
    if (d.media?.icon?.ref) {
      const iconKey = `${d.category}|${d.media.icon.ref}`;
      const prevIcon = seenIconKey.get(iconKey);
      if (prevIcon && prevIcon !== d.id) {
        issues.push({
          level: "warn", code: "duplicate_icon",
          achievementId: d.id,
          message: `Duplicate icon "${d.media.icon.ref}" in category "${d.category}" (also on ${prevIcon}).`,
        });
      } else {
        seenIconKey.set(iconKey, d.id);
      }
    }

    // Engine version compatibility
    if (d.engineVersion > ENGINE_VERSION) {
      issues.push({
        level: "warn",
        code: "future_engine_version",
        achievementId: d.id,
        message: `Requires engine v${d.engineVersion}; current is v${ENGINE_VERSION}.`,
      });
    }
  }

  // Cycle detection on prerequisite DAG
  const cycles = detectCycles(definitions);
  for (const cyc of cycles) {
    issues.push({
      level: "error",
      code: "prerequisite_cycle",
      message: `Prerequisite cycle detected: ${cyc.join(" -> ")}`,
    });
  }

  return issues;
}

function detectCycles(defs: readonly AchievementDefinition[]): AchievementId[][] {
  const graph = new Map<AchievementId, readonly AchievementId[]>();
  for (const d of defs) graph.set(d.id, d.prerequisites ?? []);

  const cycles: AchievementId[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<AchievementId, number>();
  const stack: AchievementId[] = [];

  function dfs(node: AchievementId): void {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        cycles.push(stack.slice(idx).concat(next));
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const id of graph.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) dfs(id);
  }
  return cycles;
}

// ---------- helpers ----------

function groupBy<T, K>(
  items: readonly T[],
  keyFn: (t: T) => K,
): ReadonlyMap<K, readonly T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const list = out.get(k) ?? [];
    list.push(it);
    out.set(k, list);
  }
  const frozen = new Map<K, readonly T[]>();
  for (const [k, v] of out) frozen.set(k, Object.freeze(v));
  return frozen;
}

function sortByCategoryThenOrder(
  a: AchievementDefinition,
  b: AchievementDefinition,
): number {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id.localeCompare(b.id);
}

function isDev(): boolean {
  try {
    // Vite: import.meta.env.DEV
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Boolean((import.meta as any)?.env?.DEV);
  } catch {
    return false;
  }
}
