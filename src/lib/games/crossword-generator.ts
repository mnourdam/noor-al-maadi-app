// Irth Crossword Generator
// Builds valid crossword envelopes that pass `validateCrosswordStage`.
// Algorithm: place the longest word first (horizontal), then for each
// remaining word try every letter intersection with already-placed letters.
// Reject placements that conflict, create illegal adjacencies, or overflow.
// Retries with progressively larger grids if needed.

import type { CrosswordClue, CrosswordStage, GameEnvelope } from "./types";
import { validateCrosswordStage } from "./crossword-validate";

export interface WordHint {
  word: string;
  hint: string;
  related?: string;
}

export interface GeneratorOptions {
  rows?: number;
  cols?: number;
  maxGrid?: number;
  seed?: number;
  shuffle?: boolean;
  /** Allow placing a word in an isolated area if no intersection is possible. Default: true. */
  allowIsolated?: boolean;
  /** Require every word to be connected to the main grid. Default: false. */
  requireConnected?: boolean;
}

export interface UnplacedDetail {
  word: string;
  reason: "no_shared_letter" | "letter_conflict" | "out_of_bounds" | "adjacency" | "no_space_left";
}

export interface GeneratedCrossword {
  ok: true;
  stage: CrosswordStage;
  placed: number;
  gridSize: number;
}
export interface GeneratorError {
  ok: false;
  error: string;
  placed: number;
  missing: string[];
  details: UnplacedDetail[];
  attemptedSize: number;
}
export type GeneratorResult = GeneratedCrossword | GeneratorError;

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/**
 * Normalize Arabic word for grid placement and matching.
 * - strips tatweel and diacritics
 * - removes whitespace and the convenience `_` separator (underscore = space)
 * - unifies hamza variants: أ إ آ → ا (validator compares letters strictly,
 *   so we must store the unified form in the stored answer too — otherwise
 *   an intersection between أرقم and ابن would be flagged as a conflict).
 *   ة and ى are left intact (validator does not normalize them).
 */
export function normalizeArabicWord(word: string): string {
  return (word ?? "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[ـ]/g, "")
    .replace(/[_\s]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .trim();
}

type Direction = "across" | "down";
type Grid = (string | null)[][];

function makeGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array<string | null>(cols).fill(null));
}

export function canPlaceWord(
  grid: Grid,
  word: string,
  row: number,
  col: number,
  direction: Direction,
  isFirst = false,
): { ok: boolean; intersections: number } {
  const rows = grid.length;
  const cols = grid[0].length;
  const len = word.length;
  const endR = direction === "down" ? row + len - 1 : row;
  const endC = direction === "across" ? col + len - 1 : col;
  if (row < 0 || col < 0 || endR >= rows || endC >= cols) {
    return { ok: false, intersections: 0 };
  }
  // Cell before / after must be empty (prevents word-merging).
  const beforeR = direction === "down" ? row - 1 : row;
  const beforeC = direction === "across" ? col - 1 : col;
  const afterR = direction === "down" ? endR + 1 : row;
  const afterC = direction === "across" ? endC + 1 : col;
  if (
    beforeR >= 0 && beforeC >= 0 && beforeR < rows && beforeC < cols &&
    grid[beforeR][beforeC] !== null
  ) return { ok: false, intersections: 0 };
  if (
    afterR >= 0 && afterC >= 0 && afterR < rows && afterC < cols &&
    grid[afterR][afterC] !== null
  ) return { ok: false, intersections: 0 };

  let intersections = 0;
  for (let i = 0; i < len; i++) {
    const r = direction === "down" ? row + i : row;
    const c = direction === "across" ? col + i : col;
    const ch = word[i];
    const existing = grid[r][c];
    if (existing !== null) {
      if (existing !== ch) return { ok: false, intersections: 0 };
      intersections++;
    } else {
      // Adjacent perpendicular cells must be empty unless that cell IS an
      // intersection (covered by `existing !== null` branch above).
      if (direction === "across") {
        if (r - 1 >= 0 && grid[r - 1][c] !== null) return { ok: false, intersections: 0 };
        if (r + 1 < rows && grid[r + 1][c] !== null) return { ok: false, intersections: 0 };
      } else {
        if (c - 1 >= 0 && grid[r][c - 1] !== null) return { ok: false, intersections: 0 };
        if (c + 1 < cols && grid[r][c + 1] !== null) return { ok: false, intersections: 0 };
      }
    }
  }
  if (!isFirst && intersections === 0) return { ok: false, intersections: 0 };
  return { ok: true, intersections };
}

