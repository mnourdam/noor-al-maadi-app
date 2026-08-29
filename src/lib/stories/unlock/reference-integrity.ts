// ============================================================
// Stories — unlock reference integrity (V16, client/admin-side)
// ------------------------------------------------------------
// Authoring guard for the exact failure that shipped in V15:
//
//   story_abu_abdullah_al_saghir required
//   entity_discovered → 10fc1316… which had been DISABLED by an
//   encyclopedia de-duplication merge. The unlock evaluator still
//   honoured the reference, so the prerequisite rendered as a raw
//   UUID and its CTA landed on "لم نصل إلى هذا المحتوى بعد".
//
// Pure functions — no backend change, no RPC signature change. The
// admin editor resolves the referenced ids and renders the findings
// beside the existing story-health panel, so the bad authoring path
// is visible BEFORE publishing.
// ============================================================

export type UnlockRefProblem = "missing" | "disabled";

export interface UnlockEntityRefFinding {
  entityId: string;
  problem: UnlockRefProblem;
  /** Canonical replacement id, when the disabled row was merged away. */
  canonicalId?: string | null;
}

/** id → { enabled, canonicalId } for every referenced encyclopedia entity. */
export interface EntityRefIndex {
  [entityId: string]: { enabled: boolean; canonicalId?: string | null } | undefined;
}

/**
 * Collect every encyclopedia entity id referenced by an unlock spec.
 * Works on the v2 envelope (`{version, expr}`), a bare node, and the
 * legacy `children` shape. Never throws.
 */
export function collectUnlockEntityRefs(spec: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (v: unknown) => {
    const id = typeof v === "string" ? v.trim() : "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    const n = node as Record<string, unknown>;
    const type = typeof n.type === "string" ? n.type : "";
    if (type === "entity_discovered") push(n.entity_id);
    if (type === "entities_discovered" && Array.isArray(n.ids)) {
      for (const id of n.ids) push(id);
    }
    walk(n.expr, depth + 1);
    walk(n.of, depth + 1);
    walk(n.children, depth + 1);
    walk(n.child, depth + 1);
  };

  walk(spec, 0);
  return out;
}

/**
 * Report every referenced entity that is missing from, or disabled in,
 * the encyclopedia. Unknown ids (absent from the index) are reported as
 * `missing` — fail closed.
 */
export function checkUnlockEntityReferences(
  spec: unknown,
  index: EntityRefIndex,
): UnlockEntityRefFinding[] {
  const findings: UnlockEntityRefFinding[] = [];
  for (const entityId of collectUnlockEntityRefs(spec)) {
    const row = index[entityId];
    if (!row) {
      findings.push({ entityId, problem: "missing" });
      continue;
    }
    if (!row.enabled) {
      findings.push({
        entityId,
        problem: "disabled",
        canonicalId: row.canonicalId ?? null,
      });
    }
  }
  return findings;
}

/** Arabic, admin-facing description of a single finding. */
export function describeUnlockRefFinding(
  f: UnlockEntityRefFinding,
  storyLabel?: string,
): string {
  const who = storyLabel ? `القصة «${storyLabel}»: ` : "";
  const what =
    f.problem === "missing"
      ? "مرجع موسوعة غير موجود"
      : "مرجع موسوعة معطَّل (غير منشور)";
  const fix = f.canonicalId ? ` — البديل المعتمد: ${f.canonicalId}` : "";
  return `${who}${what} — ${f.entityId}${fix}`;
}
