// ============================================================
// Stories M3 — Unlock Spec v2 validator (shared)
// ------------------------------------------------------------
// Fail-closed structural validator. Used by:
//   * importer preview / apply
//   * admin builder (before persist)
//   * server evaluator (mirrored in SQL)
//   * offline evaluator (client)
// Determinism: same input → same errors, same order.
// ============================================================

import {
  UNLOCK_LIMITS,
  UNLOCK_NODE_TYPES,
  type UnlockNode,
  type UnlockNodeType,
  type UnlockSpecV2,
  type UnlockValidationError,
  type UnlockValidationResult,
} from "./spec";

const NODE_TYPES: ReadonlySet<string> = new Set(UNLOCK_NODE_TYPES);

const LEAF_ID_FIELD: Partial<Record<UnlockNodeType, string>> = {
  story_complete: "story_id",
  campaign_complete: "campaign_id",
  investigation_complete: "investigation_id",
  achievement_earned: "achievement_id",
};

const ALLOWED_FIELDS: Record<UnlockNodeType, ReadonlySet<string>> = {
  always: new Set(["type"]),
  never: new Set(["type"]),
  all_of: new Set(["type", "children"]),
  any_of: new Set(["type", "children"]),
  not: new Set(["type", "child"]),
  story_complete: new Set(["type", "story_id"]),
  campaign_complete: new Set(["type", "campaign_id"]),
  investigation_complete: new Set(["type", "investigation_id"]),
  achievement_earned: new Set(["type", "achievement_id"]),
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a candidate value as a well-formed Unlock Spec v2.
 * Always inspects the entire tree so the importer can report
 * every error in one pass. `ok` is true only when there are
 * zero errors AND every structural bound is respected.
 */
export function validateUnlockSpec(input: unknown): UnlockValidationResult {
  const errors: UnlockValidationError[] = [];
  let nodeCount = 0;
  let maxDepth = 0;

  const push = (code: UnlockValidationError["code"], path: string, message: string) => {
    errors.push({ code, path, message });
  };

  if (!isPlainObject(input)) {
    push("not_an_object", "$", "Unlock spec must be a JSON object.");
    return { ok: false, errors, nodeCount, depth: maxDepth };
  }
  if (input.v !== 2) {
    push("wrong_version", "$.v", `Unlock spec version must be 2 (got ${JSON.stringify(input.v)}).`);
  }
  if (!("rule" in input)) {
    push("missing_rule", "$.rule", "Unlock spec is missing 'rule'.");
    return { ok: false, errors, nodeCount, depth: maxDepth };
  }

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > UNLOCK_LIMITS.MAX_DEPTH) {
      push("depth_exceeded", path, `Nesting depth exceeds ${UNLOCK_LIMITS.MAX_DEPTH}.`);
      return;
    }
    if (!isPlainObject(node)) {
      push("not_an_object_node", path, "Node must be a JSON object.");
      return;
    }
    nodeCount += 1;
    if (nodeCount > UNLOCK_LIMITS.MAX_NODES) {
      push("node_count_exceeded", path, `Node count exceeds ${UNLOCK_LIMITS.MAX_NODES}.`);
      return;
    }
    const rawType = node.type;
    if (typeof rawType !== "string" || rawType.length === 0) {
      push("missing_type", `${path}.type`, "Node is missing 'type'.");
      return;
    }
    if (!NODE_TYPES.has(rawType)) {
      push("unknown_type", `${path}.type`, `Unknown node type '${rawType}'.`);
      return;
    }
    const type = rawType as UnlockNodeType;
    const allowed = ALLOWED_FIELDS[type];
    for (const key of Object.keys(node)) {
      if (!allowed.has(key)) {
        push("extra_fields", `${path}.${key}`, `Field '${key}' is not allowed on '${type}' nodes.`);
      }
    }

    switch (type) {
      case "always":
      case "never":
        return;
      case "all_of":
      case "any_of": {
        if (!("children" in node)) {
          push("missing_children", `${path}.children`, `'${type}' requires 'children'.`);
          return;
        }
        const children = node.children;
        if (!Array.isArray(children)) {
          push("children_not_array", `${path}.children`, `'${type}.children' must be an array.`);
          return;
        }
        if (children.length === 0) {
          push("empty_children_forbidden", `${path}.children`, `'${type}.children' must not be empty.`);
          return;
        }
        children.forEach((c, i) => walk(c, `${path}.children[${i}]`, depth + 1));
        return;
      }
      case "not": {
        if (!("child" in node)) {
          push("missing_child", `${path}.child`, "'not' requires 'child'.");
          return;
        }
        walk(node.child, `${path}.child`, depth + 1);
        return;
      }
      default: {
        const idField = LEAF_ID_FIELD[type]!;
        if (!(idField in node)) {
          push("missing_id_field", `${path}.${idField}`, `'${type}' requires '${idField}'.`);
          return;
        }
        const v = (node as Record<string, unknown>)[idField];
        if (typeof v !== "string") {
          push("id_not_string", `${path}.${idField}`, `'${idField}' must be a string.`);
          return;
        }
        if (v.trim().length === 0) {
          push("id_empty", `${path}.${idField}`, `'${idField}' must not be empty.`);
        }
      }
    }
  };

  walk((input as { rule: unknown }).rule, "$.rule", 1);

  return { ok: errors.length === 0, errors, nodeCount, depth: maxDepth };
}

/** Narrowing helper: returns the typed spec, or throws with a joined error message. */
export function parseUnlockSpec(input: unknown): UnlockSpecV2 {
  const r = validateUnlockSpec(input);
  if (!r.ok) {
    throw new Error(
      `invalid_unlock_spec: ${r.errors.map((e) => `${e.path} ${e.code}`).join("; ")}`,
    );
  }
  return input as UnlockSpecV2;
}

/** Depth-aware walk over an already-validated tree (leaves included). */
export function walkUnlockNodes(spec: UnlockSpecV2, visit: (n: UnlockNode) => void): void {
  const stack: UnlockNode[] = [spec.rule];
  while (stack.length > 0) {
    const n = stack.pop()!;
    visit(n);
    if (n.type === "all_of" || n.type === "any_of") stack.push(...n.children);
    else if (n.type === "not") stack.push(n.child);
  }
}