export function placeWord(
  grid: Grid,
  word: string,
  row: number,
  col: number,
  direction: Direction,
): void {
  for (let i = 0; i < word.length; i++) {
    const r = direction === "down" ? row + i : row;
    const c = direction === "across" ? col + i : col;
    grid[r][c] = word[i];
  }
}

interface PlacedRecord {
  word: string;
  hint: string;
  related?: string;
  row: number;
  col: number;
  direction: Direction;
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tryGenerate(
  words: WordHint[],
  rows: number,
  cols: number,
  rng: () => number,
  allowIsolated: boolean,
): { placed: PlacedRecord[]; missing: { item: WordHint; reason: UnplacedDetail["reason"] }[] } {
  const grid = makeGrid(rows, cols);
  const placed: PlacedRecord[] = [];
  const missing: { item: WordHint; reason: UnplacedDetail["reason"] }[] = [];

  // Sort by length desc; shuffle ties for variety.
  const sorted = [...words].sort(
    (a, b) => b.word.length - a.word.length || (rng() - 0.5),
  );

  // First word: horizontal, centered.
  const first = sorted.shift();
  if (!first) return { placed, missing };
  const firstRow = Math.floor(rows / 2);
  const firstCol = Math.max(0, Math.floor((cols - first.word.length) / 2));
  const firstCheck = canPlaceWord(grid, first.word, firstRow, firstCol, "across", true);
  if (!firstCheck.ok) {
    return { placed, missing: [first, ...sorted].map((w) => ({ item: w, reason: "out_of_bounds" as const })) };
  }
  placeWord(grid, first.word, firstRow, firstCol, "across");
  placed.push({ ...first, row: firstRow, col: firstCol, direction: "across" });

  for (const item of sorted) {
    type Cand = { row: number; col: number; direction: Direction; score: number };
    const candidates: Cand[] = [];
    let sawSharedLetter = false;
    for (let i = 0; i < item.word.length; i++) {
      const ch = item.word[i];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== ch) continue;
          sawSharedLetter = true;
          {
            const check = canPlaceWord(grid, item.word, r, c - i, "across");
            if (check.ok) candidates.push({ row: r, col: c - i, direction: "across", score: check.intersections });
          }
          {
            const check = canPlaceWord(grid, item.word, r - i, c, "down");
            if (check.ok) candidates.push({ row: r - i, col: c, direction: "down", score: check.intersections });
          }
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score || (rng() - 0.5));
      const pick = candidates[0];
      placeWord(grid, item.word, pick.row, pick.col, pick.direction);
      placed.push({ ...item, row: pick.row, col: pick.col, direction: pick.direction });
      continue;
    }

    // Fallback: isolated placement (no intersection) in empty area.
    if (allowIsolated) {
      const isoCandidates: Cand[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (const dir of ["across", "down"] as Direction[]) {
            const check = canPlaceWord(grid, item.word, r, c, dir, true);
            if (check.ok) isoCandidates.push({ row: r, col: c, direction: dir, score: 0 });
          }
        }
      }
      if (isoCandidates.length > 0) {
        // Pick a spot far from existing placements to avoid touching them.
        isoCandidates.sort(() => rng() - 0.5);
        const pick = isoCandidates[0];
        placeWord(grid, item.word, pick.row, pick.col, pick.direction);
        placed.push({ ...item, row: pick.row, col: pick.col, direction: pick.direction });
        continue;
      }
      missing.push({ item, reason: sawSharedLetter ? "adjacency" : "no_space_left" });
    } else {
      missing.push({ item, reason: sawSharedLetter ? "letter_conflict" : "no_shared_letter" });
    }
  }
  return { placed, missing };
}

