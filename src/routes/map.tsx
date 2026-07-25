// عالم إرث — Phase 3: Cinematic World Atlas with deep-link URL state.
import { createFileRoute } from "@tanstack/react-router";
import { AtlasShell } from "@/components/atlas/AtlasShell";
import type { AtlasEntityKind } from "@/lib/atlas-entities";
import { androidMark } from "@/lib/androidFreezeDiagnostics";

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
  /** Optional zoom hint for deep-links (e.g. from encyclopedia). Clamped 1.5–8. */
  zoom?: number;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1.5, Math.min(8, n));
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
      zoom: num(s.zoom),
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
  androidMark("render:AtlasRoute");
  const queryClient = useQueryClient();

  // App-restart safety: if the previous session died on this route, do NOT
  // remount the same renderer that killed it. Open safe mode instead, with an
  // explicit one-tap way back into the interactive Atlas.
  const [forceSafe, setForceSafe] = useState(() => hasAtlasCrashMarker());
  // Device capability gate — no canvas at all means the raster stage cannot run.
  const [deviceUnsupported] = useState(() => !hasCanvas2d());

  useEffect(() => {
    releaseUiLocks();
  }, []);

  if (deviceUnsupported) {
    return <AtlasSafeMode reason="device" />;
  }

  if (forceSafe) {
    return (
      <AtlasSafeMode
        reason="error"
        onRetry={() => { clearAtlasCrashMarker(); releaseUiLocks(); setForceSafe(false); }}
        onResetData={() => { void resetAtlasData(queryClient).then(() => setForceSafe(false)); }}
      />
    );
  }

  return (
    <AtlasErrorBoundary queryClient={queryClient}>
      <AtlasShell />
    </AtlasErrorBoundary>
  );
}
