// ============================================================
// Stories M3 — story_complete cycle detection
// ------------------------------------------------------------
// The importer must never accept a batch that would make story
// A require story B and story B require story A (directly or
// transitively). The runtime evaluator would still terminate
// (nothing satisfies a cycle → all involved stories are locked
// forever), but that is a silent authoring bug we want to
// surface at import time.
//
// Strategy: classic iterative DFS with three-colour marks
// (white / grey / black). Grey → grey re-entry = cycle.
// Returns every cycle found (deterministic order) so the
// importer can report all of them in one pass.
// ============================================================

import { normalizeUnlockSpec } from "./normalize";
import { walkUnlockNodes } from "./validate";

export interface UnlockCycle {
  /** Story ids forming the cycle, in traversal order, ending on the repeat. */
  path: string[];
}

/** Extract every `story_complete` dependency from an unknown spec. */
export function extractStoryDeps(input: unknown): string[] {
  const spec = normalizeUnlockSpec(input);
  const out = new Set<string>();
  walkUnlockNodes(spec, (n) => {
    if (n.type === "story_complete") out.add(n.story_id);
  });
  return Array.from(out).sort();
}

/**
 * Detect every story_complete cycle in a candidate batch.
 * `stories` maps story id → its raw (v1 or v2) unlock_spec.
 * Stories not present in the map are treated as leaves (their
 * external deps are outside the batch scope).
 */
export function detectUnlockCycles(
  stories: ReadonlyMap<string, unknown>,
): UnlockCycle[] {
  const adj = new Map<string, string[]>();
  for (const [id, spec] of stories) adj.set(id, extractStoryDeps(spec).filter((d) => stories.has(d)));



  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: UnlockCycle[] = [];
  const seenCycleKeys = new Set<string>();

  const ids = Array.from(stories.keys()).sort(); // deterministic

  for (const start of ids) {
    if (color.get(start) === BLACK) continue;
    const stack: Array<{ id: string; iter: number }> = [{ id: start, iter: 0 }];
    color.set(start, GREY);
    parent.set(start, null);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = adj.get(frame.id) ?? [];
      if (frame.iter >= neighbours.length) {
        color.set(frame.id, BLACK);
        stack.pop();
        continue;
      }
      const next = neighbours[frame.iter];
      frame.iter += 1;
      const c = color.get(next) ?? WHITE;
      if (c === WHITE) {
        color.set(next, GREY);
        parent.set(next, frame.id);
        stack.push({ id: next, iter: 0 });
      } else if (c === GREY) {
        // Rebuild the cycle path: walk stack backwards until we hit `next`.
        const path: string[] = [];
        for (let i = stack.length - 1; i >= 0; i--) {
          path.push(stack[i].id);
          if (stack[i].id === next) break;
        }
        path.reverse();
        path.push(next);
        // Deduplicate cycles by their sorted-id signature so the
        // same loop found from different starts isn't reported twice.
        const key = [...new Set(path)].sort().join("|");
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push({ path });
        }
      }
      // BLACK: already fully explored, no cycle through here.
    }
  }

  return cycles;
}
