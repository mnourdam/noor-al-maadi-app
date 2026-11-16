import { expect, it, vi } from 'vitest';
import { createServerFn, createMiddleware } from '../../src/shims/tanstack-react-start.android';
vi.mock('@tanstack/react-start', () => import('../../src/shims/tanstack-react-start.android'));
vi.mock('@tanstack/react-start/server', () => import('../../src/shims/tanstack-react-start-server.android'));

it('constructs the production achievement module without invoking server code', async () => {
  const claims = await import('../../src/lib/achievements/v2/claim.functions');
  expect(typeof claims.claimAchievements).toBe('function');
  await expect(claims.claimAchievements({ data: { ids: [], engineVersion: 1 } })).rejects.toThrow('Server functions are not available');
});

it('supports validator chains while retaining middleware, method and fail-closed execution', async () => {
  const validator = vi.fn((data: unknown) => data);
  const server = vi.fn();
  const middleware = createMiddleware().server(server);
  const base = createServerFn({ method: 'POST' });
  const builder = base.middleware([middleware]).validator(validator).middleware([middleware]);
  expect(builder.options.validator).toBe(validator);
  expect(builder.options.middleware).toEqual([middleware, middleware]);
  expect(base.options.middleware).toBeUndefined();
  const fn = (builder.handler as any)(server);
  expect(fn.method).toBe('POST');
  await expect(fn({ data: {} })).rejects.toThrow('Server functions are not available');
  expect(server).not.toHaveBeenCalled();
  expect(validator).not.toHaveBeenCalled();
});

it('preserves existing inputValidator API and default GET', async () => {
  const validator = vi.fn();
  const builder = createServerFn().inputValidator(validator);
  expect(builder.options.inputValidator).toBe(validator);
  const fn = builder.handler();
  expect(fn.method).toBe('GET');
  await expect(fn()).rejects.toThrow('Server functions are not available');
});