function trimToBounds(placed: PlacedRecord[]): {
  records: PlacedRecord[];
  rows: number;
  cols: number;
} {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const p of placed) {
    const endR = p.direction === "down" ? p.row + p.word.length - 1 : p.row;
    const endC = p.direction === "across" ? p.col + p.word.length - 1 : p.col;
    minR = Math.min(minR, p.row);
    minC = Math.min(minC, p.col);
    maxR = Math.max(maxR, endR);
    maxC = Math.max(maxC, endC);
  }
  const records = placed.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }));
  return { records, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

function numberClues(records: PlacedRecord[]): CrosswordClue[] {
  // Numbering: sort by (row, col); cells that start a word share a number
  // if both across+down begin there.
  const startKey = (p: PlacedRecord) => `${p.row}-${p.col}`;
  const sorted = [...records].sort((a, b) => a.row - b.row || a.col - b.col);
  const numByKey = new Map<string, number>();
  let next = 1;
  for (const p of sorted) {
    const k = startKey(p);
    if (!numByKey.has(k)) numByKey.set(k, next++);
  }
  return sorted.map((p) => ({
    number: numByKey.get(startKey(p))!,
    direction: p.direction,
    row: p.row,
    col: p.col,
    answer: p.word,
    hint: p.hint,
    related: p.related,
  }));
}

const REASON_LABEL: Record<UnplacedDetail["reason"], string> = {
  no_shared_letter: "لا توجد حروف مشتركة مع الكلمات الموضوعة",
  letter_conflict: "تتعارض الحروف عند التقاطعات الممكنة",
  out_of_bounds: "تتجاوز حدود الشبكة",
  adjacency: "ملاصقة غير صحيحة لكلمات أخرى",
  no_space_left: "لا توجد مساحة كافية على الشبكة",
};

export function explainUnplaced(d: UnplacedDetail): string {
  return `${d.word}: ${REASON_LABEL[d.reason]}`;
}

export function generateCrossword(
  rawWords: WordHint[],
  options: GeneratorOptions = {},
): GeneratorResult {
  const allowIsolated = options.allowIsolated ?? true;
  const requireConnected = options.requireConnected ?? false;

  const cleaned = rawWords
    .map((w) => ({ ...w, word: normalizeArabicWord(w.word) }))
    .filter((w) => w.word.length >= 2 && w.hint.trim().length > 0);

  if (cleaned.length < 2) {
    return {
      ok: false,
      error: "أدخل كلمتين على الأقل مع تلميحاتها.",
      placed: 0,
      missing: rawWords.map((w) => w.word),
      details: [],
      attemptedSize: 0,
    };
  }
  // De-dup identical answers.
  const seen = new Set<string>();
  const unique: WordHint[] = [];
  for (const w of cleaned) {
    if (seen.has(w.word)) continue;
    seen.add(w.word);
    unique.push(w);
  }

  const longest = unique.reduce((m, w) => Math.max(m, w.word.length), 0);
  // Honor manual rows/cols when both provided; otherwise escalate.
  const manualRows = options.rows && options.rows > 0 ? options.rows : 0;
  const manualCols = options.cols && options.cols > 0 ? options.cols : 0;
  const manual = manualRows && manualCols;
  const sizeLadder = manual
    ? [Math.max(manualRows, manualCols)]
    : [12, 15, 18, 21, 25, 30]
        .filter((s) => s >= longest + 2)
        .filter((s) => !options.maxGrid || s <= options.maxGrid);
  if (sizeLadder.length === 0) sizeLadder.push(longest + 2);
  const seed = options.seed ?? 0xC0FFEE;

  let best:
    | { placed: PlacedRecord[]; missing: { item: WordHint; reason: UnplacedDetail["reason"] }[]; size: number }
    | null = null;

  for (const size of sizeLadder) {
    const rowsN = manual ? manualRows : size;
    const colsN = manual ? manualCols : size;
    for (let attempt = 0; attempt < 16; attempt++) {
      const rng = mulberry32(seed + size * 1000 + attempt);
      const result = tryGenerate(unique, rowsN, colsN, rng, allowIsolated);
      const candidate = { ...result, size };
      if (!best || result.placed.length > best.placed.length) best = candidate;
      if (result.missing.length === 0) break;
    }
    if (best && best.missing.length === 0) break;
  }

  if (!best || best.missing.length > 0) {
    const attemptedSize = best?.size ?? sizeLadder[sizeLadder.length - 1];
    const details: UnplacedDetail[] = (best?.missing ?? []).map((m) => ({ word: m.item.word, reason: m.reason }));
    return {
      ok: false,
      error: `لم نتمكن من وضع ${details.length} كلمة ضمن شبكة ${attemptedSize}×${attemptedSize}.`,
      placed: best?.placed.length ?? 0,
      missing: details.map((d) => d.word),
      details,
      attemptedSize,
    };
  }

  const { records, rows, cols } = trimToBounds(best.placed);

  if (requireConnected) {
    // BFS over placed cells; if any record is not reachable, fail.
    const cellMap = new Map<string, number[]>();
    records.forEach((p, idx) => {
      for (let i = 0; i < p.word.length; i++) {
        const r = p.direction === "down" ? p.row + i : p.row;
        const c = p.direction === "across" ? p.col + i : p.col;
        const key = `${r}-${c}`;
        if (!cellMap.has(key)) cellMap.set(key, []);
        cellMap.get(key)!.push(idx);
      }
    });
    const visited = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const idx = queue.shift()!;
      const p = records[idx];
      for (let i = 0; i < p.word.length; i++) {
        const r = p.direction === "down" ? p.row + i : p.row;
        const c = p.direction === "across" ? p.col + i : p.col;
        for (const other of cellMap.get(`${r}-${c}`) ?? []) {
          if (!visited.has(other)) { visited.add(other); queue.push(other); }
        }
      }
    }
    if (visited.size < records.length) {
      const orphans = records.filter((_, i) => !visited.has(i));
      return {
        ok: false,
        error: "بعض الكلمات غير متصلة بالشبكة الرئيسية.",
        placed: records.length - orphans.length,
        missing: orphans.map((o) => o.word),
        details: orphans.map((o) => ({ word: o.word, reason: "no_shared_letter" as const })),
        attemptedSize: best.size,
      };
    }
  }

  const clues = numberClues(records);
  const stage: CrosswordStage = { rows, cols, clues };
  const issues = validateCrosswordStage(stage);
  if (issues.length > 0) {
    return {
      ok: false,
      error: issues.map((i) => i.message).join(" • "),
      placed: records.length,
      missing: [],
      details: [],
      attemptedSize: best.size,
    };
  }
  return { ok: true, stage, placed: records.length, gridSize: best.size };
}



