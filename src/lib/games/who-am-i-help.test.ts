import { test, expect } from 'vitest';
import { getRevealedState } from './who-am-i-help';

test('getRevealedState normalization invariants', () => {
  // Mock localStorage
  const mockStorage: Record<string, string> = {};
  global.localStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => { mockStorage[key] = val; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => { for (const key in mockStorage) delete mockStorage[key]; },
    key: (i: number) => Object.keys(mockStorage)[i],
    length: 0
  } as any;

  // Case A: Fresh/Empty
  const fresh = getRevealedState('game1', 0);
  expect(Array.isArray(fresh.revealedWords)).toBe(true);
  expect(fresh.revealedLetters).not.toBeNull();
  expect(typeof fresh.revealedLetters).toBe('object');
  expect(Array.isArray(fresh.revealedLetters)).toBe(false);

  // Case B: Nulls in storage
  localStorage.setItem('irth.games.whoami.help.v1', JSON.stringify({
    reveals: {
      'game1:0': { revealedWords: null, revealedLetters: null }
    }
  }));
  const poisoned = getRevealedState('game1', 0);
  expect(Array.isArray(poisoned.revealedWords)).toBe(true);
  expect(poisoned.revealedLetters).not.toBeNull();
  expect(typeof poisoned.revealedLetters).toBe('object');
  expect(Array.isArray(poisoned.revealedLetters)).toBe(false);
  expect(poisoned.revealedLetters).toEqual({});

  // Case C: Malformed primitives
  localStorage.setItem('irth.games.whoami.help.v1', JSON.stringify({
    reveals: {
      'game1:0': { revealedWords: "bad", revealedLetters: "bad" }
    }
  }));
  const malformed = getRevealedState('game1', 0);
  expect(Array.isArray(malformed.revealedWords)).toBe(true);
  expect(malformed.revealedLetters).toEqual({});
});
