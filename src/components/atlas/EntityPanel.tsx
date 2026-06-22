// P0-B — EntityPanel.
// Unified detail surface for atlas hubs. Irth identity: deep navy + warm gold,
// manuscript-inspired. Used for both legacy hubs (city/landmark) and atlas_entities
// (via AtlasEntityDetailPanel which wraps this shell).
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
  related: WorldEntity[];
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
  onNavigate: (entity: WorldEntity) => void;
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
    <UnifiedDetailShell
      Icon={Icon}
      kindLabel={ENTITY_TYPE_AR_SINGULAR[hub.entity_type]}
      title={hub.title}
      subtitle={hub.subtitle ?? null}
      regionName={regionName ?? null}
      eraText={era ? eraLabel(era) : null}
      encyclopediaSlug={hub.slug}
      onClose={onClose}
      onLocate={onLocate}
      summary={hub.summary ?? null}
    >
      {totalRelated > 0 ? (
        <div className="space-y-4">
          <SectionHeader icon={BookOpen} label="مرتبط بهذا الموقع" count={totalRelated} />
          {GROUP_ORDER.map((t) => {
            const items = groups.get(t);
            if (!items?.length) return null;
            const G = ICON[t];
            return (
              <section key={t}>
                <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold text-amber-300/90">
                  <G className="size-3.5" /> {ENTITY_TYPE_AR_SINGULAR[t]}
                  <span className="text-amber-200/50">({items.length})</span>
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

      {context.nearby.length > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={MapPin} label="بالقرب على الأطلس" count={context.nearby.length} />
          <ul className="grid gap-1">
            {context.nearby.map((e) => (
              <RelatedRow key={e.id} entity={e} onNavigate={onNavigate} showType />
            ))}
          </ul>
        </div>
      )}

      {!hasAnything && (
        <div className="rounded-xl border border-dashed border-amber-400/25 bg-slate-900/40 p-4 text-center text-[12px] text-amber-100/70">
          هذا الموقع موجود على الأطلس، لكنه لا يحوي اتصالات موسوعية بعد.<br />
          افتحه في الموسوعة لقراءة المزيد، أو أضف محتوى مرتبطًا من لوحة الإدارة.
        </div>
      )}
    </UnifiedDetailShell>
  );
}

/** Shared visual shell — deep navy + gold, manuscript-inspired. */
export function UnifiedDetailShell({
  Icon, kindLabel, title, subtitle, regionName, eraText,
  encyclopediaSlug, encyclopediaLabel = "افتح في الموسوعة",
  onClose, onLocate, summary, children,
}: {
  Icon: LucideIcon;
  kindLabel: string;
  title: string;
  subtitle?: string | null;
  regionName?: string | null;
  eraText?: string | null;
  /** When null/undefined, render a polished empty state instead of the link. */
  encyclopediaSlug?: string | null;
  encyclopediaLabel?: string;
  onClose: () => void;
  onLocate?: () => void;
  summary?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <aside
      dir="rtl"
      className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col
                 border-l border-amber-400/20 text-amber-50 shadow-[0_0_60px_rgba(0,0,0,0.6)]
                 animate-in slide-in-from-right duration-200"
      style={{
        backgroundImage:
          "linear-gradient(180deg, oklch(0.20 0.04 250) 0%, oklch(0.16 0.05 255) 60%, oklch(0.13 0.04 255) 100%)",
      }}
    >
      {/* Header */}
      <header className="flex items-start gap-3 border-b border-amber-400/15 p-4">
        <div
          className="grid size-14 place-items-center rounded-2xl text-slate-950 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
          style={{ backgroundImage: "linear-gradient(135deg, oklch(0.82 0.14 80), oklch(0.68 0.16 70))" }}
        >
          <Icon className="size-7" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] uppercase tracking-wider text-amber-300/80">
            <span className="font-bold">{kindLabel}</span>
            {regionName && (<><span aria-hidden>·</span><span>{regionName}</span></>)}
            {eraText && (<><span aria-hidden>·</span><span>{eraText}</span></>)}
          </p>
          <h2 className="font-display text-xl font-bold leading-tight text-amber-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-amber-200/70">{subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="إغلاق"
          className="rounded-full p-1 text-amber-200/80 hover:bg-amber-400/10">
          <X className="size-5" />
        </button>
      </header>

      {/* Quick action chips */}
      <div className="flex flex-wrap gap-2 border-b border-amber-400/10 px-4 py-2.5">
        {encyclopediaSlug ? (
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: encyclopediaSlug }}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-1.5 text-[12px] font-bold text-slate-950 hover:from-amber-300 hover:to-amber-400 shadow"
          >
            <BookOpen className="size-3.5" /> {encyclopediaLabel}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-slate-900/60 px-3 py-1.5 text-[12px] font-medium text-amber-100/60">
            <BookOpen className="size-3.5" /> لا يوجد ربط بالموسوعة بعد
          </span>
        )}
        {onLocate && (
          <button
            onClick={onLocate}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-900/50 px-3 py-1.5 text-[12px] font-bold text-amber-100 hover:bg-slate-900/80"
          >
            <Compass className="size-3.5" /> تموقع على الخريطة
          </button>
        )}
      </div>

      {/* Body — parchment panel on navy for high-value text */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {summary && (
          <div
            className="rounded-xl border border-amber-400/20 p-3.5 text-[13px] leading-relaxed text-amber-950 shadow-inner"
            style={{ backgroundImage: "linear-gradient(180deg, oklch(0.95 0.04 85), oklch(0.91 0.05 80))" }}
          >
            {summary}
          </div>
        )}
        {children}
      </div>
    </aside>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count: number }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
      <Icon className="size-3.5" /> {label}
      <span className="text-amber-200/50">({count})</span>
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
      <div className="flex items-center gap-1 rounded-lg border border-transparent px-1 hover:border-amber-400/20 hover:bg-amber-400/5">
        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: entity.slug }}
          className="flex flex-1 items-center gap-2 truncate py-2 pr-1.5 text-[13px] text-amber-50"
        >
          {showType && <TypeIcon className="size-3.5 shrink-0 text-amber-300/80" />}
          <span className="truncate font-medium">{entity.title}</span>
          {era && <span className="shrink-0 text-[10px] text-amber-200/60">{eraLabel(era)}</span>}
        </Link>
        {hasCoords && (
          <button
            onClick={() => onNavigate(entity)}
            aria-label="تموقع على الخريطة"
            title="تموقع على الخريطة"
            className="grid size-7 shrink-0 place-items-center rounded-md text-amber-200/70 hover:bg-amber-400/10 hover:text-amber-100"
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
    <div className="rounded-xl border border-amber-400/20 bg-slate-900/40 p-3 text-center text-[12px] text-amber-100/70">
      {children}
    </div>
  );
}
