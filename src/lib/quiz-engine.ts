// ============================================================
// Quiz Engine — reusable, data-driven quizzes
// ------------------------------------------------------------
// Any chapter or campaign can attach a Quiz by adding data —
// no UI or logic changes required. Future content packs reuse
// the same shape.
// ============================================================

export interface QuizQuestion {
  id: string;                    // unique within quiz
  question: string;              // prompt (Arabic)
  choices: string[];             // ordered choice list
  correctIndex: number;          // index into choices
  explanation?: string;          // shown after answering
  xp: number;                    // awarded on first correct answer
  badgeId?: string;              // optional badge on correct
  unlock?: {                     // optional per-question unlocks
    characters?: string[];
    artifacts?: string[];
    cities?: string[];
    battles?: string[];
    events?: string[];
    states?: string[];
  };
}

export interface Quiz {
  id: string;                    // unique within campaign
  title?: string;
  questions: QuizQuestion[];
  /** When true, chapter cannot be finished until quiz is passed. */
  required?: boolean;
}

// ------------------------------------------------------------
// Storage key helpers (idempotent XP via profile.missionsCompleted)
// ------------------------------------------------------------

/** Mission key for a single answered-correctly question. */
export function quizQuestionKey(
  campaignId: string,
  chapterId: string,
  quizId: string,
  questionId: string,
): string {
  return `quiz:${campaignId}:${chapterId}:${quizId}:${questionId}`;
}

/** Mission key marking the whole chapter quiz as passed. */
export function chapterQuizKey(
  campaignId: string,
  chapterId: string,
  quizId: string,
): string {
  return `quizpass:${campaignId}:${chapterId}:${quizId}`;
}

/** Campaign-scholar key: granted once every chapter quiz is fully correct. */
export function campaignScholarKey(campaignId: string): string {
  return `scholar:${campaignId}`;
}

export function isQuestionAnsweredCorrectly(
  missionsCompleted: string[],
  campaignId: string, chapterId: string, quiz: Quiz, questionId: string,
): boolean {
  return missionsCompleted.includes(
    quizQuestionKey(campaignId, chapterId, quiz.id, questionId),
  );
}

export function isQuizPassed(
  missionsCompleted: string[],
  campaignId: string, chapterId: string, quiz: Quiz,
): boolean {
  if (missionsCompleted.includes(chapterQuizKey(campaignId, chapterId, quiz.id))) return true;
  return quiz.questions.every(q =>
    isQuestionAnsweredCorrectly(missionsCompleted, campaignId, chapterId, quiz, q.id),
  );
}