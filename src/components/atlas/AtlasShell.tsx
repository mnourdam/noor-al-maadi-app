// Phase 2 stabilization — Cinematic Atlas Shell.
// Single data source: published+verified atlas_entities. Compact popover
// detail (no full-side sheet). No "locate on map" affordance.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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

export function AtlasShell() {
  const { data: entities = [], isLoading } = usePublishedAtlasEntities();
  const [kind, setKind] = useState<AtlasEntityKind | null>(null);
  const [era, setEra] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const facets = useMemo(() => buildAtlasFacets(entities), [entities]);
  const visible = useMemo(
    () => filterAtlasEntities(entities, { kind, era, search }),
    [entities, kind, era, search],
  );

  const entityById = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities],
  );
  const selected = selectedId ? entityById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !visible.find((e) => e.id === selectedId)) {
      setSelectedId(null);
    }
  }, [visible, selectedId]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950" dir="rtl">
      <Link
        to="/"
        className="pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-1 rounded-full border border-amber-400/30 bg-slate-950/80 px-3 py-1.5 text-[12px] font-bold text-amber-100 shadow-sm hover:bg-slate-900"
      >
        <ChevronRight className="size-4" /> الرئيسية
      </Link>

      <AtlasStage
        entities={visible}
        selectedId={selectedId}
        onSelect={(e) => setSelectedId(e?.id ?? null)}
      />

      <AtlasControls
        facets={facets}
        kind={kind}
        era={era}
        search={search}
        onKind={setKind}
        onEra={setEra}
        onSearch={setSearch}
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
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
