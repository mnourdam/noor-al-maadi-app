import { createFileRoute, redirect } from "@tanstack/react-router";

// Public Historical Games browser is intentionally hidden from players.
// All gameplay flows through the curated Challenge Hall (/adventure).
export const Route = createFileRoute("/games/")({
  beforeLoad: () => {
    throw redirect({ to: "/adventure" });
  },
  component: () => null,
});
