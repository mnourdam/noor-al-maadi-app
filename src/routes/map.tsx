// عالم إرث — Phase 3: Cinematic World Atlas (full-screen exploration).
import { createFileRoute } from "@tanstack/react-router";
import { AtlasShell } from "@/components/atlas/AtlasShell";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "عالم إرث — أطلس التاريخ الإسلامي" },
      { name: "description", content: "أطلس تفاعلي للتاريخ الإسلامي: أقاليم، مدن، معالم، وأحداث، مرتبطة مباشرة بالموسوعة." },
    ],
  }),
  component: WorldMapPage,
});

function WorldMapPage() {
  return <AtlasShell />;
}
