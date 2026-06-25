// عالم إرث — Phase 3: Cinematic World Atlas with deep-link URL state.
import { createFileRoute } from "@tanstack/react-router";
import { AtlasShell } from "@/components/atlas/AtlasShell";
import type { AtlasEntityKind } from "@/lib/atlas-entities";

const ATLAS_KINDS = new Set<AtlasEntityKind>([
  "place",
  "battle",
  "event",
  "figure_marker",
  "artifact_site",
  "region",
  "route_point",
]);

export type MapSearch = {
  focus?: string;
  kind?: AtlasEntityKind;
  era?: string;
  world?: string;
  q?: string;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export const Route = createFileRoute("/map")({
  validateSearch: (s: Record<string, unknown>): MapSearch => {
    const k = str(s.kind);
    return {
      focus: str(s.focus),
      kind: k && ATLAS_KINDS.has(k as AtlasEntityKind) ? (k as AtlasEntityKind) : undefined,
      era: str(s.era),
      world: str(s.world),
      q: str(s.q),
    };
  },
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
