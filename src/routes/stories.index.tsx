// ============================================================
// /stories — the Stories library (redesign).
// ------------------------------------------------------------
// Structured like the Encyclopedia hub and the Campaigns hub:
//   1. Cinematic header + breadcrumbs
//   2. Search (local, Arabic-normalised)
//   3. Counter strip (total / continue / completed / locked)
//   4. Facet chip rows: status · world · era · category
//   5. Sort control + result count
//   6. Grid of cinematic StoryCards
//
// Every filter is applied LOCALLY on the single catalog feed — no
// RPC per interaction — and covers come from the offline Story
// Cover pack, so the grid paints instantly, online or offline.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Filter, Lock, Search, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CinematicPageBackdrop } from "@/components/CinematicPageBackdrop";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { StoryCard } from "@/components/stories/StoryCard";
import storiesHeaderArt from "@/assets/hero/03-manuscript-lamp.jpg?url";
import { listStoriesSummary } from "@/lib/stories/summary";
import { syncStoryCovers } from "@/lib/stories/covers";
import { eraLabelAr, worldLabelAr } from "@/lib/taxonomy-labels";
import {
  activeFilterCount,
  buildStoryFacets,
  EMPTY_STORY_FILTERS,
  filterStories,
  sortStories,
  storyCategoryLabel,
  storyCounters,
  STORY_SORT_LABELS,
  STORY_STATUS_LABELS,
  type StoryCatalogFilters,
  type StorySortKey,
  type StoryStatusFilter,
} from "@/lib/stories/catalog-filters";

