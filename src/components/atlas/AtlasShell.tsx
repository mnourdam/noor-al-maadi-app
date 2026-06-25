// Phase 3 — Cinematic Atlas Shell.
// Single data source: published+verified atlas_entities. The Atlas is a
// visualization layer ONLY: it provides coordinates, color, and navigation.
// All textual content (titles, summaries, subtitles) is fetched live from
// encyclopedia_entities so an article edit propagates without DB duplication.
//
// URL state: ?focus, ?kind, ?era, ?world are deep-linkable.
import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { AtlasStage } from "./AtlasStage";
import {
  AtlasControls,
  buildAtlasFacets,
  filterAtlasEntities,
} from "./AtlasControls";
import { AtlasEntityDetailPanel } from "./AtlasEntityDetailPanel";
import { usePublishedAtlasEntities } from "@/lib/atlas-entities-query";
import type { AtlasEntityKind } from "@/lib/atlas-entities";
import { sortAtlasEntitiesChronological } from "@/lib/atlas/atlas-visual";
import { Route as MapRoute } from "@/routes/map";

export function AtlasShell() {
  const { data: entities = [], isLoading } = usePublishedAtlasEntities();

  // URL state — single source of truth for filters + selection.
  const search = MapRoute.useSearch();
  const navigate = useNavigate({ from: MapRoute.fullPath });
  const kind = (search.kind ?? null) as AtlasEntityKind | null;
  const era = search.era ?? null;
  const world = search.world ?? null;
  const q = search.q ?? "";
  const focus = search.focus ?? null;

  const setSearchParam = <K extends keyof typeof search>(
    key: K,
    value: (typeof search)[K] | null,
  ) =>
    navigate({
      to: MapRoute.fullPath,
      search: (prev) => ({ ...prev, [key]: value ?? undefined }),
      replace: true,
    });

  const facets = useMemo(() => buildAtlasFacets(entities), [entities]);
  const visible = useMemo(
    () =>
      sortAtlasEntitiesChronological(
        filterAtlasEntities(entities, { kind, era, world, search: q }),
      ),
    [entities, kind, era, world, q],
  );

  const entityById = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );
  const selected = focus ? entityById.get(focus) ?? null : null;

  // If the focused entity is filtered out, drop the focus from the URL.
  useEffect(() => {
    if (focus && !visible.find((e) => e.id === focus)) {
      setSearchParam("focus", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focus]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950" dir="rtl">
      <Link
        to="/"
        className="pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-1 rounded-full border border-amber-400/30 bg-slate-950/80 px-3 py-1.5 text-[12px] font-bold text-amber-100 shadow-sm hover:bg-slate-900"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <ChevronRight className="size-4" /> الرئيسية
      </Link>

      <AtlasStage
        entities={visible}
        selectedId={focus}
        onSelect={(e) => setSearchParam("focus", e?.id ?? null)}
      />

      <AtlasControls
        facets={facets}
        kind={kind}
        era={era}
        world={world}
        search={q}
        onKind={(v) => setSearchParam("kind", v)}
        onEra={(v) => setSearchParam("era", v)}
        onWorld={(v) => setSearchParam("world", v)}
        onSearch={(v) => setSearchParam("q", v || null)}
      />

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-full border border-amber-400/30 bg-slate-950/80 px-4 py-2 text-[12px] text-amber-100 shadow-lg">
            <Loader2 className="ml-2 inline size-3.5 animate-spin" />
            جاري تحميل الأطلس...
          </div>
        </div>
      )}

      {!isLoading && entities.length > 0 && visible.length === 0 && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-950/80 px-4 py-1.5 text-[12px] text-amber-100">
          لا توجد نتائج مطابقة
        </div>
      )}

      {selected && (
        <AtlasEntityDetailPanel
          entity={selected}
          onClose={() => setSearchParam("focus", null)}
        />
      )}
    </div>
  );
}
