// ============================================================
// /stories — the Stories library (Redesign: Series-first).
// ------------------------------------------------------------
// Layout:
//   1. Default: Grid of Story Collections (Series).
//   2. Detail (?collection=id): Grid of stories within that collection.
//
// This UI refresh leverages the existing story_collections schema
// without modifying any backend logic or data structures.
// ============================================================

import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Filter, Search, X, ChevronLeft, CheckCircle2, PlayCircle, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CinematicPageBackdrop } from "@/components/CinematicPageBackdrop";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { StoryCard } from "@/components/stories/StoryCard";
import { CollectionCard } from "@/components/stories/CollectionCard";
import storiesHeaderArt from "@/assets/hero/03-manuscript-lamp.jpg?url";
import { listStoriesSummary } from "@/lib/stories/summary";
import { useStoryCollections } from "@/lib/stories/collections";
import { syncStoryCovers, useStoryCoverSrc } from "@/lib/stories/covers";
import { eraLabelAr, worldLabelAr } from "@/lib/taxonomy-labels";
import {
  activeFilterCount,
  buildStoryFacets,
  EMPTY_STORY_FILTERS,
  filterStories,
  sortStories,
  storyCounters,
  STORY_SORT_LABELS,
  STORY_STATUS_LABELS,
  type StoryCatalogFilters,
  type StorySortKey,
  type StoryStatusFilter,
} from "@/lib/stories/catalog-filters";
import type { MessageKey } from "@/lib/ui-language/messages";
import { useUiLanguage } from "@/lib/ui-language/store";
import { selectStoryMetadata } from "@/lib/stories/display-metadata";
import { z } from "zod";
import { storySummaryQueryKey, useStoryIdentityKey } from "@/lib/stories/query-keys";

const storiesSearchSchema = z.object({
  collection: z.string().optional(),
});

export const Route = createFileRoute("/stories/")({
  validateSearch: (search) => storiesSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "مكتبة القصص — إرث" },
      {
        name: "description",
        content:
          "مكتبة قصص إرث: مشاهد قصيرة مبنية على مصادر تاريخية موثّقة. تصفّح حسب السلاسل والعوالم.",
      },
      { property: "og:title", content: "مكتبة القصص — إرث" },
      {
        property: "og:description",
        content: "مشاهد قصيرة موثّقة من التاريخ الإسلامي، مرتبة في سلاسل تاريخية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoriesIndex,
});

