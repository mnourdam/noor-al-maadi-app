import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Historical Games browser is intentionally hidden from players.
 * All gameplay flows through the curated Challenge Hall (/adventure).
 * Redirect at beforeLoad AND in the component for safety on direct navigation,
 * deep links, and back/forward cache restores.
 */
export const Route = createFileRoute("/games/")({
  beforeLoad: () => {
    throw redirect({ to: "/adventure" });
  },
  component: GamesRedirect,
});

function GamesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.navigate({ to: "/adventure", replace: true });
  }, [router]);
  return null;
}
