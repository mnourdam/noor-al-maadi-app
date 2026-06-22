// P0-B — EntityPanel.
// Replaces the old HubPanel "dead-end popup" with a discovery surface that
// automatically groups connected encyclopedia content and proximity neighbours,
// and lets the user navigate into related entities or open them in the
// encyclopedia. No empty dead-end screens — every section either shows content
// or an explicit "coming soon" line so the user always knows where they stand.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen, Building2, Calendar, ChevronLeft, Compass, Crown,
  Gem, Landmark, MapPin, Swords, User, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ENTITY_TYPE_AR_SINGULAR,
  eraLabel,
  extractCoords,
  extractEra,
  type WorldEntity,
  type WorldEntityType,
} from "@/lib/world-map-source";
import { ATLAS_REGIONS } from "@/lib/atlas-regions";
import type { HubMarker } from "@/lib/atlas-hubs";

const ICON: Record<WorldEntityType, LucideIcon> = {
  city: Building2, battle: Swords, figure: User, landmark: Landmark,
  artifact: Gem, event: Calendar, state: Crown,
};

const GROUP_ORDER: WorldEntityType[] = [
  "figure", "battle", "event", "artifact", "state", "landmark", "city",
];

export type EntityContext = {
  /** Encyclopedia entities directly linked or sharing region/era. */
  related: WorldEntity[];
  /** Entities within atlas proximity that aren't already in `related`. */
  nearby: (WorldEntity & { distance: number })[];
};

export function EntityPanel({
  hub,
  context,
  onClose,
  onNavigate,
  onLocate,
}: {
  hub: HubMarker;
  context: EntityContext;
  onClose: () => void;
  /** Called when the user picks a related entity that exists on the atlas. */
  onNavigate: (entity: WorldEntity) => void;
  /** Pan/zoom the atlas to focus this hub. */
  onLocate: () => void;
}) {
  const Icon = ICON[hub.entity_type];
  const regionName = hub.region
    ? ATLAS_REGIONS.find((r) => r.id === hub.region)?.name
    : null;
  const era = extractEra(hub.metadata);

  const groups = useMemo(() => {
    const map = new Map<WorldEntityType, WorldEntity[]>();
    for (const e of context.related) {
      const arr = map.get(e.entity_type) ?? [];
      arr.push(e);
      map.set(e.entity_type, arr);
    }
    return map;
  }, [context.related]);

  const totalRelated = context.related.length;
  const hasAnything = totalRelated > 0 || context.nearby.length > 0;

  return (
    <aside
      dir="rtl"
      className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col
                 border-l border-amber-900/30 bg-amber-50/95 text-amber-950 shadow-2xl
                 animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-amber-900/20 p-4">
        <div
          className="grid size-14 place-items-center rounded-2xl text-amber-50 shrink-0 shadow-sm"
          style={{ backgroundImage: "linear-gradient(135deg, oklch(0.32 0.09 45), oklch(0.45 0.12 50))" }}
        >
          <Icon className="size-7" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] uppercase tracking-wider text-amber-800/80">
            <span className="font-bold">{ENTITY_TYPE_AR_SINGULAR[hub.entity_type]}</span>
            {regionName && (<><span aria-hidden>·</span><span>{regionName}</span></>)}
            {era && (<><span aria-hidden>·</span><span>{eraLabel(era)}</span></>)}
          </p>
          <h2 className="font-display text-xl font-bold leading-tight">{hub.title}</h2>
          {hub.subtitle && <p className="mt-0.5 text-[12px] text-amber-900/80">{hub.subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="إغلاق"
          className="rounded-full p-1 text-amber-900 hover:bg-amber-900/10">
          <X className="size-5" />
        </button>
      </header>

      {/* Quick action chips */}
      <div className="flex flex-wrap gap-2 border-b border-amber-900/15 px-4 py-2.5">
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: hub.slug }}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-3 py-1.5 text-[12px] font-bold text-amber-50 hover:bg-amber-800"
        >
          <BookOpen className="size-3.5" /> افتح في الموسوعة
        </Link>
        <button
          onClick={onLocate}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-900/30 bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-900 hover:bg-amber-100"
        >
          <Compass className="size-3.5" /> تموقع على الخريطة
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {hub.summary && (
          <p className="text-[13px] leading-relaxed text-amber-950/90">{hub.summary}</p>
        )}

        {/* Connected encyclopedia content */}
        {totalRelated > 0 ? (
          <div className="space-y-4">
            <SectionHeader
              icon={BookOpen}
              label="مرتبط بهذا الموقع"
              count={totalRelated}
            />
            {GROUP_ORDER.map((t) => {
              const items = groups.get(t);
              if (!items?.length) return null;
              const G = ICON[t];
              return (
                <section key={t}>
                  <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold text-amber-900">
                    <G className="size-3.5" /> {ENTITY_TYPE_AR_SINGULAR[t]}
                    <span className="text-amber-800/60">({items.length})</span>
                  </div>
                  <ul className="grid gap-1">
                    {items.map((e) => (
                      <RelatedRow key={e.id} entity={e} onNavigate={onNavigate} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyHint>لم تُربط بعد محتويات موسوعية بهذا الموقع. ستظهر هنا تلقائيًا عند إضافتها.</EmptyHint>
        )}

        {/* Nearby on the atlas (proximity) */}
        {context.nearby.length > 0 && (
          <div className="space-y-2">
            <SectionHeader
              icon={MapPin}
              label="بالقرب على الأطلس"
              count={context.nearby.length}
            />
            <ul className="grid gap-1">
              {context.nearby.map((e) => (
                <RelatedRow key={e.id} entity={e} onNavigate={onNavigate} showType />
              ))}
            </ul>
          </div>
        )}

        {!hasAnything && (
          <div className="rounded-xl border border-dashed border-amber-900/25 bg-amber-100/40 p-4 text-center text-[12px] text-amber-900/80">
            هذا الموقع موجود على الأطلس، لكنه لا يحوي اتصالات موسوعية بعد.<br />
            افتحه في الموسوعة لقراءة المزيد، أو أضف محتوى مرتبطًا من لوحة الإدارة.
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count: number }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-800/70">
      <Icon className="size-3.5" /> {label}
      <span className="text-amber-800/60">({count})</span>
    </p>
  );
}

function RelatedRow({
  entity, onNavigate, showType = false,
}: {
  entity: WorldEntity & { distance?: number };
  onNavigate: (entity: WorldEntity) => void;
  showType?: boolean;
}) {
  const era = extractEra(entity.metadata);
  const hasCoords = !!extractCoords(entity.metadata);
  const TypeIcon = ICON[entity.entity_type];
  return (
    <li>
      <div className="flex items-center gap-1 rounded-lg border border-transparent px-1 hover:border-amber-900/20 hover:bg-amber-100/70">
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: entity.slug }}
          className="flex flex-1 items-center gap-2 truncate py-2 pr-1.5 text-[13px]"
        >
          {showType && <TypeIcon className="size-3.5 shrink-0 text-amber-800/80" />}
          <span className="truncate font-medium">{entity.title}</span>
          {era && <span className="shrink-0 text-[10px] text-amber-800/70">{eraLabel(era)}</span>}
        </Link>
        {hasCoords && (
          <button
            onClick={() => onNavigate(entity)}
            aria-label="تموقع على الخريطة"
            title="تموقع على الخريطة"
            className="grid size-7 shrink-0 place-items-center rounded-md text-amber-900/70 hover:bg-amber-900/10 hover:text-amber-900"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-900/20 bg-amber-100/50 p-3 text-center text-[12px] text-amber-900/80">
      {children}
    </div>
  );
}
