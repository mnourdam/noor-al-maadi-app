// عالم إرث — Phase 3: Cinematic World Atlas with deep-link URL state.
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AtlasShell } from "@/components/atlas/AtlasShell";

const ATLAS_KINDS = [
  "place",
  "battle",
  "event",
  "figure_marker",
  "artifact_site",
  "region",
  "route_point",
] as const;

const mapSearchSchema = z.object({
  focus: fallback(z.string().optional(), undefined),
  kind: fallback(z.enum(ATLAS_KINDS).optional(), undefined),
  era: fallback(z.string().optional(), undefined),
  world: fallback(z.string().optional(), undefined),
  q: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(mapSearchSchema),
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
