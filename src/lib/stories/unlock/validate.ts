// ============================================================
// Stories M3 — Unlock Spec v2 validator (FROZEN CONTRACT)
// ------------------------------------------------------------
// Fail-closed structural validator. Envelope: { version:2, expr }.
// Logical vocabulary: all / any (children in "of"), not (child).
// Leaves per spec.ts. Any deviation → error.
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
  entity_discovered: "entity_id",
  artifact_owned: "artifact_id",
  atlas_location_visited: "location_id",
  achievement_unlocked: "achievement_id",
};

const ALLOWED_FIELDS: Record<UnlockNodeType, ReadonlySet<string>> = {
  all: new Set(["type", "of"]),
  any: new Set(["type", "of"]),
  not: new Set(["type", "child"]),
  always: new Set(["type"]),
  campaign_complete: new Set(["type", "campaign_id"]),
  campaign_chapter_complete: new Set(["type", "campaign_id", "chapter_id"]),
  investigation_complete: new Set(["type", "investigation_id"]),
  entity_discovered: new Set(["type", "entity_id"]),
  entities_discovered: new Set(["type", "ids", "min"]),
  artifact_owned: new Set(["type", "artifact_id"]),
  atlas_location_visited: new Set(["type", "location_id"]),
  achievement_unlocked: new Set(["type", "achievement_id"]),
  player_level: new Set(["type", "min"]),
  story_complete: new Set(["type", "story_id"]),
  date_window: new Set(["type", "start", "end"]),
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIsoDateString(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

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
  if (input.version !== 2) {
    push("wrong_version", "$.version", `Unlock spec version must be 2 (got ${JSON.stringify(input.version)}).`);
  }
  if (!("expr" in input)) {
    push("missing_expr", "$.expr", "Unlock spec is missing 'expr'.");
    return { ok: false, errors, nodeCount, depth: maxDepth };
  }

  const requireIdString = (
    node: Record<string, unknown>,
    field: string,
    path: string,
    type: UnlockNodeType,
  ): void => {
    if (!(field in node)) {
      push("missing_id_field", `${path}.${field}`, `'${type}' requires '${field}'.`);
      return;
    }
    const v = node[field];
    if (typeof v !== "string") {
      push("id_not_string", `${path}.${field}`, `'${field}' must be a string.`);
      return;
    }
    if (v.trim().length === 0) {
      push("id_empty", `${path}.${field}`, `'${field}' must not be empty.`);
    }
  };

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
        return;
      case "all":
      case "any": {
        if (!("of" in node)) {
          push("missing_of", `${path}.of`, `'${type}' requires 'of'.`);
          return;
        }
        const kids = node.of;
        if (!Array.isArray(kids)) {
          push("of_not_array", `${path}.of`, `'${type}.of' must be an array.`);
          return;
        }
        if (kids.length === 0) {
          push("empty_of_forbidden", `${path}.of`, `'${type}.of' must not be empty.`);
          return;
        }
        kids.forEach((c, i) => walk(c, `${path}.of[${i}]`, depth + 1));
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
      case "campaign_chapter_complete": {
        requireIdString(node, "campaign_id", path, type);
        requireIdString(node, "chapter_id", path, type);
        return;
      }
      case "entities_discovered": {
        if (!("ids" in node) || !Array.isArray(node.ids)) {
          push("ids_not_array", `${path}.ids`, `'entities_discovered' requires 'ids' array.`);
        } else {
          const ids = node.ids as unknown[];
          if (ids.length === 0) {
            push("ids_empty", `${path}.ids`, `'ids' must not be empty.`);
          }
          ids.forEach((v, i) => {
            if (typeof v !== "string" || v.trim().length === 0) {
              push("ids_item_not_string", `${path}.ids[${i}]`, `'ids[${i}]' must be a non-empty string.`);
            }
          });
        }
        if (!("min" in node)) {
          push("missing_id_field", `${path}.min`, `'entities_discovered' requires 'min'.`);
        } else if (typeof node.min !== "number" || !Number.isInteger(node.min)) {
          push("min_not_integer", `${path}.min`, `'min' must be an integer.`);
        } else if (
          node.min < 1 ||
          (Array.isArray(node.ids) && node.min > (node.ids as unknown[]).length)
        ) {
          push("min_out_of_range", `${path}.min`, `'min' must be between 1 and ids.length.`);
        }
        return;
      }
      case "player_level": {
        if (!("min" in node)) {
          push("missing_id_field", `${path}.min`, `'player_level' requires 'min'.`);
        } else if (typeof node.min !== "number" || !Number.isInteger(node.min)) {
          push("min_not_integer", `${path}.min`, `'min' must be an integer.`);
        } else if (node.min < 1) {
          push("min_out_of_range", `${path}.min`, `'min' must be >= 1.`);
        }
        return;
      }
      case "date_window": {
        const hasStart = "start" in node && node.start !== undefined;
        const hasEnd = "end" in node && node.end !== undefined;
        if (!hasStart && !hasEnd) {
          push("date_window_empty", `${path}`, `'date_window' requires 'start' and/or 'end'.`);
          return;
        }
        if (hasStart && !isIsoDateString(node.start)) {
          push("date_not_string", `${path}.start`, `'start' must be an ISO date string.`);
        }
        if (hasEnd && !isIsoDateString(node.end)) {
          push("date_not_string", `${path}.end`, `'end' must be an ISO date string.`);
        }
        return;
      }
      default: {
        const idField = LEAF_ID_FIELD[type];
        if (!idField) return;
        requireIdString(node, idField, path, type);
      }
    }
  };

  walk((input as { expr: unknown }).expr, "$.expr", 1);

  return { ok: errors.length === 0, errors, nodeCount, depth: maxDepth };
}

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
  const stack: UnlockNode[] = [spec.expr];
  while (stack.length > 0) {
    const n = stack.pop()!;
    visit(n);
    if (n.type === "all" || n.type === "any") stack.push(...n.of);
    else if (n.type === "not") stack.push(n.child);
  }
}
