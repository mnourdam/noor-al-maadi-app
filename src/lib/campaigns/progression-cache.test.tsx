/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

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
    
    // We use a singleton sections to keep identity stable
    const { rerender } = renderHook(({ s }) => useCampaignLockMap(s), { 
      wrapper,
      initialProps: { s: sections }
    });
    
    // The hook might re-run several times during initial mount due to 
    // internal dependencies in useProgressionState (profile, etc).
    // We capture the state AFTER mount is settled.
    const initialCalls = spy.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    // Rerender with same identity. 
    // This should NOT trigger a recompute because globalLockMapCache 
    // will hit on the same `sections` and `state`.
    rerender({ s: sections });
    
    expect(spy.mock.calls.length).toBe(initialCalls);
  });


  it("recomputes when sections identity changes", () => {
    const spy = vi.spyOn(progressionLib, "computeLockMapByGroup");
    
    const { rerender } = renderHook(({ s }) => useCampaignLockMap(s), { 
      wrapper,
      initialProps: { s: sections }
    });
    const initialCalls = spy.mock.calls.length;

    const newSections = [...sections];
    rerender({ s: newSections });
    
    // Should HAVE incremented
    expect(spy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

});
