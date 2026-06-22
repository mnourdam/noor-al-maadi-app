// عالم إرث — Phase 2 interactive world map.
// Source of truth: Supabase `encyclopedia_entities` (enabled only).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Compass, AlertCircle, BookOpen, X } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  useWorldMapData,
  useWorldMapDerived,
  ENTITY_TYPE_AR,
  ENTITY_TYPE_AR_SINGULAR,
  eraLabel,
  extractEra,
  extractLocation,
  type WorldEntity,
  type WorldEntityType,
} from "@/lib/world-map-source";
import { WorldAtlasCanvas, markerId, TYPE_ICON } from "@/components/WorldAtlasCanvas";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "عالم إرث — خريطة التاريخ الإسلامي" },
      { name: "description", content: "خريطة حيّة للتاريخ الإسلامي، مرتبطة بالموسوعة المفتوحة." },
    ],
  }),
  component: WorldMapPage,
});

function WorldMapPage() {
  const { data, isLoading } = useWorldMapData();
  const [era, setEra] = useState<string | null>(null);
  const [type, setType] = useState<WorldEntityType | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const derived = useWorldMapDerived(data, { era, type });

  // Clear selection when filters drop the active marker
  useEffect(() => {
    if (!selectedKey) return;
    if (!derived.mappable.some((m) => markerId(m) === selectedKey)) {
      setSelectedKey(null);
    }
  }, [selectedKey, derived.mappable]);

  const selected = useMemo(
    () => derived.mappable.find((m) => markerId(m) === selectedKey) ?? null,
    [derived.mappable, selectedKey],
  );

  // Group needs-location by type
  const needsByType = useMemo(() => {
    const m = new Map<WorldEntityType, WorldEntity[]>();
    for (const e of derived.needsLocation) {
      const arr = m.get(e.entity_type) ?? [];
      arr.push(e);
      m.set(e.entity_type, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [derived.needsLocation]);

  return (
    <AppShell>
      <Screen
        title="عالم إرث"
        subtitle="خريطة حيّة للتاريخ الإسلامي، مرتبطة بالموسوعة المفتوحة."
      >
        {/* Discovery stats */}
        <div className="mb-5 relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5">
          <div className="flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
              <Compass className="size-6" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gold">عالم الموسوعة</p>
              <p className="font-display text-lg font-bold">
                {isLoading ? "…" : `${derived.mappable.length} موقعًا على الخريطة`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {derived.needsLocation.length} عنصرًا يحتاج موقعًا
                {derived.total > 0 && ` · جاهزية الخريطة: ${derived.mapMetaPercent}٪`}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {derived.typesWithData.map((t) => (
              <div key={t} className="rounded-xl border border-white/10 bg-surface-2 px-2 py-2">
                <p className="font-display text-base font-bold text-gold">{derived.byType[t]}</p>
                <p className="text-[10px] text-muted-foreground">{ENTITY_TYPE_AR[t]}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Era filter */}
        {derived.eras.length > 0 && (
          <div className="mb-3 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            <button onClick={() => setEra(null)} className={chipClass(era === null)}>كل العصور</button>
            {derived.eras.map((e) => (
              <button
                key={e.id}
                onClick={() => setEra(era === e.id ? null : e.id)}
                className={chipClass(era === e.id)}
              >
                {e.label} <span className="opacity-60">({e.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Type filter */}
        {derived.typesWithData.length > 0 && (
          <div className="mb-4 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            <button onClick={() => setType(null)} className={chipClass(type === null)}>الكل</button>
            {derived.typesWithData.map((t) => (
              <button
                key={t}
                onClick={() => setType(type === t ? null : t)}
                className={chipClass(type === t)}
              >{ENTITY_TYPE_AR[t]}</button>
            ))}
          </div>
        )}

        {/* Interactive canvas */}
        <WorldAtlasCanvas
          markers={derived.mappable}
          selectedId={selectedKey}
          onSelect={(m) => setSelectedKey(m ? markerId(m) : null)}
        />

        {/* Needs-location grouped */}
        {needsByType.length > 0 && (
          <div className="mt-7">
            <h3 className="font-display mb-1 text-base font-bold flex items-center gap-2">
              <AlertCircle className="size-4 text-muted-foreground" /> تحتاج تحديد موقع
            </h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              أضف إحداثيات x/y من لوحة الإدارة لتظهر على الخريطة.
            </p>
            <div className="grid gap-3">
              {needsByType.map(([t, items]) => (
                <NeedsGroup key={t} type={t} items={items} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && derived.total === 0 && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-surface p-6 text-center">
            <p className="font-display text-base font-bold">لم تُضف مواقع كافية إلى الخريطة بعد</p>
            <Link
              to="/encyclopedia"
              className="mt-3 inline-block rounded-full bg-gradient-gold px-5 py-2 text-sm font-bold text-primary-foreground"
            >افتح الموسوعة</Link>
          </div>
        )}
      </Screen>

      {/* Marker detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelectedKey(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl border-gold/30 bg-surface">
          {selected && <MarkerDetail entity={selected} onClose={() => setSelectedKey(null)} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function chipClass(active: boolean): string {
  return `shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
    active
      ? "border-gold bg-gradient-gold text-primary-foreground shadow-gold"
      : "border-white/15 bg-surface text-muted-foreground"
  }`;
}

function NeedsGroup({ type, items }: { type: WorldEntityType; items: WorldEntity[] }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[type];
  const shown = open ? items : items.slice(0, 4);
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-white/5 text-muted-foreground">
            <Icon className="size-3.5" />
          </div>
          <p className="font-display text-sm font-bold">{ENTITY_TYPE_AR[type]}</p>
          <span className="text-[11px] text-muted-foreground">({items.length})</span>
        </div>
        {items.length > 4 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] text-gold"
          >{open ? "اطوِ" : "اعرض الكل"}</button>
        )}
      </div>
      <div className="mt-2 grid gap-1.5">
        {shown.map((e) => (
          <Link
            key={`${e.entity_type}-${e.slug}`}
            to="/encyclopedia/entity/$id"
            params={{ id: e.slug }}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[12px] hover:bg-white/5"
          >
            <span className="truncate">{e.title}</span>
            <BookOpen className="size-3.5 text-muted-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function MarkerDetail({ entity, onClose }: { entity: WorldEntity; onClose: () => void }) {
  const Icon = TYPE_ICON[entity.entity_type];
  const era = extractEra(entity.metadata);
  const location = extractLocation(entity.metadata);
  const summary = entity.summary || entity.subtitle || "";
  const related = Array.isArray((entity.metadata as { related?: unknown }).related)
    ? ((entity.metadata as { related?: unknown[] }).related as unknown[])
    : [];

  return (
    <div dir="rtl">
      <SheetHeader className="text-right">
        <div className="flex items-start gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shrink-0">
            <Icon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="font-display text-lg">{entity.title}</SheetTitle>
            <SheetDescription className="mt-1 text-[12px]">
              {ENTITY_TYPE_AR_SINGULAR[entity.entity_type]}
              {era && ` · ${eraLabel(era)}`}
              {location && ` · ${location}`}
            </SheetDescription>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      </SheetHeader>

      {summary && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{summary}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: entity.slug }}
          className="rounded-full bg-gradient-gold px-4 py-2.5 text-center text-sm font-bold text-primary-foreground"
        >افتح في الموسوعة</Link>
        {related.length > 0 && (
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: entity.slug }}
            hash="related"
            className="rounded-full border border-gold/40 px-4 py-2.5 text-center text-sm font-bold text-gold"
          >اعرض المرتبطات ({related.length})</Link>
        )}
      </div>
    </div>
  );
}
