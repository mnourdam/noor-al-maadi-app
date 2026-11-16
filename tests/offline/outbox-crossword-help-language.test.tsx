import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { CROSSWORD_HELP_MESSAGES, crosswordHelpText } from '@/lib/ui-language/crossword-help-messages';
import type { AppLocale } from '@/lib/ui-language/locale-policy';
// Inject inactive target locales only in this fixture; production locale gates remain unchanged.
const localeState = vi.hoisted(() => ({ language: 'ar' as string }));
vi.mock('@/lib/ui-language/store', () => ({ useUiLanguage: () => ({ language: localeState.language, direction: ['ar','ur'].includes(localeState.language) ? 'rtl' : 'ltr' }) }));
const mocks = vi.hoisted(() => ({ reveal: vi.fn(() => true), available: vi.fn(() => true), toast: vi.fn() }));
vi.mock('@/components/games/crossword-help-bridge', () => ({ getCrosswordHelpBridge: () => ({ revealOne: mocks.reveal, hasUnrevealed: mocks.available }) }));
vi.mock('@/components/games/sfx', () => ({ sfx: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children, ...props }: any) => <section data-testid="dialog" {...props}>{children}</section>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
import { CrosswordHelpDialog } from '@/components/games/CrosswordHelpDialog';
const locales: AppLocale[] = ['ar','en','ur','id','tr','fr'];
beforeEach(() => { vi.clearAllMocks(); mocks.available.mockReturnValue(true); mocks.reveal.mockReturnValue(true); });
afterEach(() => { cleanup(); localeState.language = 'ar'; });
describe('crossword help presentation only', () => {
  it.each(locales)('%s preserves cost, timer and action identity', (locale) => {
    localeState.language = locale;
    const spend = vi.fn(() => true), add = vi.fn(), close = vi.fn();
    render(<CrosswordHelpDialog open onOpenChange={close} dinars={70} spendDinars={spend} hasTimer addSeconds={add} />);
    const m = CROSSWORD_HELP_MESSAGES[locale];
    expect(screen.getByTestId('dialog').getAttribute('dir')).toBe(locale === 'ar' || locale === 'ur' ? 'rtl' : 'ltr');
    expect(screen.getByText(crosswordHelpText(locale,'dinars',{ count:70 }))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.reveal) }));
    expect(mocks.reveal).toHaveBeenCalledTimes(1); expect(spend).toHaveBeenLastCalledWith(10);
    expect(mocks.toast).toHaveBeenLastCalledWith(crosswordHelpText(locale,'revealed',{ cost:10 }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.addTime) }));
    expect(add).toHaveBeenCalledWith(120); expect(spend).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledWith(false);
  });
  it('reactively changes language without altering availability or charging on insufficient balance', () => {
    const spend=vi.fn(() => true), add=vi.fn();
    const view = render(<CrosswordHelpDialog open onOpenChange={vi.fn()} dinars={0} spendDinars={spend} hasTimer={false} addSeconds={add} />);
    localeState.language = 'fr';
    view.rerender(<CrosswordHelpDialog open onOpenChange={vi.fn()} dinars={0} spendDinars={spend} hasTimer={false} addSeconds={add} />);
    expect(screen.queryByText(CROSSWORD_HELP_MESSAGES.fr.addTime)).toBeNull();
    fireEvent.click(screen.getByRole('button',{ name: /Révéler une lettre/ }));
    expect(screen.getByText(CROSSWORD_HELP_MESSAGES.fr.insufficient)).toBeTruthy();
    expect(spend).not.toHaveBeenCalled(); expect(mocks.reveal).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
  });
  it('does not expand production language activation', async () => {
    const real = await vi.importActual<typeof import('@/lib/ui-language/store')>('@/lib/ui-language/store');
    real.setUiLanguage('ar');
    for (const locale of ['ur','id','tr','fr'] as const) {
      // Deliberately pass inactive input to verify the runtime gate, not only its type.
      // @ts-expect-error Inactive target locales are intentionally outside UiLanguage.
      real.setUiLanguage(locale);
      expect(real.getUiLanguage()).toBe('ar');
    }
  });
  it('keeps every placeholder and key across all six dictionaries', () => {
    for (const locale of locales) {
      expect(Object.keys(CROSSWORD_HELP_MESSAGES[locale])).toEqual(Object.keys(CROSSWORD_HELP_MESSAGES.ar));
      for (const key of Object.keys(CROSSWORD_HELP_MESSAGES.ar) as (keyof typeof CROSSWORD_HELP_MESSAGES.ar)[]) {
        expect(CROSSWORD_HELP_MESSAGES[locale][key].match(/\{\w+\}/g)).toEqual(CROSSWORD_HELP_MESSAGES.ar[key].match(/\{\w+\}/g));
      }
    }
  });
});
