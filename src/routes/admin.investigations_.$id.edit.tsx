import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminGate } from "@/lib/admin-guard";
import { InvestigationEditor } from "@/components/admin-investigations/InvestigationEditor";

export const Route = createFileRoute("/admin/investigations_/$id/edit")({
  head: () => ({
    meta: [
      { title: "محرر التحقيقات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <EditorRoute />
    </AdminGate>
  ),
});

function EditorRoute() {
  const { id } = useParams({ from: "/admin/investigations_/$id/edit" });
  return <InvestigationEditor investigationId={id} />;
}
