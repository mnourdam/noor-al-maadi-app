// Reusable crossword integrity validator.
// Single source of truth — used by the schema (import) and the renderer.
// Verifies bounds, overlapping intersections, and basic answer sanity.
import type { CrosswordStage } from "./types";

export interface CrosswordIssue {
  path: string;
  message: string;
}

export function validateCrosswordStage(stage: CrosswordStage): CrosswordIssue[] {
  const issues: CrosswordIssue[] = [];
  if (!stage || !Array.isArray(stage.clues) || stage.clues.length === 0) {
    issues.push({ path: "clues", message: "لا توجد تلميحات." });
    return issues;
  }

  const cells = new Map<string, { letter: string; from: number }>();
  stage.clues.forEach((clue, ci) => {
    const path = `clues[${ci}]`;
    if (!clue.answer || clue.answer.length === 0) {
      issues.push({ path: `${path}.answer`, message: "الإجابة فارغة." });
      return;
    }
    for (let i = 0; i < clue.answer.length; i++) {
      const r = clue.direction === "down" ? clue.row + i : clue.row;
      const c = clue.direction === "across" ? clue.col + i : clue.col;
      if (r < 0 || c < 0 || r >= stage.rows || c >= stage.cols) {
        issues.push({ path, message: `الإجابة تتجاوز حدود الشبكة عند (${r},${c}).` });
        continue;
      }
      const key = `${r}-${c}`;
      const ch = clue.answer[i];
      const existing = cells.get(key);
      if (!existing) {
        cells.set(key, { letter: ch, from: ci });
      } else if (existing.letter !== ch) {
        issues.push({
          path,
          message: `تعارض في الخانة (${r},${c}) بين "${existing.letter}" (من clues[${existing.from}]) و"${ch}".`,
        });
      }
    }
  });

  return issues;
}

export function isCrosswordValid(stage: CrosswordStage): boolean {
  return validateCrosswordStage(stage).length === 0;
}
