
import { normalizeArabicGameAnswer, letterClass } from "./answer-normalize";

/**
 * SOURCE OF TRUTH: Identity-partitioned localStorage.
 * Key structure: `irth.games.whoami.help.v1` (logical key)
 * physical key: `irth.games.whoami.help.v1::owner=<owner>`
 */
const STORAGE_KEY = "irth.games.whoami.help.v1";

export interface WhoAmIHelpState {
  /** Map of gameId:nonce to revealed state */
  reveals: Record<string, {
    revealedWords: number[]; // indices of words revealed
    revealedLetters: Record<number, number[]>; // wordIndex -> revealed letter positions
  }>;
}

function getHelpStore(): WhoAmIHelpState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return { reveals: {} };
}

function saveHelpStore(state: WhoAmIHelpState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // ignore
  }
}

/** 
 * Word weights for deterministic reveal.
 * Informative words get lower weight (revealed earlier).
 * Functional words get higher weight (revealed later).
 */
const WORD_WEIGHTS: Record<string, number> = {
  "بن": 100,
  "ابن": 100,
  "بنت": 100,
  "ال": 100,
  "آل": 90,
  "ابو": 40,
  "ام": 40,
  "ذو": 50,
};

function getWordWeight(word: string): number {
  const norm = normalizeArabicGameAnswer(word);
  return WORD_WEIGHTS[norm] ?? 10;
}

/**
 * Deterministic, balanced word reveal sequence.
 * Leaves at least one word hidden.
 */
export function getWordRevealSequence(answer: string): number[] {
  const words = answer.trim().split(/\s+/);
  if (words.length <= 1) return [];

  const weighted = words.map((w, i) => ({
    index: i,
    weight: getWordWeight(w),
    originalPos: i,
  }));

  // Sort by weight (informant first), then original position
  weighted.sort((a, b) => a.weight - b.weight || a.originalPos - b.originalPos);

  // Return indices of all but one word
  return weighted.slice(0, words.length - 1).map(w => w.index);
}

/**
 * Positional letter reveal for single-word answers.
 */
export function getLetterRevealPositions(word: string): number[] {
  const positions: number[] = [];
  const chars = Array.from(word);
  const validPositions = chars
    .map((ch, i) => (letterClass(ch) !== "" ? i : -1))
    .filter(i => i !== -1);

  const count = validPositions.length <= 4 ? 1 : 2;
  
  // Deterministic "random" based on word content
  let seed = word.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const nextRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const pool = [...validPositions];
  for (let i = 0; i < count && pool.length > 1; i++) {
    const idx = Math.floor(nextRand() * pool.length);
    positions.push(pool.splice(idx, 1)[0]);
  }

  return positions.sort((a, b) => a - b);
}

/**
 * ATOMIC HELP TRANSACTION
 */
export function purchaseWhoAmIHelp(
  gameId: string,
  nonce: number,
  answer: string,
  helpers: { pay: () => boolean }
): boolean {
  const key = `${gameId}:${nonce}`;
  const store = getHelpStore();
  const raw = store.reveals[key];
  const current = {
    revealedWords: Array.isArray(raw?.revealedWords) ? raw.revealedWords : [],
    revealedLetters: (raw?.revealedLetters !== null && typeof raw?.revealedLetters === "object" && !Array.isArray(raw?.revealedLetters)) 
      ? raw.revealedLetters 
      : {}
  };

  const words = answer.trim().split(/\s+/);
  
  let nextRevealedWords = [...current.revealedWords];
  let nextRevealedLetters = { ...current.revealedLetters };

  if (words.length > 1) {
    const sequence = getWordRevealSequence(answer);
    const nextIdx = sequence.find(idx => !current.revealedWords.includes(idx));
    if (nextIdx === undefined) return false;
    nextRevealedWords.push(nextIdx);
  } else {
    const positions = getLetterRevealPositions(answer);
    if ((current.revealedLetters[0]?.length ?? 0) >= positions.length) return false;
    nextRevealedLetters[0] = positions;
  }

  // Transaction: pay then commit
  if (!helpers.pay()) return false;

  store.reveals[key] = {
    revealedWords: nextRevealedWords,
    revealedLetters: nextRevealedLetters
  };
  saveHelpStore(store);
  return true;
}

export function getRevealedState(gameId: string, nonce: number) {
  const store = getHelpStore();
  const raw = store.reveals[`${gameId}:${nonce}`];
  return {
    revealedWords: Array.isArray(raw?.revealedWords) ? raw.revealedWords : [],
    revealedLetters: (raw?.revealedLetters !== null && typeof raw?.revealedLetters === "object" && !Array.isArray(raw?.revealedLetters)) 
      ? raw.revealedLetters 
      : {}
  };
}
