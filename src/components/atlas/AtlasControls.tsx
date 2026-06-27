// Phase 3 — Atlas controls.
// Search + kind + era + world filters over published atlas_entities.
// Kind chips show their pin color so the toolbar doubles as a legend.
// Collapsible: on mobile defaults to a compact bar (search + active-filter
// summary + expand arrow); full controls revealed when expanded.
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, RotateCcw, Search, SearchX } from "lucide-react";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import type { AtlasSearchHit } from "@/lib/atlas/atlas-search";
import {
  KIND_LABEL_AR,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";
import {
  KIND_COLOR,
  worldFacets,
  worldForEntity,
  WORLD_LABEL_AR,
  HISTORICAL_PERIODS,
  periodForEntity,
  type HistoricalPeriodId,
} from "@/lib/atlas/atlas-visual";

const PERIOD_LABEL: Record<string, string> = Object.fromEntries(
  HISTORICAL_PERIODS.map((p) => [p.id, p.label_ar]),
);

export type AtlasFacets = {
  kinds: { id: AtlasEntityKind; count: number }[];
  /** Historical periods (broader than worlds). */
  eras: { id: HistoricalPeriodId; label: string; count: number }[];
  worlds: { id: string; count: number; glyph: string }[];
};

export function buildAtlasFacets(entities: AtlasEntityRow[]): AtlasFacets {
  const kindCounts = new Map<AtlasEntityKind, number>();
  const periodCounts = new Map<HistoricalPeriodId, number>();
  for (const e of entities) {
    kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
    const p = periodForEntity(e);
    if (p) periodCounts.set(p, (periodCounts.get(p) ?? 0) + 1);
  }
  const periodOrder = new Map(HISTORICAL_PERIODS.map((p, i) => [p.id, i]));
  return {
    kinds: Array.from(kindCounts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    eras: Array.from(periodCounts.entries())
      .map(([id, count]) => ({ id, label: PERIOD_LABEL[id] ?? id, count }))
      .sort(
        (a, b) =>
          (periodOrder.get(a.id) ?? 99) - (periodOrder.get(b.id) ?? 99),
      ),
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
    if (filters.era && periodForEntity(e) !== filters.era) return false;
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
  onSubmitSearch,
  suggestions = [],
  noMatch = false,
  onPickSuggestion,
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
  onSubmitSearch?: (q: string) => void;
  suggestions?: AtlasSearchHit[];
  noMatch?: boolean;
  onPickSuggestion?: (hit: AtlasSearchHit) => void;
}) {
  // Default collapsed on narrow viewports (mobile/tablet), expanded on desktop.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });
  // If the user enters a search query on collapsed mobile, auto-expand
  // once so the kind chips/world/era inputs are reachable, but only on
  // the first transition.
  useEffect(() => { /* placeholder for future auto-expand rules */ }, []);

  const hasActiveFilter =
    kind != null || era != null || world != null || search.trim() !== "";

  const activeSummary = [
    world ? `${WORLD_LABEL_AR[world] ?? world}` : null,
    era ? PERIOD_LABEL[era] ?? era : null,
    kind ? KIND_LABEL_AR[kind] : null,
    search.trim() ? `"${search.trim()}"` : null,
  ].filter(Boolean).join(" · ");

  const resetAll = () => {
    onKind(null); onEra(null); onWorld(null); onSearch("");
  };

  return (
    <div
      className="pointer-events-auto absolute top-0 right-0 left-0 z-20 p-2 pl-24 sm:p-4 sm:pl-4"
      dir="rtl"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >


      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-amber-400/30 px-2.5 py-2 shadow-lg backdrop-blur sm:px-3"
        style={{
          backgroundImage:
            "linear-gradient(180deg, oklch(0.20 0.04 250 / 0.92), oklch(0.16 0.05 255 / 0.92))",
        }}
      >
        {/* Compact row — always visible: search + (summary when collapsed) + toggle. */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-amber-400/30 bg-slate-950/40 px-3 py-1.5 text-amber-50">
            <Search className="size-4 shrink-0 opacity-60" />
            <AndroidPlainTextInput
              value={search}
              onValueChange={onSearch}
              commitMode="blur"
              onEnter={(v) => (onSubmitSearch ?? onSearch)(v)}
              androidEntryKey="atlas.search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ابحث في الأطلس..."
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-amber-200/40"
            />
            {onSubmitSearch && (
              <button
                type="button"
                onClick={() => onSubmitSearch(search)}
                aria-label="انتقل إلى النتيجة"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300"
                title="انتقل"
              >
                <MapPin className="size-3.5" />
              </button>
            )}
          </div>

          {!expanded && hasActiveFilter && (
            <span
              className="hidden max-w-[40%] truncate rounded-full border border-amber-400/30 bg-slate-950/50 px-2 py-1 text-[11px] font-bold text-amber-200 sm:inline-block"
              title={activeSummary}
            >
              {activeSummary}
            </span>
          )}

          {hasActiveFilter && (
            <button
              onClick={resetAll}
              aria-label="مسح الفلاتر"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-amber-400/30 bg-slate-950/60 text-amber-100 hover:bg-slate-900"
              title="مسح الفلاتر"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "طيّ الفلاتر" : "إظهار الفلاتر"}
            aria-expanded={expanded}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-amber-400/30 bg-slate-950/60 text-amber-100 hover:bg-slate-900"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>

        {/* Suggestions / no-match (only shown after an explicit submit). */}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl border border-amber-400/20 bg-slate-950/60 p-1.5">
            <div className="px-2 py-0.5 text-[10px] font-bold text-amber-200/80">
              {suggestions.length === 1 ? "هل تقصد:" : "اقتراحات قريبة:"}
            </div>
            {suggestions.map((h) => (
              <button
                key={h.entity.id}
                type="button"
                onClick={() => onPickSuggestion?.(h)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-right text-[12px] text-amber-50 hover:bg-amber-400/10"
              >
                <MapPin className="size-3.5 shrink-0 text-amber-300" />
                <span className="truncate font-bold">{h.entity.name_ar}</span>
                {h.entity.name_en && (
                  <span className="ml-auto truncate text-[10px] text-amber-200/60">{h.entity.name_en}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {noMatch && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-slate-950/60 px-3 py-2 text-[12px] text-amber-100">
            <SearchX className="size-4 text-amber-300" />
            لا توجد نتائج بهذا الاسم
          </div>
        )}

        {/* Collapsed mobile summary chip (full width, beneath search). */}
        {!expanded && hasActiveFilter && (
          <div className="truncate rounded-full bg-slate-950/40 px-2 py-1 text-[11px] font-bold text-amber-200 sm:hidden">
            {activeSummary}
          </div>
        )}


        {/* Expanded sections: world + era selects, then kind chip row. */}
        {expanded && (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                  aria-label="الحقبة التاريخية"
                  className="w-full min-w-0 shrink rounded-full border border-amber-400/30 bg-slate-950/60 px-3 py-1.5 text-[12px] font-bold text-amber-100 outline-none sm:w-auto"
                >
                  <option value="">كل الحقب</option>
                  {facets.eras.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label} ({e.count})
                    </option>
                  ))}
                </select>
              )}
            </div>

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
          </>
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
