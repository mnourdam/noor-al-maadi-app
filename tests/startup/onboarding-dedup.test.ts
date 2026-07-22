// ============================================================
// Onboarding RPC dedup + session cache
// ============================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/lib/offline/outbox", () => ({ enqueueWithId: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: vi.fn() }));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));

import {
  fetchServerCompletion,
  invalidateOnboardingCache,
} from "@/lib/tutorial/persistence";

describe("fetchServerCompletion dedup + cache", () => {
  beforeEach(() => {
    invalidateOnboardingCache();
    rpc.mockReset();
    rpc.mockResolvedValue({
      data: { ok: true, completed: true, completed_version: 1, completed_at: null },
      error: null,
    });
  });

  it("shares one in-flight promise across concurrent callers", async () => {
    const [a, b, c] = await Promise.all([
      fetchServerCompletion("t"),
      fetchServerCompletion("t"),
      fetchServerCompletion("t"),
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("caches terminal result for the session", async () => {
    await fetchServerCompletion("t");
    await fetchServerCompletion("t");
    await fetchServerCompletion("t");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("force bypasses cache", async () => {
    await fetchServerCompletion("t");
    await fetchServerCompletion("t", { force: true });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("invalidateOnboardingCache clears the session cache", async () => {
    await fetchServerCompletion("t");
    invalidateOnboardingCache();
    await fetchServerCompletion("t");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