export const Route = createFileRoute("/stories/")({
  head: () => ({
    meta: [
      { title: "مكتبة القصص — إرث" },
      {
        name: "description",
        content:
          "مكتبة قصص إرث: مشاهد قصيرة مبنية على مصادر تاريخية موثّقة. تصفّح حسب العالم والحقبة والتصنيف.",
      },
      { property: "og:title", content: "مكتبة القصص — إرث" },
      {
        property: "og:description",
        content: "مشاهد قصيرة موثّقة من التاريخ الإسلامي، مرتّبة حسب العالم والحقبة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoriesIndex,
});

function StoriesIndex() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stories-summary", null, "catalog"],
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  const stories = useMemo(() => data ?? [], [data]);

  // Delta sync: bundled covers need nothing; only stories published
  // after this build was cut are fetched once and cached offline.
  useEffect(() => {
    if (stories.length === 0) return;
    void syncStoryCovers(stories);
  }, [stories]);

  const [filters, setFilters] = useState<StoryCatalogFilters>(EMPTY_STORY_FILTERS);
  const [sort, setSort] = useState<StorySortKey>("recommended");
  const [showFacets, setShowFacets] = useState(false);

  const facets = useMemo(() => buildStoryFacets(stories), [stories]);
  const counters = useMemo(() => storyCounters(stories), [stories]);
  const visible = useMemo(
    () => sortStories(filterStories(stories, filters), sort),
    [stories, filters, sort],
  );
  const activeCount = activeFilterCount(filters);

  const patch = (next: Partial<StoryCatalogFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  return (
    <AppShell>
      <CinematicPageBackdrop image={storiesHeaderArt} alt="مخطوطة ومصباح" />

      <div dir="rtl" className="mx-auto w-full max-w-5xl px-5 pb-10 pt-6">
        <Breadcrumbs items={[{ label: "الرئيسية", to: "/" }, { label: "القصص" }]} />

        <header className="mt-4">
          <h1 className="font-display text-2xl font-bold text-gold">مكتبة القصص</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مشاهد قصيرة موثّقة من التاريخ الإسلامي
          </p>
        </header>

        {/* Search */}
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <AndroidPlainTextInput
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}

            placeholder="ابحث في القصص…"
            aria-label="ابحث في القصص"
            className="w-full rounded-xl border border-gold/25 bg-black/40 px-4 py-3 pe-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/60"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => patch({ q: "" })}
              aria-label="مسح البحث"
              className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Counters */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <Counter label="قصة" value={counters.total} />
          <Counter label="قيد القراءة" value={counters.inProgress} />
          <Counter label="مكتملة" value={counters.completed} />
          <Counter label="مقفلة" value={counters.locked} />
        </div>

        {/* Status chips — always visible, the primary axis */}
        <ChipRow>
          {(Object.keys(STORY_STATUS_LABELS) as StoryStatusFilter[]).map((key) => (
            <Chip
              key={key}
              active={filters.status === key}
              onClick={() => patch({ status: key })}
            >
              {STORY_STATUS_LABELS[key]}
            </Chip>
          ))}
        </ChipRow>

        {/* Secondary facets — collapsed by default to keep the page calm */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowFacets((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-black/40 px-3 py-1.5 text-xs text-gold"
          >
            <Filter className="size-3.5" />
            تصفية متقدمة
            {activeCount > 0 && (
              <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-black">
                {activeCount}
              </span>
            )}
          </button>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            الترتيب
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as StorySortKey)}
              aria-label="ترتيب القصص"
              className="rounded-lg border border-gold/25 bg-black/50 px-2 py-1.5 text-xs text-foreground outline-none focus:border-gold/60"
            >
              {(Object.keys(STORY_SORT_LABELS) as StorySortKey[]).map((k) => (
                <option key={k} value={k}>
                  {STORY_SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showFacets && (
          <div className="mt-3 space-y-3 rounded-2xl border border-gold/20 bg-black/30 p-3">
            {facets.worlds.length > 0 && (
              <Facet title="العالم">
                {facets.worlds.map((f) => (
                  <Chip
                    key={f.value}
                    active={filters.world === f.value}
                    onClick={() =>
                      patch({ world: filters.world === f.value ? null : f.value })
                    }
                  >
                    {worldLabelAr(f.value)} <Count n={f.count} />
                  </Chip>
                ))}
              </Facet>
            )}
            {facets.eras.length > 0 && (
              <Facet title="الحقبة">
                {facets.eras.map((f) => (
                  <Chip
                    key={f.value}
                    active={filters.era === f.value}
                    onClick={() => patch({ era: filters.era === f.value ? null : f.value })}
                  >
                    {eraLabelAr(f.value)} <Count n={f.count} />
                  </Chip>
                ))}
              </Facet>
            )}
            {facets.categories.length > 0 && (
              <Facet title="التصنيف">
                {facets.categories.map((f) => (
                  <Chip
                    key={f.value}
                    active={filters.category === f.value}
                    onClick={() =>
                      patch({ category: filters.category === f.value ? null : f.value })
                    }
                  >
                    {storyCategoryLabel(f.value)} <Count n={f.count} />
                  </Chip>
                ))}
              </Facet>
            )}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_STORY_FILTERS)}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-gold"
              >
                مسح كل عوامل التصفية
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="mt-5">
          {isLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] animate-pulse rounded-2xl border border-gold/10 bg-black/40"
                />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              تعذّر تحميل القصص: {(error as Error).message}
            </div>
          )}

          {!isLoading && !error && visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
              <BookOpenText className="mx-auto mb-3 size-8 text-gold/70" />
              <p className="font-display text-base font-bold text-gold">
                {stories.length === 0 ? "لا توجد قصص منشورة بعد" : "لا توجد نتائج مطابقة"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stories.length === 0
                  ? "ابقَ قريبًا — سنضيف قصصًا جديدة قريبًا بإذن الله."
                  : "جرّب تغيير عوامل التصفية أو كلمة البحث."}
              </p>
              {stories.length > 0 && activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_STORY_FILTERS)}
                  className="mt-3 rounded-full border border-gold/40 px-3 py-1.5 text-xs text-gold"
                >
                  عرض كل القصص
                </button>
              )}
            </div>
          )}

          {visible.length > 0 && (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="size-3 text-gold/70" />
                {visible.length} من {stories.length} قصة
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((s) => (
                  <li key={s.id}>
                    <StoryCard story={s} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Lock className="size-3" /> بعض القصص تُفتح بعد إنجاز حملات أو تحقيقات أو اكتشافات.
        </p>
      </div>
    </AppShell>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gold/20 bg-black/40 p-2 text-center">
      <div className="font-display text-lg font-bold text-gold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">{children}</div>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-gold bg-gold text-black font-bold"
          : "border-gold/25 bg-black/40 text-foreground/80 hover:border-gold/50"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="opacity-60">({n})</span>;
}
