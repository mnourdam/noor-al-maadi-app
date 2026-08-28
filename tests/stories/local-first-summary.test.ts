// ============================================================
// V16 — Home Stories are LOCAL FIRST
// ------------------------------------------------------------
// • baseline in memory + empty IndexedDB still returns all stories
// • navigator.onLine === true with a hanging RPC falls back locally
// • a rejected RPC never empties the rail
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

const BASELINE_STORIES = Array.from({ length: 116 }, (_, i) => ({
  id: `story_${i}`,
  slug: `story-${i}`,
  title_ar: `قصة ${i}`,
  status: "published",
  display_order: i,
  unlock_spec: { type: "always" },
  cover_media_id: i < 114 ? `media-${i}` : null,
}));

let localReady = false;

vi.mock("@/lib/offline-baseline-resolver", () => ({
  getLocalLibraryStories: () => BASELINE_STORIES,
  getLocalSceneCount: () => 5,
  isBaselineInMemory: () => true,
  getBaselineContent: async () => ({}),
  __setReady: (v: boolean) => { localReady = v; },
}));

vi.mock("@/lib/stories/unlock-cache", () => ({
  loadUnlockedIds: async () => new Set<string>(),
  persistUnlockedIds: async () => {},
}));

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

vi.mock("@/lib/identity/owner", () => ({ getActiveUserId: () => null }));

import { buildLocalStorySummaries, listStoriesSummary, STORY_SUMMARY_RPC_TIMEOUT_MS } from "@/lib/stories/summary";

describe("Home Stories — local first", () => {
  beforeEach(() => {
    rpc.mockReset();
    localReady = false;
    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  });

  it("returns every library story from the baseline with an empty IndexedDB", async () => {
    const rows = await buildLocalStorySummaries(null, null);
    expect(rows.length).toBe(116);
    expect(rows.filter((r) => r.cover_media_id).length).toBe(114);
    expect(rows.every((r) => r.unlocked)).toBe(true);
  });

  it("falls back locally when onLine is true but the RPC hangs", async () => {
    vi.useFakeTimers();
    rpc.mockImplementation(() => new Promise(() => {}));
    const promise = listStoriesSummary(null);
    await vi.advanceTimersByTimeAsync(STORY_SUMMARY_RPC_TIMEOUT_MS + 10);
    const rows = await promise;
    vi.useRealTimers();
    expect(rows.length).toBe(116);
  });

  it("falls back locally when the RPC rejects", async () => {
    rpc.mockImplementation(() => Promise.reject(new Error("network")));
    const rows = await listStoriesSummary(null);
    expect(rows.length).toBe(116);
  });

  it("falls back locally when the RPC returns an error payload", async () => {
    rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: "offline" } }));
    const rows = await listStoriesSummary(null);
    expect(rows.length).toBe(116);
  });
});
