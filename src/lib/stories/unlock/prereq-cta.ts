// ============================================================
// Stories — prerequisite CTA canonicalization (V16, pure)
// ------------------------------------------------------------
// A locked-story prerequisite must never send the player to an
// encyclopedia row that was disabled by a de-duplication merge
// (the V15 "لم نصل إلى هذا المحتوى بعد" dead end).
//
// Rules
//   * canonical + enabled ref            → navigate to it as-is;
//   * disabled duplicate with canonical  → navigate to the canonical
//     replacement (metadata.canonical_id / merged_into / …);
//   * missing / unresolvable / disabled without a valid replacement
//                                        → NO actionable CTA.
//   * an already-canonical ref is NEVER rewritten back to a duplicate.
//
// Pure: the entity lookup is injected so both runtime and tests use
// the exact same decision function.
// ============================================================

export interface CtaEntityRow {
  id: string;
  enabled?: boolean;
  title?: string | null;
  slug?: string | null;
  entity_type?: string | null;
  metadata?: unknown;
}

export type EntityLookup = (id: string) => CtaEntityRow | null | undefined;

export interface CanonicalCtaResult {
  /** Entity id safe to navigate to, or null when no safe target exists. */
  targetId: string | null;
  /** Title of the resolved destination, when locally known. */
  title: string | null;
  /** Canonical entity type of the destination, when locally known. */
  entityType: string | null;
  /** Canonical slug of the destination, when locally known. */
  slug: string | null;
  /**
   * Shortest canonical path for the destination. State entities go straight
   * to the dedicated state route (no generic-entity redirect hop); every
   * other type keeps the normal entity route.
   */
  path: string | null;
  reason: "canonical" | "redirected" | "missing" | "disabled";
}

function buildResult(
  row: CtaEntityRow,
  fallbackId: string,
  reason: "canonical" | "redirected",
): CanonicalCtaResult {
  const targetId = row.id ?? fallbackId;
  const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
  const entityType = typeof row.entity_type === "string" ? row.entity_type : null;
  const path = entityType === "state" && slug
    ? `/encyclopedia/state/${slug}`
    : `/encyclopedia/entity/${targetId}`;
  return { targetId, title: row.title ?? null, entityType, slug, path, reason };
}

const NO_TARGET = (reason: "missing" | "disabled"): CanonicalCtaResult => ({
  targetId: null,
  title: null,
  entityType: null,
  slug: null,
  path: null,
  reason,
});

const REDIRECT_KEYS = ["canonical_id", "merged_into", "converted_to", "redirect_to"] as const;

function redirectTarget(row: CtaEntityRow | null | undefined): string | null {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object"
    ? (row.metadata as Record<string, unknown>)
    : null;
  if (!meta) return null;
  for (const key of REDIRECT_KEYS) {
    const v = meta[key];
    if (typeof v === "string" && v.trim() && v.trim() !== row.id) return v.trim();
  }
  return null;
}

/**
 * Resolve a prerequisite entity ref to a SAFE navigation target.
 * Never throws; unknown refs fail closed (no CTA).
 */
export function resolveCanonicalCtaTarget(
  rawRef: string,
  lookup: EntityLookup,
): CanonicalCtaResult {
  const ref = String(rawRef ?? "").trim();
  if (!ref) return { targetId: null, title: null, reason: "missing" };

  let row: CtaEntityRow | null | undefined;
  try { row = lookup(ref); } catch { row = null; }
  if (!row) return { targetId: null, title: null, reason: "missing" };

  if (row.enabled !== false) {
    return { targetId: row.id ?? ref, title: row.title ?? null, reason: "canonical" };
  }

  // Disabled row — follow the merge chain to an enabled canonical replacement.
  const seen = new Set<string>([row.id ?? ref]);
  let cur: CtaEntityRow = row;
  for (let hops = 0; hops < 8; hops++) {
    const nextId = redirectTarget(cur);
    if (!nextId || seen.has(nextId)) break;
    seen.add(nextId);
    let next: CtaEntityRow | null | undefined;
    try { next = lookup(nextId); } catch { next = null; }
    if (!next) break;
    if (next.enabled !== false) {
      return { targetId: next.id ?? nextId, title: next.title ?? null, reason: "redirected" };
    }
    cur = next;
  }
  return { targetId: null, title: null, reason: "disabled" };
}
