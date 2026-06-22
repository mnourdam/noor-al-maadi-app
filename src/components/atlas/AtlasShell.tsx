// Phase 3 — Cinematic Atlas Shell (full-screen exploration experience).
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, AlertCircle } from "lucide-react";
import {
  useWorldMapData,
  useWorldMapDerived,
  type WorldEntityType,
} from "@/lib/world-map-source";
import { useAtlasLayers, useHubEntities, type HubMarker, type Tier } from "@/lib/atlas-hubs";
import { AtlasStage } from "./AtlasStage";
import { AtlasControls } from "./AtlasControls";
import { HubPanel } from "./HubPanel";

export function AtlasShell() {
  const { data, isLoading } = useWorldMapData();
  const [era, setEra] = useState<string | null>(null);
  const [type, setType] = useState<WorldEntityType | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>(1);

  const layers = useAtlasLayers(data, { era, type, search });
  const derived = useWorldMapDerived(data, { era, type });

  const allHubs = useMemo(
    () => [...layers.cities, ...layers.landmarks, ...layers.entities],
    [layers],
  );
  const selected = useMemo(
    () => allHubs.find((m) => m.id === selectedId) ?? null,
    [allHubs, selectedId],
  );
  const linked = useHubEntities(data, selected);

  // Clear selection when filters drop it
  useEffect(() => {
    if (selectedId && !allHubs.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [allHubs, selectedId]);

  return (
    <div className="fixed inset-0 z-40 bg-amber-100" dir="rtl">
      {/* Back to app */}
      <Link
        to="/"
        className="pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-1 rounded-full border border-amber-900/30 bg-amber-50/90 px-3 py-1.5 text-[12px] font-bold text-amber-950 shadow-sm hover:bg-amber-50"
      >
        <ChevronRight className="size-4" /> الرئيسية
      </Link>

      <AtlasStage
        layers={layers}
        selectedId={selectedId}
        onSelect={(m: HubMarker | null) => setSelectedId(m?.id ?? null)}
        onTierChange={setTier}
      />

      <AtlasControls
        eras={derived.eras}
        types={derived.typesWithData}
        era={era}
        type={type}
        search={search}
        onEra={setEra}
        onType={setType}
        onSearch={setSearch}
      />

      {/* Empty / loading state */}
      {!isLoading && layers.cities.length === 0 && layers.landmarks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="pointer-events-auto rounded-2xl border border-amber-900/25 bg-amber-50/95 p-5 text-center text-amber-950 shadow-lg max-w-sm">
            <AlertCircle className="mx-auto mb-2 size-5 text-amber-800" />
            <p className="font-display font-bold">لا توجد مواقع على الخريطة بعد</p>
            <p className="mt-1 text-[12px] text-amber-900/80">
              أضف إحداثيات للمدن والمعالم من لوحة الإدارة لتبدأ التجربة.
            </p>
            <Link
              to="/admin/map"
              className="mt-3 inline-block rounded-full bg-amber-900 px-4 py-1.5 text-[12px] font-bold text-amber-50"
            >إدارة الخريطة</Link>
          </div>
        </div>
      )}

      {/* Tier hint when zoomed out and many entities exist */}
      {tier < 4 && layers.entities.length > 0 && !selected && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full border border-amber-900/25 bg-amber-50/85 px-3 py-1 text-[11px] text-amber-900 shadow-sm">
          قرّب لاكتشاف {layers.entities.length} عنصرًا تاريخيًا
        </div>
      )}

      {selected && (
        <HubPanel hub={selected} linked={linked} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
