import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { HELP_DIALOG_MESSAGES, helpDialogText } from '@/lib/ui-language/help-dialog-messages';
import type { AppLocale } from '@/lib/ui-language/locale-policy';
// Inject inactive target locales only in this fixture; production locale gates remain unchanged.
const localeState = vi.hoisted(() => ({ language: 'ar' as string }));
vi.mock('@/lib/ui-language/store', () => ({ useUiLanguage: () => ({ language: localeState.language, direction: ['ar','ur'].includes(localeState.language) ? 'rtl' : 'ltr' }) }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children, ...props }: any) => <section data-testid="dialog" {...props}>{children}</section>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

import { GameHelpDialog } from '@/components/games/help/GameHelpDialog';
import { HelpErrorBoundary } from '@/components/games/help/HelpErrorBoundary';
const locales: AppLocale[] = ['ar','en','ur','id','tr','fr'];
afterEach(() => { cleanup(); localeState.language='ar'; vi.restoreAllMocks(); });
describe('unified game help display', () => {
  it.each(locales)('%s preserves option payment and closes on success', (locale) => {
    localeState.language=locale;
    const spend=vi.fn(() => true), close=vi.fn();
    const perform=vi.fn(({ pay }: { pay: () => boolean }) => pay());
    render(<GameHelpDialog open onOpenChange={close} dinars={50} spendDinars={spend} builtinOptions={[{ id:'stable-option-id', label:'Host option', description:'Host description', icon:null, cost:17, perform }]} />);
    expect(screen.getByTestId('dialog').getAttribute('dir')).toBe(['ar','ur'].includes(locale) ? 'rtl':'ltr');
    expect(screen.getByText(helpDialogText(locale,'dinars',{count:50}))).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/Host option/}));
    expect(perform).toHaveBeenCalledTimes(1); expect(spend).toHaveBeenCalledExactlyOnceWith(17); expect(close).toHaveBeenCalledWith(false);
  });
  it.each(locales)('%s shows the actual insufficient cost without executing the option', (locale) => {
    localeState.language=locale;
    const spend=vi.fn(),perform=vi.fn(),close=vi.fn();
    render(<GameHelpDialog open onOpenChange={close} dinars={2} spendDinars={spend} builtinOptions={[{ id:'x', label:'Host option', description:'description', icon:null, cost:17, perform }]} />);
    fireEvent.click(screen.getByRole('button',{name:/Host option/}));
    expect(screen.getByText(helpDialogText(locale,'required',{cost:17}))).toBeTruthy();
    expect(perform).not.toHaveBeenCalled(); expect(spend).not.toHaveBeenCalled();
  });
  it('renders empty state and updates language reactively', () => {
    const props={open:true,onOpenChange:vi.fn(),dinars:0,spendDinars:vi.fn()};
    const view=render(<GameHelpDialog {...props} />);
    expect(screen.getByText(HELP_DIALOG_MESSAGES.ar.empty)).toBeTruthy();
    localeState.language='fr'; view.rerender(<GameHelpDialog {...props} />);
    expect(screen.getByText(HELP_DIALOG_MESSAGES.fr.empty)).toBeTruthy();
    expect(screen.queryByText(HELP_DIALOG_MESSAGES.ar.empty)).toBeNull();
  });
  it('keeps unavailable options disabled', () => {
    const perform=vi.fn();
    render(<GameHelpDialog open onOpenChange={vi.fn()} dinars={100} spendDinars={vi.fn()} builtinOptions={[{id:'x',label:'Unavailable option',description:'desc',icon:null,cost:17,perform,getAvailable:()=>false}]} />);
    fireEvent.click(screen.getByRole('button',{name:/Unavailable option/}));
    expect(perform).not.toHaveBeenCalled();
  });
  it.each(locales)('%s localizes a caught help error and retries children', (locale) => {
    vi.spyOn(console,'error').mockImplementation(()=>{});
    localeState.language=locale;
    let fail=true;
    function Child(){ if(fail) throw new Error('fixture'); return <p>Recovered</p>; }
    render(<HelpErrorBoundary><Child /></HelpErrorBoundary>);
    expect(screen.getByText(HELP_DIALOG_MESSAGES[locale].errorTitle)).toBeTruthy();
    fail=false; fireEvent.click(screen.getByRole('button',{name:HELP_DIALOG_MESSAGES[locale].retry}));
    expect(screen.getByText('Recovered')).toBeTruthy();
  });
  it('preserves supplied custom error fallback', () => {
    vi.spyOn(console,'error').mockImplementation(()=>{});
    function Child(): React.ReactNode { throw new Error('fixture'); }
    render(<HelpErrorBoundary fallback={<p>Custom fallback</p>}><Child /></HelpErrorBoundary>);
    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });
  it('keeps dictionary keys and placeholders identical', () => {
    for(const locale of locales) {
      expect(Object.keys(HELP_DIALOG_MESSAGES[locale])).toEqual(Object.keys(HELP_DIALOG_MESSAGES.ar));
      for(const key of Object.keys(HELP_DIALOG_MESSAGES.ar) as (keyof typeof HELP_DIALOG_MESSAGES.ar)[]) {
        expect(HELP_DIALOG_MESSAGES[locale][key].match(/\{\w+\}/g)).toEqual(HELP_DIALOG_MESSAGES.ar[key].match(/\{\w+\}/g));
      }
    }
  });
});
