// ============================================================
// Investigation answer state machine — pure reducer.
// ------------------------------------------------------------
// Extracted from the player UI so the transition rules can be
// tested in isolation (no React, no Supabase). The UI in
// `src/routes/investigation.$id.tsx` drives its useState hooks
// off this reducer's return values.
//
// Invariants enforced here:
//   • unanswered + confirm(wrong)   → incorrect
//   • incorrect  + retry            → unanswered (same question)
//   • incorrect  + repick           → unanswered (same question)
//   • {unanswered|incorrect} + confirm(correct)
//                                    → correct AND resolvedIndices += idx
//   • correct    + confirm/pick     → no-op (locked)
//   • next() only allowed when state==="correct" for question steps
//   • resolvedIndices is a Set → each question index contributes ≤ 1
//   • completion requires every question-like step in resolvedIndices
// ============================================================

export type StepKind = "briefing" | "evidence" | "question" | "decision" | "conclusion";
export type AnswerState = "unanswered" | "incorrect" | "correct";

export interface AnswerStep {
  kind: StepKind;
  /** For question/decision: the correct answer index (decision may omit). */
  correctAnswer?: number;
}

export interface AnswerMachineState {
  idx: number;
  picked: number | null;
  answer: AnswerState;
  /** Set of question-like step indices that have reached `correct`
   *  at least once. Size = number of questions the player has
   *  answered correctly (retries collapse to one entry per index). */
  resolvedIndices: Set<number>;
  finished: boolean;
}

export function initialAnswerState(alreadyDone = false): AnswerMachineState {
  return {
    idx: 0,
    picked: null,
    answer: "unanswered",
    resolvedIndices: new Set<number>(),
    finished: alreadyDone,
  };
}

export function isQuestionLike(step: AnswerStep | undefined): boolean {
  return !!step && (step.kind === "question" || step.kind === "decision");
}

export function countQuestionLike(steps: readonly AnswerStep[]): number {
  let n = 0;
  for (const s of steps) if (isQuestionLike(s)) n++;
  return n;
}

/** Pick an option. No-op when the current step is already `correct`. */
export function pick(state: AnswerMachineState, option: number): AnswerMachineState {
  if (state.answer === "correct") return state;
  // Re-picking after an incorrect attempt clears the reveal so the
  // player can try again without their previous choice frozen as wrong.
  const next: AnswerMachineState = { ...state, picked: option };
  if (state.answer === "incorrect") next.answer = "unanswered";
  return next;
}

/** Submit the current pick against a step. */
export function confirm(state: AnswerMachineState, step: AnswerStep): AnswerMachineState {
  if (!isQuestionLike(step)) return state;
  if (state.picked == null) return state;
  if (state.answer === "correct") return state;
  const correctIndex = step.correctAnswer;
  // Decision steps with no correctAnswer always accept the pick.
  const isCorrect =
    typeof correctIndex === "number" ? state.picked === correctIndex : true;
  if (!isCorrect) return { ...state, answer: "incorrect" };
  // Correct — record the index exactly once regardless of prior state.
  const resolved = new Set(state.resolvedIndices);
  resolved.add(state.idx);
  return { ...state, answer: "correct", resolvedIndices: resolved };
}

/** Retry after an incorrect attempt — clears pick and reveal. */
export function retry(state: AnswerMachineState): AnswerMachineState {
  if (state.answer !== "incorrect") return state;
  return { ...state, picked: null, answer: "unanswered" };
}

/** Can we advance from the current step? */
export function canAdvance(state: AnswerMachineState, step: AnswerStep | undefined): boolean {
  if (state.finished) return false;
  if (!step) return false;
  if (!isQuestionLike(step)) return true;
  return state.answer === "correct";
}

/** Advance one step, or finish on the last step. */
export function next(
  state: AnswerMachineState,
  steps: readonly AnswerStep[],
): AnswerMachineState {
  const step = steps[state.idx];
  if (!canAdvance(state, step)) return state;
  const isLast = state.idx >= steps.length - 1;
  if (isLast) return { ...state, picked: null, answer: "unanswered", finished: true };
  return { ...state, idx: state.idx + 1, picked: null, answer: "unanswered" };
}

/** Player has answered every required question at least once. */
export function isCompletable(
  state: AnswerMachineState,
  steps: readonly AnswerStep[],
): boolean {
  const required = countQuestionLike(steps);
  return state.resolvedIndices.size >= required;
}
