/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCampaignLockMap } from "./useCampaignProgression";
import * as progressionLib from "./progression";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: { campaignsCompleted: [], storiesRead: [], points: 100 },
    hydrated: true,
  }),
}));
vi.mock("@/lib/achievements/v2/driver", () => ({ useAchievementViews: () => [] }));
vi.mock("./completions", () => ({
  localCompletedIds: () => [],
  unionCompletedIds: async (ids: string[]) => ids,
}));

describe("useCampaignLockMap Caching", () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const sections = [{ campaigns: [{ id: "c1", section_key: "test" }] }];

  it("caches the result if sections and state are identical", () => {
    const spy = vi.spyOn(progressionLib, "computeLockMapByGroup");
    
    const { rerender } = renderHook(({ s }) => useCampaignLockMap(s), { 
      wrapper,
      initialProps: { s: sections }
    });
    
    // We expect initial calls on mount
    const countAfterMount = spy.mock.calls.length;
    expect(countAfterMount).toBeGreaterThan(0);

    // Rerender with same identity
    rerender({ s: sections });
    
    // Global cache should prevent incrementing
    expect(spy.mock.calls.length).toBe(countAfterMount);
  });
});
