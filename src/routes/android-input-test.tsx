import { createFileRoute } from "@tanstack/react-router";

import { AndroidInputIsolationTest } from "@/components/AndroidInputIsolationTest";

export const Route = createFileRoute("/android-input-test")({
  head: () => ({
    meta: [
      { title: "Android Input Test — Irth" },
      { name: "description", content: "Minimal Android WebView text input isolation test." },
    ],
  }),
  component: AndroidInputTestRoute,
});

function AndroidInputTestRoute() {
  return <AndroidInputIsolationTest />;
}
