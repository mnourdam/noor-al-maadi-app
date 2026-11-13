import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LockedStoryDialog } from '@/components/stories/LockedStoryDialog';
import { formatDurationArabic, formatStoryDuration } from '@/lib/stories/duration';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { StoryPrereq } from '@/lib/stories/summary';
const env = vi.hoisted(() => ({ events: [] as string[], entities: {} as Record<string, any>, navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate: env.navigate }) }));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: any) => <>{children}</> }));
vi.mock('@/lib/navigation/engine', () => ({ useStashCurrentAsOrigin: () => (to: string) => env.events.push('stash:' + to) }));
vi.mock('@/lib/navigation/overlay-registration', () => ({ OverlayDismissRegistration: () => null }));
vi.mock('@/lib/local-first-store', () => ({ localEncyclopediaById: (id: string) => env.entities[id] ?? null }));
const close = () => env.events.push('close');
const p = (kind: string, ref = 'target', title: string | null = 'اسم عربي'): StoryPrereq => ({ kind, ref, title, satisfied: false });
beforeEach(() => { setUiLanguage('ar'); env.events = []; env.entities = {}; env.navigate.mockReset().mockImplementation(async ({ to }: any) => { env.events.push('navigate:' + to); }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('switches generated dialog chrome with same dialog/heading/focused close and Arabic authored islands', () => {
  render(<LockedStoryDialog title="عنوان عربي" explanation="  شرح عربي  " prereqs={[p('player_level')]} onClose={close} />);
  const dialog = screen.getByRole('dialog', { name: 'عنوان عربي — مقفلة' });
  const heading = within(dialog).getByRole('heading');
  const button = within(dialog).getByRole('button', { name: 'إغلاق' }); button.focus();
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('dialog', { name: 'عنوان عربي — Locked' })).toBe(dialog);
  expect(within(dialog).getByRole('heading')).toBe(heading); expect(heading.lang).toBe('ar'); expect(heading.dir).toBe('rtl');
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBe(button); expect(document.activeElement).toBe(button);
  expect(screen.getByText('شرح عربي').getAttribute('lang')).toBe('ar');
  expect(screen.getByText('اسم عربي').getAttribute('dir')).toBe('rtl');
  expect(screen.getByText('Reach the level:')).toBeTruthy(); expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
  expect(env.events).toEqual([]);
  act(() => setUiLanguage('ar')); expect(screen.getByRole('dialog')).toBe(dialog);
  fireEvent.click(button); expect(env.events).toEqual(['close']);
});
it('preserves canonical entity redirect, first actionable selection and close/stash/navigation order', () => {
  env.entities = { duplicate: { id: 'duplicate', enabled: false, metadata: { canonical_id: 'canonical' } }, canonical: { id: 'canonical', enabled: true, entity_type: 'state', slug: 'canonical-slug', title: 'دولة عربية' }, disabled: { id: 'disabled', enabled: false } };
  setUiLanguage('en');
  render(<LockedStoryDialog title="عنوان" prereqs={[{ ...p('story_completed', 'done'), satisfied: true }, p('entity_discovered', 'disabled'), p('entity_discovered', 'duplicate', null), p('story_completed', 'later')]} onClose={close} />);
  expect(screen.getByRole('button', { name: '📖 Go to دولة عربية' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /disabled/ })).toBeNull();
  expect(screen.getByText('This story is locked. Complete these requirements to unlock it:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Go now' }));
  expect(env.events).toEqual(['close', 'stash:/encyclopedia/state/canonical-slug', 'navigate:/encyclopedia/state/canonical-slug']);
});
for (const [kind, path] of [['campaign_completed', '/campaigns/imported/target'], ['investigation_completed', '/investigation/target'], ['story_completed', '/story/target']]) it('preserves exact generated target for ' + kind, () => {
  setUiLanguage('en'); render(<LockedStoryDialog title="عنوان" prereqs={[p(kind, 'target', null)]} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Go now' }));
  expect(env.events).toEqual(['close', 'stash:' + path, 'navigate:' + path]);
});
it('keeps aliases label-only, unknown/missing-ref/satisfied requirements nonactionable, and default/SSR Arabic', () => {
  setUiLanguage('en');
  const prereqs = [p('campaign_complete'), p('investigation_complete'), p('story_complete'), p('unknown'), p('story_completed', ''), { ...p('campaign_completed'), satisfied: true }];
  render(<LockedStoryDialog title="عنوان" prereqs={prereqs} onClose={close} />);
  expect(screen.queryByRole('button', { name: 'Go now' })).toBeNull();
  expect(screen.getByText('Requirement:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'OK' })); expect(env.events).toEqual(['close']);
  cleanup(); render(<LockedStoryDialog title="عنوان" onClose={close} />);
  expect(screen.getByText('This story is currently locked. Continue your journey in Irth to unlock it.')).toBeTruthy();
  const markup = renderToString(<LockedStoryDialog title="عنوان" onClose={close} />);
  expect(markup).toContain('هذه القصة مقفلة حاليًا'); expect(markup).not.toContain('This story');
});
it('preserves exact duration rounding and Arabic function output at thresholds', () => {
  for (const ms of [-1000, 0, 494, 500, 59499, 59500, 60000, 119499, 119500, 120000, 149499, 149500, 180000]) {
    expect(formatStoryDuration(ms, 'ar')).toBe(formatDurationArabic(ms));
    const seconds = Math.max(0, Math.round(ms / 1000));
    expect(formatStoryDuration(ms, 'en')).toBe(seconds < 60 ? `≈ ${seconds} s` : seconds < 120 ? '≈ 1 min' : `≈ ${Math.round(seconds / 60)} min`);
  }
});
it('retains exact browser-location fallback when the existing router transport rejects', async () => {
  const actualWindow = window;
  const assign = vi.fn();
  env.navigate.mockImplementation(async ({ to }: any) => {
    env.events.push('navigate:' + to);
    // Isolate the existing transport fallback after the React click dispatch.
    vi.stubGlobal('window', { location: { assign } });
    throw new Error('synthetic navigation failure');
  });
  setUiLanguage('en');
  render(<LockedStoryDialog title="عنوان" prereqs={[p('story_completed')]} onClose={close} />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Go now' }));
    await Promise.resolve(); await Promise.resolve();
    expect(assign).toHaveBeenCalledWith('/story/target');
    expect(env.events).toEqual(['close', 'stash:/story/target', 'navigate:/story/target']);
  } finally { vi.stubGlobal('window', actualWindow); }
});

it('preserves legacy nonfinite duration output without new normalization', () => {
  for (const [ms, ar, en] of [
    [NaN, '≈ NaN د', '≈ NaN min'],
    [Infinity, '≈ Infinity د', '≈ Infinity min'],
    [-Infinity, '≈ 0 ث', '≈ 0 s'],
  ] as const) {
    expect(formatDurationArabic(ms)).toBe(ar);
    expect(formatStoryDuration(ms, 'ar')).toBe(ar);
    expect(formatStoryDuration(ms, 'en')).toBe(en);
  }
});
