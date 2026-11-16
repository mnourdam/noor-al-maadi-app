import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_CONTROL_MESSAGES, gameControlText } from '@/lib/ui-language/game-control-messages';
import { TARGET_LOCALES, LOCALE_META } from '@/lib/ui-language/locale-policy';
const state = vi.hoisted(() => ({ language: 'ar' as string }));
vi.mock('@/lib/ui-language/store', () => ({ useUiLanguage: () => ({ language: state.language, direction: ['ar','ur'].includes(state.language) ? 'rtl' : 'ltr' }) }));
vi.mock('@/lib/androidFreezeDiagnostics', () => ({ androidMark: () => {}, isAndroidUltraStableMode: () => false }));
// Navigation-stack behavior is covered separately; keep the real dialog controls.
vi.mock('@/lib/navigation/overlay-registration', () => ({ OverlayDismissRegistration: () => null }));
import { AttemptsChip } from '@/components/games/AttemptsChip';
import { ExitConfirmDialog } from '@/components/games/ExitConfirmDialog';
import { TimeExpiredDialog } from '@/components/games/TimeExpiredDialog';
import { GameTimer } from '@/components/games/GameTimer';
// Existing application JSX uses the classic transform in this isolated runner.
Object.assign(globalThis, { React });
afterEach(cleanup);
describe('six-locale game controls (not game-content translation)', () => {
  for (const language of TARGET_LOCALES) {
    it(`${language}: complete keys and identical placeholders`, () => {
      expect(Object.keys(GAME_CONTROL_MESSAGES[language]).sort()).toEqual(Object.keys(GAME_CONTROL_MESSAGES.ar).sort());
      for (const key of Object.keys(GAME_CONTROL_MESSAGES.ar) as (keyof typeof GAME_CONTROL_MESSAGES.ar)[]) {
        expect(GAME_CONTROL_MESSAGES[language][key].trim()).not.toBe('');
        expect(GAME_CONTROL_MESSAGES[language][key].match(/\{\w+\}/g)?.sort() ?? []).toEqual(GAME_CONTROL_MESSAGES.ar[key].match(/\{\w+\}/g)?.sort() ?? []);
      }
    });
    it(`${language}: exit/cancel callbacks remain separate and direction correct`, () => {
      state.language = language; const cancel=vi.fn(), confirm=vi.fn();
      render(<ExitConfirmDialog open onCancel={cancel} onConfirm={confirm}/>);
      expect(screen.getByRole('alertdialog').getAttribute('dir')).toBe(LOCALE_META[language].direction);
      fireEvent.click(screen.getByText(GAME_CONTROL_MESSAGES[language].continue));
      expect(cancel).toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText(GAME_CONTROL_MESSAGES[language].exit)); expect(confirm).toHaveBeenCalledTimes(1);
    });
    it(`${language}: insufficient balance cannot purchase, warning dismisses without ending`, () => {
      state.language = language; const buy=vi.fn(), end=vi.fn();
      render(<TimeExpiredDialog open dinars={9} onBuyTime={buy} onEndChallenge={end}/>);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(GAME_CONTROL_MESSAGES[language].addTime) }));
      expect(screen.getByText(GAME_CONTROL_MESSAGES[language].insufficient)).toBeTruthy();
      fireEvent.click(screen.getByText(GAME_CONTROL_MESSAGES[language].okay));
      expect(buy).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText(GAME_CONTROL_MESSAGES[language].end)); expect(end).toHaveBeenCalledTimes(1);
    });
    it(`${language}: purchase threshold remains 10, timer is LTR, attempts readable`, () => {
      state.language = language; const buy=vi.fn();
      render(<><TimeExpiredDialog open dinars={10} onBuyTime={buy} onEndChallenge={()=>{}}/><AttemptsChip attemptsLeft={1} total={3}/><GameTimer seconds={120} paused/></>);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(GAME_CONTROL_MESSAGES[language].addTime) })); expect(buy).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(GAME_CONTROL_MESSAGES[language].timer).getAttribute('dir')).toBe('ltr');
      expect(screen.getByLabelText(`${GAME_CONTROL_MESSAGES[language].lastAttempt}: ${gameControlText(language,'attemptCount',{remaining:1,total:3})}`)).toBeTruthy();
    });
  }
  it('formats variable English/French balance without exposing placeholder tokens', () => {
    for (const language of TARGET_LOCALES) expect(gameControlText(language,'balance',{balance:1})).not.toContain('{');
    expect(gameControlText('en','balance',{balance:1})).toBe('Current balance: 1 dinar');
    expect(gameControlText('fr','balance',{balance:0})).toBe('Solde actuel : 0 dinar');
  });
});
