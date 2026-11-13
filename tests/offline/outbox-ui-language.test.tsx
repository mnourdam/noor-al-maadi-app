import React, { useEffect } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { UI_MESSAGES } from '@/lib/ui-language/messages';
import { getUiLanguage, setUiLanguage, UI_LANGUAGE_KEY, useUiLanguage } from '@/lib/ui-language/store';
import { UiLanguageChooser } from '@/components/UiLanguageChooser';
vi.mock('@tanstack/react-router', () => ({ useRouterState: ({ select }: any) => select({ location: { pathname: '/campaigns' } }), Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock('@/components/HUD', () => ({ HUD: () => <div>HUD fixture</div> }));
vi.mock('@/components/FriendNotificationsPoller', () => ({ FriendNotificationsPoller: () => null }));
vi.mock('@/lib/androidFreezeDiagnostics', () => ({ androidMark: () => {}, isAndroidUltraStableMode: () => false }));
vi.mock('@/lib/androidQuietMode', () => ({ isSectionEnabled: () => false }));
import { AppShell } from '@/components/AppShell';
function Probe() { const { language } = useUiLanguage(); return <output data-testid="language">{language}</output>; }
beforeEach(() => { localStorage.clear(); setUiLanguage('ar'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps exact dictionary key parity and default Arabic', () => {
  expect(Object.keys(UI_MESSAGES.en).sort()).toEqual(Object.keys(UI_MESSAGES.ar).sort());
  expect(getUiLanguage()).toBe('ar');
});
it('reactively switches every subscriber and persists only the device preference', () => {
  render(<><UiLanguageChooser /><Probe /></>);
  fireEvent.change(screen.getByLabelText('لغة الواجهة'), { target: { value: 'en' } });
  expect((screen.getByLabelText('Interface language') as HTMLSelectElement).value).toBe('en');
  expect(screen.getByTestId('language').textContent).toBe('en');
  expect(localStorage.getItem(UI_LANGUAGE_KEY)).toBe('en');
  expect(Object.keys(localStorage)).toEqual([UI_LANGUAGE_KEY]);
  expect(screen.getByText(/Pages, popovers and content remain in Arabic/)).toBeTruthy();
});
it('rejects unsupported runtime locale without persisting or notifying', () => {
  render(<Probe />); act(() => setUiLanguage('fr' as any));
  expect(screen.getByTestId('language').textContent).toBe('ar');
  expect(localStorage.getItem(UI_LANGUAGE_KEY)).toBe('ar');
});
for (const failure of ['throw', 'silent'] as const) it(`keeps session preference for ${failure} storage failure and later subscribers`, () => {
  render(<UiLanguageChooser />);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { if (failure === 'throw') throw new Error('unavailable'); });
  fireEvent.change(screen.getByLabelText('لغة الواجهة'), { target: { value: 'en' } });
  render(<Probe />);
  expect(screen.getByTestId('language').textContent).toBe('en');
});
it('receives cross-tab changes, invalid values and clear without accepting unrelated keys', () => {
  render(<Probe />);
  act(() => { localStorage.setItem(UI_LANGUAGE_KEY, 'en'); window.dispatchEvent(new StorageEvent('storage', { key: UI_LANGUAGE_KEY })); });
  expect(screen.getByTestId('language').textContent).toBe('en');
  act(() => { localStorage.setItem(UI_LANGUAGE_KEY, 'ar'); window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })); });
  expect(screen.getByTestId('language').textContent).toBe('en');
  act(() => { localStorage.setItem(UI_LANGUAGE_KEY, 'xx'); window.dispatchEvent(new StorageEvent('storage', { key: UI_LANGUAGE_KEY })); });
  expect(screen.getByTestId('language').textContent).toBe('ar');
  act(() => { setUiLanguage('en'); localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })); });
  expect(screen.getByTestId('language').textContent).toBe('ar');
});
it('SSR remains Arabic even when this client has selected English, then hydrates without mismatch', async () => {
  setUiLanguage('en');
  const markup = renderToString(<UiLanguageChooser />);
  expect(markup).toContain('لغة الواجهة'); expect(markup).not.toContain('Interface language');
  const div = document.createElement('div'); div.innerHTML = markup; document.body.appendChild(div);
  const errors: unknown[] = []; let root: ReturnType<typeof hydrateRoot>;
  await act(async () => { root = hydrateRoot(div, <UiLanguageChooser />, { onRecoverableError: error => errors.push(error) }); });
  expect(div.textContent).toContain('Interface language'); expect(errors).toEqual([]);
  act(() => root!.unmount()); div.remove();
});
it('translates real shell navigation without changing route/tutorial IDs or remounting Arabic content', () => {
  let mounts = 0;
  function Page() { useEffect(() => { mounts++; }, []); return <p>نص عربي غير مترجم</p>; }
  render(<AppShell><Page /></AppShell>);
  const before = Array.from(document.querySelectorAll('nav a')).map(a => [a.getAttribute('href'), a.getAttribute('data-tutorial-target')]);
  fireEvent.change(screen.getByLabelText('لغة الواجهة'), { target: { value: 'en' } });
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  expect(nav.getAttribute('dir')).toBe('ltr'); expect(nav.getAttribute('lang')).toBe('en');
  expect(screen.getByRole('link', { name: 'Atlas' }).getAttribute('href')).toBe('/map');
  expect(Array.from(document.querySelectorAll('nav a')).map(a => [a.getAttribute('href'), a.getAttribute('data-tutorial-target')])).toEqual(before);
  const content = screen.getByText('نص عربي غير مترجم').closest('[lang]')!;
  expect(content.getAttribute('lang')).toBe('ar'); expect(content.getAttribute('dir')).toBe('rtl'); expect(mounts).toBe(1);
  expect(document.querySelector('html')!.getAttribute('lang')).not.toBe('en');
});
it('unsubscribes storage events on last unmount', () => {
  const remove = vi.spyOn(window, 'removeEventListener'); const view = render(<Probe />); view.unmount();
  expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
});
it('uses an already device-wide preference key, not a player progression key', async () => {
  const { isPersonalKey } = await import('@/lib/identity/partition');
  expect(isPersonalKey(UI_LANGUAGE_KEY)).toBe(false);
});
it('new subscriber reconciles a persisted change made while the UI was unmounted', () => {
  const first = render(<Probe />); first.unmount();
  localStorage.setItem(UI_LANGUAGE_KEY, 'en');
  render(<Probe />); expect(screen.getByTestId('language').textContent).toBe('en');
});
it('unreadable storage events preserve in-memory choice and sessionStorage events are ignored', () => {
  render(<Probe />); act(() => setUiLanguage('en'));
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: UI_LANGUAGE_KEY, storageArea: sessionStorage })));
  expect(screen.getByTestId('language').textContent).toBe('en');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: UI_LANGUAGE_KEY })));
  expect(screen.getByTestId('language').textContent).toBe('en');
});
