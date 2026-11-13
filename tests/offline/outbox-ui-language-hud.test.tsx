import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { setUiLanguage } from '@/lib/ui-language/store';
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
vi.mock('@/lib/profile', () => ({ useProfile: () => ({ profile: { loggedIn: false, dinars: 12, points: 34, hearts: 4, streak: 2, lastActiveDay: '2026-11-12' } }), deriveStreak: () => ({ streak: 2 }) }));
vi.mock('@/lib/hearts', () => ({ HEART_MAX: 5, getEffectiveHearts: () => 4, msUntilNextHeart: () => 12345, formatHeartTimer: () => '00:12' }));
vi.mock('@/lib/notifications', () => ({ formatBadgeCount: (n: number) => String(n) }));
vi.mock('@/lib/notifications/server', () => ({ fetchMyUnreadCount: async () => 0, subscribeToMyNotifications: () => () => {} }));
vi.mock('@/lib/androidFreezeDiagnostics', () => ({ isAndroidUltraStableMode: () => true }));
vi.mock('@/lib/androidFocusAB', () => ({ isAndroidFocusABDisabled: () => true }));
vi.mock('@/components/ui/popover', () => ({ Popover: ({ children }: any) => <>{children}</>, PopoverTrigger: ({ children }: any) => <>{children}</>, PopoverContent: ({ children, align, sideOffset, ...props }: any) => <div data-testid="popover" {...props}>{children}</div> }));
vi.mock('@/components/notifications/PersonalInboxBell', () => ({ PersonalInboxBell: () => <span>صندوق شخصي</span> }));
vi.mock('@/components/HUDStatPopovers', () => ({ HeartsPopover: () => <p>مساعدة القلوب</p>, DinarsPopover: () => <p>مساعدة الدنانير</p>, XPPopover: () => <p>مساعدة الخبرة</p>, StreakPopover: () => <p>مساعدة الحماسة</p> }));
vi.mock('@/components/motion/MotionPrimitives', () => ({ AnimatedNumber: ({ value }: any) => <span>{value}</span> }));
vi.mock('@/lib/boot/reconciliation', () => ({ getReconciliationState: () => 'ready', subscribeReconciliation: () => () => {} }));
import { HUD } from '@/components/HUD';
afterEach(() => { cleanup(); setUiLanguage('ar'); });
it('reactively translates actual HUD primary labels and popover language islands while preserving stat values', async () => {
  setUiLanguage('ar'); await act(async () => { render(<HUD />); });
  expect(screen.getByRole('button', { name: 'القلوب' })).toBeTruthy();
  act(() => setUiLanguage('en'));
  for (const name of ['Hearts', 'Dinars', 'Experience', 'Streak']) {
    expect(screen.getByRole('button', { name }).getAttribute('lang')).toBe('en');
  }
  expect(screen.getByRole('link', { name: 'Notifications' }).getAttribute('href')).toBe('/notifications');
  expect(screen.getByLabelText('Next heart in').textContent).toBe('00:12');
  for (const p of screen.getAllByTestId('popover')) { expect(p.getAttribute('lang')).toBe('en'); expect(p.getAttribute('dir')).toBe('ltr'); }
  expect(screen.getByText('12')).toBeTruthy(); expect(screen.getByText('34')).toBeTruthy();
  act(() => setUiLanguage('ar'));
  expect(screen.getByRole('button', { name: 'القلوب' })).toBeTruthy();
});
