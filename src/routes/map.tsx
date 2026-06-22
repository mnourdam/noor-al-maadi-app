// عالم إرث — Phase 1 world map.
// Source of truth: Supabase `encyclopedia_entities` (enabled only).
// No hardcoded regions, no legacy packs, no fake percentages.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Compass, MapPin, BookOpen, AlertCircle } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  useWorldMapData,
  useWorldMapDerived,
  ENTITY_TYPE_AR,
  ENTITY_TYPE_AR_SINGULAR,
  eraLabel,
  extractEra,
  extractLocation,
  type WorldEntityType,
} from "@/lib/world-map-source";

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
  const derived = useWorldMapDerived(data, { era, type });

  return (
    <AppShell>
      <Screen
        title="عالم إرث"
        subtitle="خريطة حيّة للتاريخ الإسلامي، مرتبطة بالموسوعة المفتوحة."
      >
        {/* Stats header */}
        <div className="mb-5 relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5">
          <div className="relative flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
              <Compass className="size-6" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gold">عالم الموسوعة</p>
              <p className="font-display text-lg font-bold">
                {isLoading ? "…" : `${derived.total} عنصرًا في الموسوعة`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {derived.mappable.length} موقعًا قابلًا للعرض على الخريطة
                {derived.total > 0 && ` · ${derived.mapMetaPercent}٪ يحتوي إحداثيات`}
              </p>
            </div>
          </div>

          {/* per-type counts grid */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {derived.typesWithData.map((t) => (
              <div key={t} className="rounded-xl border border-white/10 bg-surface-2 px-2 py-2">
                <p className="font-display text-base font-bold text-gold">{derived.byType[t]}</p>
                <p className="text-[10px] text-muted-foreground">{ENTITY_TYPE_AR[t]}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Era filter — only eras with data */}
        {derived.eras.length > 0 && (
          <div className="mb-3 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              onClick={() => setEra(null)}
              className={chipClass(era === null)}
            >كل العصور</button>
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

        {/* Type filter — only types with data */}
        {derived.typesWithData.length > 0 && (
          <div className="mb-4 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            <button
              onClick={() => setType(null)}
              className={chipClass(type === null)}
            >الكل</button>
            {derived.typesWithData.map((t) => (
              <button
                key={t}
                onClick={() => setType(type === t ? null : t)}
                className={chipClass(type === t)}
              >{ENTITY_TYPE_AR[t]}</button>
            ))}
          </div>
        )}

        {/* Map canvas placeholder (Phase 1: premium foundation, markers come later) */}
        <MapCanvas mappableCount={derived.mappable.length} />

        {/* Mappable entities rail */}
        {derived.mappable.length > 0 && (
          <>
            <h3 className="font-display mt-7 mb-3 text-base font-bold flex items-center gap-2">
              <MapPin className="size-4 text-gold" /> مواقع على الخريطة
            </h3>
            <div className="grid gap-2">
              {derived.mappable.map((e) => (
                <EntityRow key={`${e.entity_type}-${e.slug}`} entity={e} />
              ))}
            </div>
          </>
        )}

        {/* Needs-location list */}
        {derived.needsLocation.length > 0 && (
          <>
            <h3 className="font-display mt-7 mb-3 text-base font-bold flex items-center gap-2">
              <AlertCircle className="size-4 text-muted-foreground" />
              تحتاج تحديد موقع
              <span className="text-[11px] font-normal text-muted-foreground">
                ({derived.needsLocation.length})
              </span>
            </h3>
            <div className="grid gap-2">
              {derived.needsLocation.slice(0, 12).map((e) => (
                <EntityRow key={`${e.entity_type}-${e.slug}`} entity={e} muted />
              ))}
              {derived.needsLocation.length > 12 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  و{derived.needsLocation.length - 12} عنصرًا آخر…
                </p>
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {!isLoading && derived.total === 0 && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-surface p-6 text-center">
            <p className="font-display text-base font-bold">
              لم تُضف مواقع كافية إلى الخريطة بعد
            </p>
            <Link
              to="/encyclopedia"
              className="mt-3 inline-block rounded-full bg-gradient-gold px-5 py-2 text-sm font-bold text-primary-foreground"
            >افتح الموسوعة</Link>
          </div>
        )}
      </Screen>
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

function EntityRow({
  entity,
  muted,
}: {
  entity: { slug: string; entity_type: WorldEntityType; title: string; subtitle: string | null; metadata: Record<string, unknown> };
  muted?: boolean;
}) {
  const era = extractEra(entity.metadata);
  const location = extractLocation(entity.metadata);
  return (
    <Link
      to="/encyclopedia/entity/$id"
      params={{ id: entity.slug }}
      className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
        muted
          ? "border-white/10 bg-surface/60 hover:bg-surface"
          : "border-gold/20 bg-surface hover:border-gold/50"
      }`}
    >
      <div className={`grid size-10 place-items-center rounded-xl ${
        muted ? "bg-white/5 text-muted-foreground" : "bg-gradient-gold text-primary-foreground"
      }`}>
        <MapPin className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm font-bold truncate">{entity.title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
          {ENTITY_TYPE_AR_SINGULAR[entity.entity_type]}
          {era && ` · ${eraLabel(era)}`}
          {location && ` · ${location}`}
          {!era && !location && entity.subtitle && ` · ${entity.subtitle}`}
        </p>
      </div>
      <BookOpen className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

// Premium parchment/dark map canvas foundation.
// Phase 1: visual placeholder ready for real markers in Phase 2.
function MapCanvas({ mappableCount }: { mappableCount: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border-2 border-amber-900/30 map-parchment map-vignette shadow-elegant"
      dir="ltr"
    >
      <div className="absolute right-3 top-3 z-10 rounded-xl border border-amber-900/40 bg-amber-50/70 px-3 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm" dir="rtl">
        ⚜︎ عالم إرث ⚜︎
      </div>
      <div className="absolute left-3 bottom-3 z-10 text-amber-900/70">
        <svg width="44" height="44" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 1" />
          <path d="M20,3 L23,20 L20,37 L17,20 Z" fill="currentColor" opacity="0.7" />
          <path d="M3,20 L20,17 L37,20 L20,23 Z" fill="currentColor" opacity="0.45" />
          <text x="20" y="9" textAnchor="middle" fontSize="4" fill="currentColor" fontWeight="700">N</text>
        </svg>
      </div>
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-[360px]"
      >
        <defs>
          <pattern id="wm-grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0 L0 0 0 5" fill="none" stroke="oklch(0.32 0.06 50 / 0.2)" strokeWidth="0.1" />
          </pattern>
          <pattern id="wm-sea" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.55 0.08 230 / 0.25)" strokeWidth="0.15" />
          </pattern>
        </defs>
        <rect width="100" height="60" fill="url(#wm-sea)" opacity="0.5" />
        <rect width="100" height="60" fill="url(#wm-grid)" />
        <g className="ink-stroke-light" fill="none" strokeWidth="0.2">
          <path d="M2,20 Q25,24 50,20 T98,20" />
          <path d="M2,42 Q30,46 60,42 T98,44" />
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 p-3 text-center" dir="rtl">
        <p className="text-[11px] text-amber-950/80 bg-amber-50/70 inline-block rounded-full px-3 py-1 border border-amber-900/30">
          {mappableCount > 0
            ? `${mappableCount} موقعًا جاهزة للعرض — العلامات التفاعلية في المرحلة القادمة`
            : "الخريطة جاهزة — أضف إحداثيات للعناصر لتظهر العلامات هنا"}
        </p>
      </div>
    </div>
  );
}
