import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NavigationProvider } from '@/lib/navigation/engine';
const env = vi.hoisted(() => ({
  location: { pathname: '/first' },
  navigate: vi.fn(),
  registrations: [] as Array<{ callback: () => void; resolve: (handle: { remove: () => Promise<void> }) => void }>,
  add: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: env.add } }));
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => router,
  useRouterState: ({ select }: { select: (state: { location: typeof env.location }) => unknown }) => select({ location: env.location }),
}));
const router = { navigate: env.navigate, state: { matches: [] }, history: { back: vi.fn() } };
vi.mock('@/lib/navigation/validate', () => ({ validateNavigationRegistry: () => ({ ok: true }), formatValidationReport: () => '' }));
vi.mock('@/lib/navigation/registry', () => ({
  NAVIGATION_REGISTRY: [],
  resolveDeclaration: (id: string) => ({ id, parentRoute: '/', kind: 'player' }),
}));
vi.mock('@/components/ui/alert-dialog', () => {
  const Empty = () => null;
  return Object.fromEntries(['AlertDialog','AlertDialogAction','AlertDialogCancel','AlertDialogContent','AlertDialogDescription','AlertDialogFooter','AlertDialogHeader','AlertDialogTitle'].map(k => [k, Empty]));
});
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const mount = () => render(<NavigationProvider><span>screen</span></NavigationProvider>);
beforeEach(() => {
  env.location = { pathname: '/first' };
  router.state.matches = [{ routeId: '/first' }] as never;
  env.navigate.mockReset(); env.add.mockReset(); env.registrations.length = 0;
  env.add.mockImplementation((_name: string, callback: () => void) => new Promise(resolve => env.registrations.push({ callback, resolve })));
  Object.assign(window, { Capacitor: { getPlatform: () => 'android' } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (window as any).Capacitor; });
it('live pending-registration callback still navigates', async () => {
  mount(); await flush(); env.registrations[0].callback(); expect(env.navigate).toHaveBeenCalledOnce();
});
it('unmount fences callback before registration handle resolves', async () => {
  const view = mount(); await flush(); const registration = env.registrations[0];
  view.unmount(); registration.callback(); expect(env.navigate).not.toHaveBeenCalled();
  const remove = vi.fn(async () => {}); registration.resolve({ remove }); await flush(); expect(remove).toHaveBeenCalledOnce();
});
it('route replacement revokes old callback but keeps new callback live', async () => {
  const view = mount(); await flush(); const old = env.registrations[0];
  env.location = { pathname: '/second' };
  view.rerender(<NavigationProvider><span>next</span></NavigationProvider>); await flush();
  old.callback(); expect(env.navigate).not.toHaveBeenCalled();
  env.registrations[1].callback(); expect(env.navigate).toHaveBeenCalledOnce();
  const remove = vi.fn(async () => {}); old.resolve({ remove }); await flush(); expect(remove).toHaveBeenCalledOnce();
});
it('unmount before module continuation never registers', async () => {
  const view = mount(); view.unmount(); await flush(); expect(env.add).not.toHaveBeenCalled();
});
it('resolved-handle cleanup fences queued callback', async () => {
  const view = mount(); await flush(); const registration = env.registrations[0];
  const remove = vi.fn(async () => {}); registration.resolve({ remove }); await flush();
  view.unmount(); registration.callback(); expect(env.navigate).not.toHaveBeenCalled(); expect(remove).toHaveBeenCalledOnce();
});
it('non-Android does not register', async () => {
  Object.assign(window, { Capacitor: { getPlatform: () => 'web' } }); mount(); await flush(); expect(env.add).not.toHaveBeenCalled();
});
it.each(['reject', 'throw'])('cleanup remains fenced when native remove will %s', async kind => {
  const view = mount(); await flush(); const registration = env.registrations[0];
  const remove = vi.fn(() => { if (kind === 'throw') throw Error('native-remove'); return Promise.reject(Error('native-remove')); });
  registration.resolve({ remove }); await flush();
  view.unmount(); registration.callback(); await flush();
  expect(remove).toHaveBeenCalledOnce(); expect(env.navigate).not.toHaveBeenCalled();
});
it('registration rejection is contained and diagnosed', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  env.add.mockRejectedValue(Error('native-register')); mount(); await flush();
  expect(log).toHaveBeenCalledOnce(); expect(env.navigate).not.toHaveBeenCalled();
});
