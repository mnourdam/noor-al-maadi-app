import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminGate } from "@/lib/admin-guard";
import { CampaignEditor } from "@/components/admin-campaigns/CampaignEditor";

export const Route = createFileRoute("/admin/campaigns/$id/edit")({
  head: () => ({
    meta: [
      { title: "محرر الحملة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><EditorRoute /></AdminGate>,
});

function EditorRoute() {
  const { id } = useParams({ from: "/admin/campaigns/$id/edit" });
  return <CampaignEditor campaignId={id} />;
}
