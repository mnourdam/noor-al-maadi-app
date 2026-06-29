// ============================================================
// Timeline Journey — LC1 scope cut.
//
// The player-facing "رحلة عبر الزمن" experience is hidden for the
// first public beta while content is being audited. The underlying
// engine in src/lib/timeline-journey.ts is kept intact for future
// release. This route now redirects directly to Home so any old
// deep link, notification, or bookmark lands somewhere meaningful
// instead of an incomplete journey.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/timeline")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
