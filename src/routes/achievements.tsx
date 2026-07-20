import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy standalone `/achievements` catalogue was retired. The canonical
 * trophy hall is now Profile → Achievements. Any historical deep link
 * (notifications, share URLs, old bookmarks) redirects here permanently.
 */
export const Route = createFileRoute("/achievements")({
  beforeLoad: ({ search }) => {
    const nextSearch: Record<string, string> = { tab: "achievements" };
    const id = (search as { id?: unknown } | undefined)?.id;
    if (typeof id === "string" && id) nextSearch.achievement = id;
    throw redirect({ to: "/profile", search: nextSearch, replace: true });
  },
  component: () => null,
});
