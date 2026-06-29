import { createFileRoute, Navigate } from "@tanstack/react-router";

// Seasons feature is deferred post-LC1. The route remains so deep links and
// any lingering notifications don't 404 — they bounce back to the profile.
// All underlying state (SEASONS, seasonPoints, seasonClaimed, claimSeason,
// cloud-save fields) is intentionally preserved.
export const Route = createFileRoute("/seasons")({
  head: () => ({ meta: [{ title: "حسابي" }] }),
  component: SeasonsRedirect,
});

function SeasonsRedirect() {
  return <Navigate to="/profile" replace />;
}
