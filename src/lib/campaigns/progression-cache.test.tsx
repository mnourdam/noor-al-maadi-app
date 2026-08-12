import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCampaignLockMap } from "./useCampaignProgression";
import * as progressionLib from "./progression";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mocking dependencies
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: {
      campaignsCompleted: [],
      storiesRead: [],
      points: 100,
    },
    hydrated: true,
  }),
}));

vi.mock("@/lib/achievements/v2/driver", () => ({
  useAchievementViews: () => [],
}));

vi.mock("./completions", () => ({
  localCompletedIds: () => [],
  unionCompletedIds: async (ids: string[]) => ids,
}));

describe("useCampaignLockMap Caching", () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const sections = [
    {
      divider: { id: "d1", rawSectionKey: "test" },
      campaigns: [{ id: "c1", title: "C1", section_key: "test" }],
    },
  ];

  it("caches the result if sections and state are identical", () => {
    const spy = vi.spyOn(progressionLib, "computeLockMapByGroup");
    
    const { rerender, result: result1 } = renderHook(() => useCampaignLockMap(sections), { wrapper });
    expect(spy).toHaveBeenCalledTimes(1);

    // Second render with same identity
    const { result: result2 } = renderHook(() => useCampaignLockMap(sections), { wrapper });
    
    // It should have been called again by the NEW hook instance if the cache wasn't global,
    // but with the global cache, we check if computeLockMapByGroup was bypassed.
    // NOTE: In vitest, renderHook creates a fresh environment, but global variables persist.
    
    rerender();
    // Identity of sections is same, identity of state (from useMemo) should be same if no deps changed.
    expect(spy).toHaveBeenCalledTimes(1); 
  });

  it("recomputes when sections identity changes", () => {
    const spy = vi.spyOn(progressionLib, "computeLockMapByGroup");
    
    renderHook(() => useCampaignLockMap(sections), { wrapper });
    const newSections = [...sections];
    renderHook(() => useCampaignLockMap(newSections), { wrapper });
    
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
