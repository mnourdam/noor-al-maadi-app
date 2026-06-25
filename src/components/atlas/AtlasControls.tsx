// Phase 3 — Atlas controls.
// Search + kind + era + world filters over published atlas_entities.
// Kind chips show their pin color so the toolbar doubles as a legend.
import { Search } from "lucide-react";
import {
  KIND_LABEL_AR,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";
import { ERAS } from "@/lib/app-constants";
import {
  KIND_COLOR,
  worldFacets,
  worldForEntity,
  WORLD_LABEL_AR,
} from "@/lib/atlas/atlas-visual";

const ERA_LABEL_AR: Record<string, string> = Object.fromEntries(
  ERAS.map((e) => [e.id, e.name]),
);

function eraLabel(id: string): string {
  return ERA_LABEL_AR[id] ?? id;
}

export type AtlasFacets = {
  kinds: { id: AtlasEntityKind; count: number }[];
  eras: { id: string; label: string; count: number }[];
  worlds: { id: string; count: number; glyph: string }[];
};

export function buildAtlasFacets(entities: AtlasEntityRow[]): AtlasFacets {
  const kindCounts = new Map<AtlasEntityKind, number>();
  const eraCounts = new Map<string, number>();
  for (const e of entities) {
    kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
    if (e.era) eraCounts.set(e.era, (eraCounts.get(e.era) ?? 0) + 1);
  }
  return {
    kinds: Array.from(kindCounts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    eras: Array.from(eraCounts.entries())
      .map(([id, count]) => ({ id, label: eraLabel(id), count }))
      .sort((a, b) => b.count - a.count),
    worlds: worldFacets(entities),
  };
}

export function filterAtlasEntities(
  entities: AtlasEntityRow[],
  filters: {
    kind: AtlasEntityKind | null;
    era: string | null;
    world: string | null;
    search: string;
  },
): AtlasEntityRow[] {
  const q = filters.search.trim().toLowerCase();
  return entities.filter((e) => {
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.era && e.era !== filters.era) return false;
    if (filters.world && worldForEntity(e) !== filters.world) return false;
    if (q) {
      const hay = `${e.name_ar} ${e.name_en ?? ""} ${e.slug}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function AtlasControls({
  facets,
  kind,
  era,
  world,
  search,
  onKind,
  onEra,
  onWorld,
  onSearch,
}: {
  facets: AtlasFacets;
  kind: AtlasEntityKind | null;
  era: string | null;
  world: string | null;
  search: string;
  onKind: (k: AtlasEntityKind | null) => void;
  onEra: (e: string | null) => void;
  onWorld: (w: string | null) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="pointer-events-auto absolute top-0 right-0 left-0 z-20 p-2 sm:p-4" dir="rtl"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-amber-400/30 px-2.5 py-2 shadow-lg backdrop-blur sm:px-3"
        style={{
          backgroundImage:
            "linear-gradient(180deg, oklch(0.20 0.04 250 / 0.92), oklch(0.16 0.05 255 / 0.92))",
        }}
      >
        {/* Row 1: search + world + era */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-amber-400/30 bg-slate-950/40 px-3 py-1.5 text-amber-50">
            <Search className="size-4 shrink-0 opacity-60" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="ابحث في الأطلس..."
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-amber-200/40"
            />
          </div>

          {facets.worlds.length > 0 && (
            <select
              value={world ?? ""}
              onChange={(e) => onWorld(e.target.value || null)}
              aria-label="العالم"
              className="w-full min-w-0 shrink rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1.5 text-[12px] font-bold text-amber-100 outline-none sm:w-auto"
            >
              <option value="">كل العوالم</option>
              {facets.worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.glyph} {WORLD_LABEL_AR[w.id] ?? w.id} ({w.count})
                </option>
              ))}
            </select>
          )}

          {facets.eras.length > 0 && (
            <select
              value={era ?? ""}
              onChange={(e) => onEra(e.target.value || null)}
              aria-label="العصر"
              className="w-full min-w-0 shrink rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1.5 text-[12px] font-bold text-amber-100 outline-none sm:w-auto"
            >
              <option value="">كل العصور</option>
              {facets.eras.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} ({e.count})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Row 2: kind chips with color dot = legend */}
        {facets.kinds.length > 0 && (
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={kind === null} onClick={() => onKind(null)}>الكل</Chip>
            {facets.kinds.map((k) => (
              <Chip
                key={k.id}
                active={kind === k.id}
                color={KIND_COLOR[k.id]}
                onClick={() => onKind(kind === k.id ? null : k.id)}
              >
                {KIND_LABEL_AR[k.id]}
                <span className="mx-1 text-amber-200/60">{k.count}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
        active
          ? "border-amber-300 bg-amber-400 text-slate-950"
          : "border-amber-400/30 bg-slate-950/30 text-amber-100 hover:bg-slate-950/60"
      }`}
    >
      {color && (
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}
