import type { ReactNode } from "react";
import type { PublicContributionNotice as NoticeData } from "@/lib/social/contributions";
import type { FriendEntry } from "@/lib/social";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  COMMUNITY_CONTROL_MESSAGES as dictionaries,
  communityCount,
} from "@/lib/ui-language/community-control-messages";
import { TARGET_LOCALES } from "@/lib/ui-language/locale-policy";
import { UI_MESSAGES } from "@/lib/ui-language/messages";
import { PublicContributionsNotice } from "@/components/social/PublicContributionsNotice";
import { ContributionBadge } from "@/components/social/ContributionBadge";
import { CommunityHubSection } from "@/components/CommunityHubSection";
const state = vi.hoisted(() => ({
  locale: "en",
  pending: 0,
  user: null as null | { id: string },
  rows: [] as NoticeData[],
  friends: [] as FriendEntry[],
}));
vi.mock("@/lib/ui-language/store", () => ({ useUiLanguage: () => ({ language: state.locale }) }));
vi.mock("@/lib/account", () => ({ useAccount: () => ({ user: state.user }) }));
vi.mock("@/lib/social", () => ({ listFriendships: async () => state.friends }));
vi.mock("@/lib/pending-badges", () => ({
  usePendingBadge: () => state.pending,
  refreshPendingBadges: async () => {},
}));
vi.mock("@/lib/social/contributions", () => ({ listPublicContributions: async () => state.rows }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  state.locale = "en";
  state.pending = 0;
  state.user = null;
  state.rows = [];
  state.friends = [];
});
it("has 33 nonempty keys with token parity in six still-gated dictionaries", () => {
  const keys = Object.keys(dictionaries.ar).sort();
  expect(keys).toHaveLength(33);
  for (const locale of TARGET_LOCALES) {
    expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
    for (const key of keys as (keyof typeof dictionaries.ar)[]) {
      expect(dictionaries[locale][key].trim()).toBeTruthy();
      expect(dictionaries[locale][key].match(/\{\w+\}/g)).toEqual(
        dictionaries.ar[key].match(/\{\w+\}/g),
      );
    }
  }
  expect(Object.keys(UI_MESSAGES).sort()).toEqual(["ar", "en"]);
});
it("uses explicit singular/plural forms and preserves Arabic legacy outputs", () => {
  expect(communityCount("en", "friends", 1)).toBe("1 friend");
  expect(communityCount("en", "friends", 2)).toBe("2 friends");
  expect(communityCount("fr", "friends", 1)).toBe("1 ami");
  expect(communityCount("fr", "friends", 2)).toBe("2 amis");
  expect(communityCount("tr", "requests", 2)).toBe("2 yeni istek");
  expect(communityCount("ur", "requests", 2)).toBe("2 نئی درخواستیں");
  expect(communityCount("ar", "friends", 2)).toBe("الأصدقاء: 2");
  expect(communityCount("ar", "requests", 1)).toBe("طلب جديد");
  for (const locale of TARGET_LOCALES)
    for (const count of [0, 1, 2, 99, 100])
      for (const kind of ["friends", "requests", "pending", "more"] as const) {
        expect(communityCount(locale, kind, count)).not.toMatch(/[{}]/);
      }
});
it("translates notice chrome without translating public notice body", async () => {
  state.rows = [
    {
      category: "fact_correction",
      applied_at: "2026-11-16T10:00:00Z",
      public_notice_text: "نص تحريري محفوظ كما هو",
    },
  ];
  render(<PublicContributionsNotice anchorType="story" anchorId="example" />);
  expect(await screen.findByText("نص تحريري محفوظ كما هو")).toBeTruthy();
  expect(screen.getByText("Readers helped improve this content")).toBeTruthy();
  expect(screen.getByText(/Factual correction/)).toBeTruthy();
});
it("renders guest controls and preserves sign-in boundary", () => {
  render(<CommunityHubSection />);
  expect(screen.getByText("Irth community")).toBeTruthy();
  expect(screen.getByText("Sign up to get started")).toBeTruthy();
  expect(screen.getByText("Sign in to add friends and follow their progress.")).toBeTruthy();
});
it("keeps absent contribution badges hidden and translates applied labels", () => {
  const { rerender } = render(<ContributionBadge flag={null} />);
  expect(screen.queryByText("You helped improve Irth")).toBeNull();
  rerender(
    <ContributionBadge
      flag={{
        comment_id: "example",
        status: "applied",
        category: "source_reference",
        applied_at: null,
      }}
    />,
  );
  expect(screen.getByText("You helped improve Irth")).toBeTruthy();
  expect(screen.getByTitle("Source or reference")).toBeTruthy();
});

it("uses count-neutral Arabic labels beyond one", () => {
  expect(communityCount("ar", "friends", 3)).toBe("الأصدقاء: 3");
  expect(communityCount("ar", "requests", 11)).toBe("طلبات جديدة: 11");
  expect(communityCount("ar", "pending", 2)).toBe("طلبات صداقة بانتظار الرد: 2");
});

it("mirrors the pending-request navigation arrow in LTR only", () => {
  state.pending = 1;
  const { container } = render(<CommunityHubSection />);
  expect(screen.getByText("You have a new friend request")).toBeTruthy();
  const arrow = container.querySelector("svg.ltr\\:rotate-180");
  expect(arrow).toBeTruthy();
  expect(arrow?.classList.contains("rotate-180")).toBe(false);
});
