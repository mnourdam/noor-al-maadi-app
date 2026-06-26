import { createFileRoute } from "@tanstack/react-router";

import { AndroidCampaignInputMinTest } from "@/components/AndroidCampaignInputMinTest";

export const Route = createFileRoute("/android-campaign-input-min")({
  head: () => ({
    meta: [
      { title: "Android Campaign Input Min — Irth" },
      { name: "description", content: "Minimal Android campaign text input isolation test." },
    ],
  }),
  component: AndroidCampaignInputMinRoute,
});

function AndroidCampaignInputMinRoute() {
  return <AndroidCampaignInputMinTest />;
}