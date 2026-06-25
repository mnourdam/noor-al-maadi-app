// Reusable crossword integrity validator.
// Single source of truth — used by the schema (import) and the renderer.
// Verifies bounds, overlapping intersections, and basic answer sanity.
// CRITICAL: answer text is sacred — never mutated to fit the grid. Any
// intersection mismatch must be reported as a hard error during validation.
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
      issues.push({ path: `${path}.answer`, message: `الإجابة فارغة في clues[${ci}].` });
      return;
    }
    // Bounds: check the full word footprint, not letter-by-letter.
    const endR = clue.direction === "down" ? clue.row + clue.answer.length - 1 : clue.row;
    const endC = clue.direction === "across" ? clue.col + clue.answer.length - 1 : clue.col;
    if (clue.row < 0 || clue.col < 0 || endR >= stage.rows || endC >= stage.cols) {
      issues.push({
        path,
        message: `الكلمة (${clue.answer}) تتجاوز حدود الشبكة (${stage.rows}×${stage.cols}) عند الصف ${clue.row} والعمود ${clue.col}.`,
      });
      return;
    }
    for (let i = 0; i < clue.answer.length; i++) {
      const r = clue.direction === "down" ? clue.row + i : clue.row;
      const c = clue.direction === "across" ? clue.col + i : clue.col;
      const key = `${r}-${c}`;
      const ch = clue.answer[i];
      const existing = cells.get(key);
      if (!existing) {
        cells.set(key, { letter: ch, from: ci });
      } else if (existing.letter !== ch) {
        const other = stage.clues[existing.from];
        issues.push({
          path,
          message: `تعارض في تقاطع الكلمات: الكلمة (${clue.answer}) لا توافق الكلمة (${other.answer}) عند الصف ${r} والعمود ${c}.`,
        });
      }
    }
  });

  return issues;
}

export function isCrosswordValid(stage: CrosswordStage): boolean {
  return validateCrosswordStage(stage).length === 0;
}
