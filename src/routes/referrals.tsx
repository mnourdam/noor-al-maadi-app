import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Phase 2 (Referrals removal): `/referrals` was retired. Legacy links, old
 * bookmarks, and any historical APK that still deep-links here get a
 * permanent redirect to the profile page. There is no replacement route.
 */
export const Route = createFileRoute("/referrals")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", replace: true });
  },
  component: () => null,
});