export interface CrosswordEnvelopeInput {
  slug: string;
  title: string;
  description?: string;
  difficulty: number;
  estimated_time: number;
  hearts_penalty?: number;
  xp: number;
  coins: number;
  era?: string;
  theme?: string;
  related_entities?: string[];
  max_attempts?: number;
  timer_seconds?: number;
  stage_title?: string;
}

export function buildCrosswordEnvelope(
  stage: CrosswordStage,
  input: CrosswordEnvelopeInput,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (input.era) metadata.era = input.era;
  if (input.theme) metadata.theme = input.theme;
  if (input.max_attempts !== undefined) metadata.max_attempts = input.max_attempts;
  if (input.timer_seconds !== undefined) metadata.timer_seconds = input.timer_seconds;

  const finalStage: CrosswordStage = input.stage_title
    ? { title: input.stage_title, ...stage }
    : stage;

  const envelope = {
    slug: input.slug,
    mode: "crossword",
    title: input.title,
    description: input.description,
    difficulty: input.difficulty,
    estimated_time: input.estimated_time,
    hearts_penalty: input.hearts_penalty ?? 1,
    related_entities: input.related_entities ?? [],
    metadata,
    stages: [finalStage],
    rewards: { xp: input.xp, coins: input.coins },
  };

  console.info("[crossword.trace] generator.return-json", {
    slug: envelope.slug,
    title: envelope.title,
    stageCount: envelope.stages.length,
  });

  return envelope;
}

export function validateCrosswordGame(
  game: Partial<GameEnvelope> & { stages?: unknown[] },
): string[] {
  const errors: string[] = [];
  if (game.mode !== "crossword") errors.push('الحقل mode يجب أن يكون "crossword".');
  if (!game.slug || !/^[a-z0-9][a-z0-9-]*$/i.test(game.slug)) errors.push("slug غير صالح.");
  if (!game.title) errors.push("العنوان مطلوب.");
  if (!Array.isArray(game.stages) || game.stages.length === 0) {
    errors.push("لا توجد مراحل.");
    return errors;
  }
  for (let i = 0; i < game.stages.length; i++) {
    const issues = validateCrosswordStage(game.stages[i] as CrosswordStage);
    issues.forEach((iss) => errors.push(`stages[${i}].${iss.path}: ${iss.message}`));
  }
  // Duplicate clue numbers per direction.
  for (let i = 0; i < game.stages.length; i++) {
    const st = game.stages[i] as CrosswordStage;
    const seen = new Set<string>();
    for (const c of st.clues ?? []) {
      const k = `${c.direction}-${c.number}`;
      if (seen.has(k)) errors.push(`stages[${i}]: رقم تلميح مكرر ${c.number} في الاتجاه ${c.direction}.`);
      seen.add(k);
    }
  }
  return errors;
}
