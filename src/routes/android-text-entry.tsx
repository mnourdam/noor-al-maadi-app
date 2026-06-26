import { createFileRoute } from "@tanstack/react-router";

import { AndroidTextEntryPage } from "@/components/AndroidTextEntryPage";

export const Route = createFileRoute("/android-text-entry")({
  head: () => ({
    meta: [
      { title: "Android Text Entry — Irth" },
      { name: "description", content: "Standalone Android text-entry screen." },
    ],
  }),
  component: AndroidTextEntryRoute,
});

function AndroidTextEntryRoute() {
  return <AndroidTextEntryPage />;
}