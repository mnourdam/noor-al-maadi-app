import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AppShell, Screen } from "@/components/AppShell";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { ProgressiveEntityGrid } from "@/components/encyclopedia/ProgressiveEntityGrid";
import {
  browseEncyclopedia,
  encyclopediaIndexQueryOptions,
  useEncyclopediaIndex,
  type EncyclopediaBrowseSort,
} from "@/lib/encyclopedia/index-store";
import { canonicalEraLabel } from "@/lib/era-canonical";

const SECTION_LABELS: Record<string, string> = {
  state: "الدول",
  figure: "الشخصيات",
  battle: "المعارك",
  city: "المدن",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_GLYPHS: Record<string, string> = {
  state: "🏛️",
  figure: "🪶",
  battle: "⚔️",
  city: "🏙️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};
/** Browse order for the prev/next section switcher. */
const SECTION_ORDER = ["figure", "state", "city", "battle", "event", "landmark", "artifact"];
const VALID = new Set(Object.keys(SECTION_LABELS));

const SORTS: { key: EncyclopediaBrowseSort; label: string }[] = [
  { key: "alpha", label: "أبجدي" },
  { key: "newest", label: "الأحدث إضافة" },
  { key: "updated", label: "المحدَّث أخيرًا" },
];

export const Route = createFileRoute("/encyclopedia/type/$type")({
  head: ({ params }) => {
    const label = SECTION_LABELS[params.type] ?? "الموسوعة";
    return {
      meta: [
        { title: `${label} — الموسوعة التاريخية` },
        { name: "description", content: `تصفّح كل ${label} في عالم إرث.` },
        { property: "og:title", content: `${label} — الموسوعة التاريخية` },
        { property: "og:description", content: `تصفّح كل ${label} في عالم إرث.` },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!VALID.has(params.type)) throw notFound();
    return undefined as never;
  },
  // Prime the shared index. It is normally already warm from the boot
  // prefetch, in which case this is a no-op and the page paints instantly.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(encyclopediaIndexQueryOptions());
  },
  component: TypeBrowsePage,
  errorComponent: () => (
    <AppShell>
      <Screen title="تعذّر فتح القسم">
        <Link to="/encyclopedia" className="text-gold underline">عُد إلى الموسوعة</Link>
      </Screen>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <Screen title="قسم غير معروف">
        <Link to="/encyclopedia" className="text-gold underline">عُد إلى الموسوعة</Link>
      </Screen>
    </AppShell>
  ),
});

function TypeBrowsePage() {
  const { type } = Route.useParams();
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string>("");
  const [sort, setSort] = useState<EncyclopediaBrowseSort>("alpha");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: index = EMPTY_ENCYCLOPEDIA_INDEX, isPending } = useQuery(encyclopediaIndexQueryOptions());

  const total = index.counts[type] ?? 0;
  const eras = index.erasByType[type] ?? [];

  const q = query.trim();
  const filtered = useMemo(
    () => browseEncyclopedia(index, { query: q, type, era, sort }),
    [index, q, type, era, sort],
  );

  const orderIdx = SECTION_ORDER.indexOf(type);
  const prev = orderIdx > 0 ? SECTION_ORDER[orderIdx - 1] : null;
  const next = orderIdx >= 0 && orderIdx < SECTION_ORDER.length - 1 ? SECTION_ORDER[orderIdx + 1] : null;
  const activeFilters = (era ? 1 : 0) + (sort !== "alpha" ? 1 : 0);

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Breadcrumbs
          items={[
            { label: "الرئيسية", to: "/" },
            { label: "الموسوعة", to: "/encyclopedia" },
            { label: SECTION_LABELS[type] },
          ]}
        />
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-black/35 text-2xl ring-1 ring-white/5">
            {SECTION_GLYPHS[type]}
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">{SECTION_LABELS[type]}</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {filtered.length === total
                ? `${total.toLocaleString("en-US")} عنصر`
                : `${filtered.length.toLocaleString("en-US")} من أصل ${total.toLocaleString("en-US")}`}
            </p>
          </div>
        </div>
        <div className="ornament-divider mt-3" />

        {/* Search + filter toggle — one compact row instead of stacked chips */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
            <AndroidPlainTextInput
              value={query}
              onValueChange={setQuery}
              onEnter={setQuery}
              androidEntryKey={`encyclopedia.type.${type}.search`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={`ابحث في ${SECTION_LABELS[type]}…`}
              className="w-full rounded-2xl border border-white/10 bg-surface py-3 pr-10 pl-10 text-right text-sm focus:border-gold/40 focus:outline-none"
              dir="rtl"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                aria-label="مسح البحث"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`relative grid size-11 shrink-0 place-items-center rounded-2xl border transition ${
              filtersOpen || activeFilters > 0
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-white/10 bg-surface text-muted-foreground"
            }`}
            aria-label="خيارات الترتيب والعصر"
          >
            <SlidersHorizontal className="size-4" />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -left-1 grid size-4 place-items-center rounded-full bg-gold text-[9px] font-bold text-background">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible refine panel: sort + era. Hidden by default so the
            list is the hero, not the controls. */}
        {filtersOpen && (
          <div className="mt-3 space-y-3 rounded-2xl border border-gold/20 bg-black/25 p-3 animate-fade-in">
            <div>
              <p className="mb-1.5 text-[10px] tracking-[0.3em] text-gold/70">الترتيب</p>
              <div className="flex flex-wrap gap-1.5">
                {SORTS.map((s) => (
                  <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            {eras.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] tracking-[0.3em] text-gold/70">العصر</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={era === ""} onClick={() => setEra("")}>كل العصور</Chip>
                  {eras.map(([name, n]) => (
                    <Chip key={name} active={era === name} onClick={() => setEra(name)}>
                      {canonicalEraLabel(name)}
                      <span className="ms-1 opacity-60">{n}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active-filter summary so the player always knows why the list shrank */}
        {(era || q) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {q && (
              <button onClick={() => setQuery("")} className="flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] text-gold">
                «{q}» <X className="size-3" />
              </button>
            )}
            {era && (
              <button onClick={() => setEra("")} className="flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] text-gold">
                {canonicalEraLabel(era)} <X className="size-3" />
              </button>
            )}
          </div>
        )}

        <div className="mt-5 pb-4">
          {isPending && total === 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-white/5 bg-surface/60" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
              {total === 0 ? "لا توجد عناصر في هذا القسم بعد." : "لا توجد عناصر مطابقة."}
            </p>
          ) : (
            <ProgressiveEntityGrid
              entities={filtered}
              highlight={q || undefined}
              resetKey={`${type}|${q}|${era}|${sort}`}
            />
          )}
        </div>

        {/* Fast section switching — the shared index makes this instant */}
        <div className="flex items-center justify-between gap-2 pb-10">
          {prev ? (
            <Link
              to="/encyclopedia/type/$type"
              params={{ type: prev }}
              className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-surface px-3 py-2 text-[11px] hover:border-gold/40"
            >
              <ChevronRight className="size-3.5 text-gold" />
              {SECTION_LABELS[prev]}
            </Link>
          ) : <span />}
          {next ? (
            <Link
              to="/encyclopedia/type/$type"
              params={{ type: next }}
              className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-surface px-3 py-2 text-[11px] hover:border-gold/40"
            >
              {SECTION_LABELS[next]}
              <ChevronLeft className="size-3.5 text-gold" />
            </Link>
          ) : <span />}
        </div>
      </div>
    </AppShell>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[10px] transition ${
        active ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
