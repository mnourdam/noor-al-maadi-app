import { createFileRoute } from "@tanstack/react-router";

import { AndroidAuthMinTest } from "@/components/AndroidAuthMinTest";

export const Route = createFileRoute("/android-auth-min")({
  head: () => ({
    meta: [
      { title: "Android Auth Min — Irth" },
      { name: "description", content: "Minimal Android auth input isolation test." },
    ],
  }),
  component: AndroidAuthMinRoute,
});

function AndroidAuthMinRoute() {
  return <AndroidAuthMinTest />;
}