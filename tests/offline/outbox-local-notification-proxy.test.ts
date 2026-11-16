import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({then:vi.fn(), cancel:vi.fn(), checkPermissions:vi.fn(), schedule:vi.fn()}));
vi.mock('@capacitor/local-notifications', () => ({LocalNotifications:new Proxy({}, {
  get(_target, key) {
    if (key === 'then') return (_resolve: unknown, reject: (error: Error) => void) => {
      native.then(); reject(new Error('LocalNotifications.then() is not implemented on android'));
    };
    return native[key as keyof typeof native];
  },
})}));
vi.mock('@/lib/games/dailyChallengeService', () => ({loadDailyChallengeState:vi.fn()}));
vi.mock('@/lib/notifications', () => ({readCanonicalNotificationPrefs:vi.fn(() => ({}))}));
import { cancelDailyChallenge, rescheduleDailyChallenge, DAILY_CHALLENGE_NOTIF_ID } from '@/lib/notifications/dailyChallengeScheduler';
beforeEach(() => {
  vi.clearAllMocks();
  native.cancel.mockResolvedValue(undefined);
  native.checkPermissions.mockResolvedValue({display:'denied'});
  vi.stubGlobal('Capacitor',{isNativePlatform:()=>true,getPlatform:()=> 'android'});
});
afterEach(() => vi.unstubAllGlobals());
it('cancels using the native plugin without Promise-assimilating its proxy', async () => {
  await expect(cancelDailyChallenge('test')).resolves.toBeUndefined();
  expect(native.then).not.toHaveBeenCalled();
  expect(native.cancel).toHaveBeenCalledWith({notifications:[{id:DAILY_CHALLENGE_NOTIF_ID}]});
});
it('checks permission silently and cancels denied reminders without scheduling', async () => {
  const result=await rescheduleDailyChallenge('boot');
  expect(result.status).toBe('cancelled');
  expect(native.checkPermissions).toHaveBeenCalledOnce();
  expect(native.cancel).toHaveBeenCalledOnce();
  expect(native.schedule).not.toHaveBeenCalled();
  expect(native.then).not.toHaveBeenCalled();
});
it('web remains a no-op', async () => {
  vi.stubGlobal('Capacitor',{isNativePlatform:()=>false,getPlatform:()=> 'web'});
  await cancelDailyChallenge('test');
  expect(await rescheduleDailyChallenge('test')).toEqual({status:'noop',reason:'not_native_android'});
  expect(native.cancel).not.toHaveBeenCalled();
  expect(native.then).not.toHaveBeenCalled();
});