function StoriesIndex() {
  const { collection: activeCollectionId } = useSearch({ from: "/stories/" });
  

  const storyIdentity = useStoryIdentityKey();
  const { data: storiesData, isLoading: storiesLoading } = useQuery({
    queryKey: storySummaryQueryKey(storyIdentity, null, "catalog"),
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  const { collections, loading: collectionsLoading } = useStoryCollections();

  const stories = useMemo(() => storiesData ?? [], [storiesData]);

  useEffect(() => {
    if (stories.length === 0) return;
    void syncStoryCovers(stories);
  }, [stories]);

  const [filters, setFilters] = useState<StoryCatalogFilters>(EMPTY_STORY_FILTERS);
  const [sort, setSort] = useState<StorySortKey>("recommended");
  const [showFacets, setShowFacets] = useState(false);

  const facets = useMemo(() => buildStoryFacets(stories), [stories]);
  const counters = useMemo(() => storyCounters(stories), [stories]);
  
  // Filtered pool of stories
  const filteredStories = useMemo(
    () => filterStories(stories, filters),
    [stories, filters]
  );

  const activeCollection = useMemo(
    () => collections.find(c => c.id === activeCollectionId),
    [collections, activeCollectionId]
  );

  // Derive visible content
  const visibleCollections = useMemo(() => {
    if (activeCollectionId) return [];
    
    // Only use collections that exist in the database.
    return collections.filter(c => {
      const collectionStories = stories.filter(s => s.story_collection_id === c.id);
      if (collectionStories.length === 0) return false;
      
      const activeCount = activeFilterCount(filters);
      if (activeCount === 0) return true;

      const matchingStories = filteredStories.filter(s => s.story_collection_id === c.id);
      return matchingStories.length > 0;
    });
  }, [collections, stories, filteredStories, activeCollectionId, filters]);

  const visibleStories = useMemo(() => {
    if (!activeCollectionId) return [];
    
    // Within a collection, we show the stories in their authored order
    const storiesInCollection = filteredStories.filter(s => s.story_collection_id === activeCollectionId);
    return storiesInCollection.sort((a, b) => (a.collection_order ?? 0) - (b.collection_order ?? 0));
  }, [filteredStories, activeCollectionId]);

  const activeCount = activeFilterCount(filters);

  const patch = (next: Partial<StoryCatalogFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const isLoading = storiesLoading || collectionsLoading;

  return (
    <AppShell>
      <CinematicPageBackdrop image={storiesHeaderArt} alt="مخطوطة ومصباح" />

      <div dir="rtl" className="mx-auto w-full max-w-5xl px-5 pb-20 pt-6">
        {activeCollection ? (
          <CollectionHero 
            collection={activeCollection} 
            stories={stories.filter(s => s.story_collection_id === activeCollection.id)}
          />
        ) : (
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-bold text-gold drop-shadow-sm">
              <CatalogText message="catalogTitle" />
            </h1>
            <p className="text-sm text-white/50">
              <CatalogText message="catalogSubtitle" />
            </p>
          </header>
        )}

        {/* Search & Filters (Global) */}
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <CatalogSearchInput
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholderKey={activeCollectionId ? "catalogSearchCollection" : "catalogSearchAll"}
            className="w-full rounded-xl border border-gold/25 bg-black/40 px-4 py-3 pe-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/60"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => patch({ q: "" })}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Counters & Advanced Filters Toggle */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <Counter label="catalogCollections" value={activeCollectionId ? 1 : visibleCollections.length} />
            <Counter label="catalogStories" value={activeCollectionId ? visibleStories.length : counters.total} />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFacets((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-black/40 px-3 py-1.5 text-xs text-gold"
            >
              <Filter className="size-3.5" />
              <CatalogText message="catalogFilters" />
              {activeCount > 0 && (
                <span className="rounded-full bg-gold px-1.5 text-[10px] font-bold text-black">
                  {activeCount}
                </span>
              )}
            </button>

            {activeCollectionId && (
              <CatalogSortSelect value={sort} onChange={(e) => setSort(e.target.value as StorySortKey)} />
            )}
          </div>
        </div>

        {showFacets && (
          <div className="mt-3 space-y-3 rounded-2xl border border-gold/20 bg-black/30 p-3">
            <Facet title="catalogStatus">
              {(Object.keys(STORY_STATUS_LABELS) as StoryStatusFilter[]).map((key) => (
                <Chip
                  key={key}
                  active={filters.status === key}
                  onClick={() => patch({ status: key })}
                >
                  <CatalogText message={STATUS_MESSAGE_KEYS[key]} />
                </Chip>
              ))}
            </Facet>

            {facets.worlds.length > 0 && (
              <Facet title="catalogWorld">
                {facets.worlds.map((f) => (
                  <Chip
                    key={f.value}
                    active={filters.world === f.value}
                    onClick={() => patch({ world: filters.world === f.value ? null : f.value })}
                  >
                    <span lang="ar" dir="rtl">{worldLabelAr(f.value)} <Count n={f.count} /></span>
                  </Chip>
                ))}
              </Facet>
            )}

            {facets.eras.length > 0 && (
              <Facet title="catalogEra">
                {facets.eras.map((f) => (
                  <Chip
                    key={f.value}
                    active={filters.era === f.value}
                    onClick={() => patch({ era: filters.era === f.value ? null : f.value })}
                  >
                    <span lang="ar" dir="rtl">{eraLabelAr(f.value)} <Count n={f.count} /></span>
                  </Chip>
                ))}
              </Facet>
            )}

            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_STORY_FILTERS)}
                className="text-xs text-muted-foreground underline hover:text-gold"
              >
                <CatalogText message="catalogReset" />
              </button>
            )}
          </div>
        )}

        {/* Content Grid */}
        <div className="mt-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="size-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              <p className="mt-4 text-sm"><CatalogText message="catalogLoading" /></p>
            </div>
          ) : activeCollectionId ? (
            /* Stories within a collection */
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibleStories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
              {visibleStories.length === 0 && (
                <EmptyState message="catalogEmptyStories" />
              )}
            </div>
          ) : (
            /* Collection library view */
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-2">
              {visibleCollections.map((col) => (
                <CollectionCard 
                  key={col.id} 
                  collection={col} 
                  stories={stories.filter(s => s.story_collection_id === col.id)}
                />
              ))}
              {visibleCollections.length === 0 && (
                <EmptyState message="catalogEmptyCollections" />
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CollectionHero({ collection, stories }: { collection: any; stories: any[] }) {
  const { language, direction, messages } = useUiLanguage();
  const title = selectStoryMetadata(collection.title_ar, collection.title_en, language);
  const summary = selectStoryMetadata(collection.summary_ar, collection.summary_en, language);
  const total = stories.length;
  const completedCount = stories.filter(s => s.completed).length;
  const started = stories.some(s => s.unlocked && (s.progress || s.completed));
  const isFullyCompleted = total > 0 && completedCount === total;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // Cover
  const firstStoryWithCover = stories.find(s => s.cover_media_id);
  const coverSource = {
    cover_media_id: collection.cover_media_id || firstStoryWithCover?.cover_media_id,
    id: collection.cover_media_id ? `collection-${collection.id}` : firstStoryWithCover?.id,
    ...(!collection.cover_media_id ? { content_version: firstStoryWithCover?.content_version } : {})
  };
  const cover = useStoryCoverSrc(coverSource as any);

  return (
    <div className="mb-8 overflow-hidden rounded-3xl border border-gold/30 bg-black/60 shadow-2xl backdrop-blur-md">
      <div className="relative aspect-[21/9] w-full overflow-hidden sm:aspect-[3/1]">
        {cover && (
          <img 
            src={cover} 
            alt={title?.text ?? ""} lang={title?.lang} dir={title?.dir}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        
        <Link 
          to="/stories" 
          className="absolute start-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-gold hover:text-black"
        >
          <ChevronLeft className="size-6 translate-x-0.5" />
        </Link>
      </div>

      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 space-y-2">
            <h1 lang={title?.lang} dir={title?.dir} className="font-display text-3xl font-bold text-gold drop-shadow-sm sm:text-4xl">
              {title?.text}
            </h1>
            {summary && <p lang={summary.lang} dir={summary.dir} className="max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
              {summary.text}
            </p>}
          </div>

          <div className="flex flex-col items-start gap-4 sm:items-end">
            <div lang={language} dir={direction} className="flex gap-4">
              <Stat label={messages.collectionStoryCount} value={total} icon={BookOpenText} />
              <Stat label={messages.collectionCompletion} value={`${pct}%`} icon={CheckCircle2} />
            </div>

            <SmartContinueButton stories={stories} />
          </div>
        </div>

        {/* Global Progress Line */}
        <div className="mt-8">
          <div lang={language} dir={direction} className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gold/60">
            <span>{messages.collectionProgress}</span>
            <span>{completedCount} / {total} {messages.collectionCompleted}</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/5 border border-white/5 overflow-hidden">
            <div 
              className="h-full bg-gold shadow-[0_0_12px_rgba(212,175,55,0.4)] transition-all duration-1000" 
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SmartContinueButton({ stories }: { stories: any[] }) {
  const { language, direction, messages } = useUiLanguage();
  const completedCount = stories.filter(s => s.completed).length;
  const started = stories.some(s => s.unlocked && (s.progress || s.completed));
  const isFullyCompleted = stories.length > 0 && completedCount === stories.length;

  // Find next story to read (first one not completed)
  const nextStory = stories.find(s => !s.completed) || stories[0];
  // Collections may arrive before their story query, or legitimately be empty.
  if (!nextStory?.id) return null;

  const getLabel = () => {
    if (isFullyCompleted) return messages.collectionReread;
    if (started) return messages.collectionContinue;
    return messages.collectionStart;
  };

  const getIcon = () => {
    if (isFullyCompleted) return <History className="size-4" />;
    return <PlayCircle className="size-4" />;
  };

  return (
    <Link
      to="/story/$id"
      params={{ id: nextStory.id }}
      lang={language}
      dir={direction}
      className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 text-sm font-bold text-black shadow-lg shadow-gold/20 transition hover:scale-105 hover:bg-white active:scale-95"
    >
      {getIcon()}
      {getLabel()}
    </Link>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-gold/10 text-gold">
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] text-white/40">{label}</span>
        <span className="text-sm font-bold text-white">{value}</span>
      </div>
    </div>
  );
}

function Counter({ label, value }: { label: MessageKey; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs border border-white/5">
      <span className="font-bold text-gold">{value}</span>
      <span className="text-muted-foreground"><CatalogText message={label} /></span>
    </div>
  );
}

function Facet({ title, children }: { title: MessageKey; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
        <CatalogText message={title} />
      </h4>
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
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active
          ? "bg-gold font-bold text-black"
          : "bg-black/40 text-muted-foreground border border-white/10 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ms-1 text-[10px] opacity-60">({n})</span>;
}

function EmptyState({ message }: { message: MessageKey }) {
  return (
    <div className="col-span-full py-20 text-center">
      <BookOpenText className="mx-auto size-12 text-muted-foreground/20" />
      <p className="mt-4 text-sm text-muted-foreground"><CatalogText message={message} /></p>
    </div>
  );
}

// Subscribe at display leaves: locale changes must not restart catalog queries or sync.
const STATUS_MESSAGE_KEYS: Record<StoryStatusFilter, MessageKey> = {
  all: "catalogAll", available: "catalogAvailable", in_progress: "catalogReading",
  completed: "catalogCompleted", locked: "catalogLocked",
};
const SORT_MESSAGE_KEYS: Record<StorySortKey, MessageKey> = {
  recommended: "catalogRecommended", newest: "catalogNewest",
  shortest: "catalogShortest", reward: "catalogReward",
};
function CatalogText({ message }: { message: MessageKey }) {
  const { language, direction, messages } = useUiLanguage();
  return <span lang={language} dir={direction}>{messages[message]}</span>;
}
function CatalogSearchInput({ placeholderKey, ...props }: React.ComponentProps<typeof AndroidPlainTextInput> & { placeholderKey: MessageKey }) {
  const { language, messages } = useUiLanguage();
  return <AndroidPlainTextInput {...props} lang={language} dir="auto" placeholder={messages[placeholderKey]} />;
}
function CatalogSortSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { language, direction, messages } = useUiLanguage();
  return <select {...props} lang={language} dir={direction}
    className="rounded-lg border border-gold/25 bg-black/50 px-2 py-1.5 text-xs text-foreground outline-none focus:border-gold/60">
    {(Object.keys(STORY_SORT_LABELS) as StorySortKey[]).map(key =>
      <option key={key} value={key}>{messages[SORT_MESSAGE_KEYS[key]]}</option>)}
  </select>;
}
