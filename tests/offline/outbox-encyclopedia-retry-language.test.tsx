import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EncyclopediaUnavailable } from '@/components/encyclopedia/EncyclopediaUnavailable';
import { setUiLanguage } from '@/lib/ui-language/store';
import { UI_MESSAGES } from '@/lib/ui-language/messages';

beforeEach(() => { localStorage.clear(); setUiLanguage('ar'); });
afterEach(() => { cleanup(); setUiLanguage('ar'); vi.restoreAllMocks(); });

it('changes only generated recovery text, retaining alert/button/focus and authored siblings', () => {
  const retry = vi.fn();
  render(<><p lang="ar" dir="rtl">نص تاريخي أصلي</p><EncyclopediaUnavailable onRetry={retry} /></>);
  const alert = screen.getByRole('alert');
  const button = within(alert).getByRole('button', { name: UI_MESSAGES.ar.encyclopediaRetry });
  const authored = screen.getByText('نص تاريخي أصلي');
  button.focus();
  for (const language of ['en', 'ar'] as const) {
    act(() => setUiLanguage(language));
    expect(screen.getByRole('alert')).toBe(alert);
    expect(within(alert).getByRole('button', { name: UI_MESSAGES[language].encyclopediaRetry })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(alert.lang).toBe(language);
    expect(alert.dir).toBe(language === 'ar' ? 'rtl' : 'ltr');
    expect(within(alert).getByText(UI_MESSAGES[language].encyclopediaUnavailable)).toBeTruthy();
    expect(screen.getByText('نص تاريخي أصلي')).toBe(authored);
    expect(authored.lang).toBe('ar'); expect(authored.dir).toBe('rtl');
    expect(retry).not.toHaveBeenCalled();
  }
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledTimes(1);
});

it('preserves pending disablement and accepts the latest retry callback after prop changes', () => {
  const oldRetry = vi.fn(), currentRetry = vi.fn();
  const view = render(<EncyclopediaUnavailable onRetry={oldRetry} retrying />);
  const button = screen.getByRole('button', { name: UI_MESSAGES.ar.encyclopediaRetrying });
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('button', { name: 'Retrying…' })).toBe(button);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button); expect(oldRetry).not.toHaveBeenCalled();
  view.rerender(<EncyclopediaUnavailable onRetry={currentRetry} retrying={false} />);
  expect(screen.getByRole('button', { name: 'Retry' })).toBe(button);
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(currentRetry).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(currentRetry).toHaveBeenCalledTimes(1); expect(oldRetry).not.toHaveBeenCalled();
});

it('keeps the server snapshot Arabic even when client preference is English', () => {
  setUiLanguage('en'); const retry = vi.fn();
  const html = renderToString(<EncyclopediaUnavailable onRetry={retry} retrying />);
  expect(html).toContain('lang="ar"'); expect(html).toContain('dir="rtl"');
  expect(html).toContain(UI_MESSAGES.ar.encyclopediaUnavailable);
  expect(html).toContain(UI_MESSAGES.ar.encyclopediaRetrying);
  expect(html).not.toContain(UI_MESSAGES.en.encyclopediaUnavailable);
  expect(retry).not.toHaveBeenCalled();
});
