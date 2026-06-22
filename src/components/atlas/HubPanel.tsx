// Phase 3 — Hub Panel: lists encyclopedia entities linked to a hub.
import { Link } from "@tanstack/react-router";
import { X, BookOpen, Building2, Calendar, Crown, Gem, Landmark, Swords, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorldEntity, WorldEntityType } from "@/lib/world-map-source";
import { ENTITY_TYPE_AR_SINGULAR, eraLabel, extractEra } from "@/lib/world-map-source";
import type { HubMarker } from "@/lib/atlas-hubs";
import { ATLAS_REGIONS } from "@/lib/atlas-regions";

const ICON: Record<WorldEntityType, LucideIcon> = {
  city: Building2, battle: Swords, figure: User, landmark: Landmark,
  artifact: Gem, event: Calendar, state: Crown,
};

export function HubPanel({
  hub, linked, onClose,
}: {
  hub: HubMarker;
  linked: WorldEntity[];
  onClose: () => void;
}) {
  const Icon = ICON[hub.entity_type];
  const regionName = hub.region
    ? ATLAS_REGIONS.find((r) => r.id === hub.region)?.name
    : null;

  // Group linked by type
  const groups = new Map<WorldEntityType, WorldEntity[]>();
  for (const e of linked) {
    const arr = groups.get(e.entity_type) ?? [];
    arr.push(e);
    groups.set(e.entity_type, arr);
  }
  const order: WorldEntityType[] = ["figure", "battle", "event", "artifact", "state", "landmark", "city"];

  return (
    <aside
      dir="rtl"
      className="pointer-events-auto absolute top-0 right-0 bottom-0 z-30 w-full max-w-md border-l border-amber-900/30 bg-amber-50/95 text-amber-950 shadow-2xl backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-200"
    >
      <header className="flex items-start gap-3 border-b border-amber-900/20 p-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-amber-900 text-amber-50 shrink-0">
          <Icon className="size-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-amber-800/70">
            {ENTITY_TYPE_AR_SINGULAR[hub.entity_type]}
            {regionName && ` · ${regionName}`}
          </p>
          <h2 className="font-display text-xl font-bold leading-tight">{hub.title}</h2>
          {hub.subtitle && <p className="mt-0.5 text-[12px] text-amber-900/80">{hub.subtitle}</p>}
        </div>
        <button onClick={onClose} aria-label="إغلاق" className="rounded-full p-1 text-amber-900 hover:bg-amber-900/10">
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {hub.summary && (
          <p className="text-[13px] leading-relaxed text-amber-950/90">{hub.summary}</p>
        )}

        <Link
          to="/encyclopedia/entity/$id"
          params={{ id: hub.slug }}
          className="flex items-center justify-center gap-2 rounded-full bg-amber-900 px-4 py-2.5 text-sm font-bold text-amber-50 hover:bg-amber-800"
        >
          <BookOpen className="size-4" /> افتح في الموسوعة
        </Link>

        {linked.length === 0 ? (
          <p className="rounded-xl border border-amber-900/20 bg-amber-100/60 p-4 text-center text-[12px] text-amber-900/80">
            لا توجد محتويات موسوعية مرتبطة بعد بهذا الموقع.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70">
              مرتبط بهذا الموقع ({linked.length})
            </p>
            {order.map((t) => {
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
                    {items.map((e) => {
                      const era = extractEra(e.metadata);
                      return (
                        <li key={e.id}>
                          <Link
                            to="/encyclopedia/entity/$id"
                            params={{ id: e.slug }}
                            className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[13px] hover:border-amber-900/20 hover:bg-amber-100/70"
                          >
                            <span className="truncate font-medium">{e.title}</span>
                            {era && <span className="shrink-0 text-[10px] text-amber-800/70">{eraLabel(era)}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
