// Phase 2 stabilization — Atlas controls.
// Search + filter ONLY over published atlas_entities.
// - Era IDs are resolved to Arabic display names (no raw ids exposed).
// - Era picker is a compact dropdown — mobile-friendly.
import { Search } from "lucide-react";
import {
  KIND_LABEL_AR,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";
import { ERAS } from "@/lib/app-constants";

const ERA_LABEL_AR: Record<string, string> = Object.fromEntries(
  ERAS.map((e) => [e.id, e.name]),
);

function eraLabel(id: string): string {
  return ERA_LABEL_AR[id] ?? id;
}

export type AtlasFacets = {
  kinds: { id: AtlasEntityKind; count: number }[];
  eras: { id: string; label: string; count: number }[];
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
  };
}

export function filterAtlasEntities(
  entities: AtlasEntityRow[],
  filters: { kind: AtlasEntityKind | null; era: string | null; search: string },
): AtlasEntityRow[] {
  const q = filters.search.trim().toLowerCase();
  return entities.filter((e) => {
    if (filters.kind && e.kind !== filters.kind) return false;
    if (filters.era && e.era !== filters.era) return false;
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
  search,
  onKind,
  onEra,
  onSearch,
}: {
  facets: AtlasFacets;
  kind: AtlasEntityKind | null;
  era: string | null;
  search: string;
  onKind: (k: AtlasEntityKind | null) => void;
  onEra: (e: string | null) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="pointer-events-auto absolute top-0 right-0 left-0 z-20 p-2 sm:p-4" dir="rtl">
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-amber-400/30 px-2.5 py-2 shadow-lg backdrop-blur sm:px-3"
        style={{
          backgroundImage:
            "linear-gradient(180deg, oklch(0.20 0.04 250 / 0.92), oklch(0.16 0.05 255 / 0.92))",
        }}
      >
        {/* Row 1: search full width, era inline only on sm+ */}
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

          {facets.eras.length > 0 && (
            <select
              value={era ?? ""}
              onChange={(e) => onEra(e.target.value || null)}
              aria-label="العصر"
              className="w-full min-w-0 shrink rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1.5 text-[12px] font-bold text-amber-100 outline-none sm:w-auto sm:max-w-[45%]"
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

        {/* Row 2: kind chips — horizontal scroll, never overflows */}
        {facets.kinds.length > 0 && (
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={kind === null} onClick={() => onKind(null)}>الكل</Chip>
            {facets.kinds.map((k) => (
              <Chip key={k.id} active={kind === k.id} onClick={() => onKind(kind === k.id ? null : k.id)}>
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
        active
          ? "border-amber-300 bg-amber-400 text-slate-950"
          : "border-amber-400/30 bg-slate-950/30 text-amber-100 hover:bg-slate-950/60"
      }`}
    >{children}</button>
  );
}
