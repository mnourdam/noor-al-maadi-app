import { Link } from "@tanstack/react-router";
import { BookOpenText, CheckCircle2, PlayCircle, ChevronLeft } from "lucide-react";
import { useStoryCoverSrc } from "@/lib/stories/covers";
import type { StoryCollection } from "@/lib/stories/collections";
import type { StorySummary } from "@/lib/stories/summary";

interface CollectionCardProps {
  collection: StoryCollection;
  stories: StorySummary[];
}

export function CollectionCard({ collection, stories }: CollectionCardProps) {
  // Stats
  const total = stories.length;
  const completed = stories.filter(s => s.completed).length;
  const started = stories.some(s => s.unlocked && (s.progress || s.completed));
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Cover Fallback: if collection has no cover, use the first story's cover
  const firstStoryWithCover = stories.find(s => s.cover_media_id);
  const coverSource = {
    cover_media_id: collection.cover_media_id || firstStoryWithCover?.cover_media_id,
    id: collection.cover_media_id ? `collection-${collection.id}` : firstStoryWithCover?.id
  };
  
  const cover = useStoryCoverSrc(coverSource as any);

  return (
    <Link
      to="/stories"
      search={{ collection: collection.id }}
      className="group relative block aspect-[16/10] w-full overflow-hidden rounded-2xl border border-gold/25 bg-black/60 shadow-lg ring-1 ring-inset ring-white/5 transition hover:border-gold/60"
    >
      {/* Background Cover */}
      {cover ? (
        <img
          src={cover}
          alt={collection.title_ar}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900">
          <BookOpenText className="size-12 text-gold/20" />
        </div>
      )}

      {/* Overlays */}
      <div 
        className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" 
      />
      
      <div className="absolute inset-0 p-4 flex flex-col justify-end">
        <h3 className="font-display text-lg font-bold text-white drop-shadow-md">
          {collection.title_ar}
        </h3>
        
        {collection.summary_ar && (
          <p className="mt-1 line-clamp-1 text-xs text-white/70">
            {collection.summary_ar}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-white/90">
            <span className="rounded-full bg-black/50 px-2 py-0.5 border border-white/10">
              {total} قصة
            </span>
            {completed > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="size-3" />
                {completed} مكتملة
              </span>
            )}
          </div>

          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-gold">
            {started ? (
              <>
                <PlayCircle className="size-3.5" />
                متابعة
              </>
            ) : (
              <>
                استكشف السلسلة
                <ChevronLeft className="size-3.5" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div 
            className="h-full bg-gold transition-all duration-500" 
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </Link>
  );
}
