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
  const completedCount = stories.filter(s => s.completed).length;
  const started = stories.some(s => s.unlocked && (s.progress || s.completed));
  const isFullyCompleted = total > 0 && completedCount === total;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // Cover Fallback: if collection has no cover, use the first story's cover
  const firstStoryWithCover = stories.find(s => s.cover_media_id);
  const coverSource = {
    cover_media_id: collection.cover_media_id || firstStoryWithCover?.cover_media_id,
    id: collection.cover_media_id ? `collection-${collection.id}` : firstStoryWithCover?.id
  };
  
  const cover = useStoryCoverSrc(coverSource as any);

  // Status Badge Label
  const getStatusLabel = () => {
    if (isFullyCompleted) return "مكتملة";
    if (started) return "قيد القراءة";
    return "جديدة";
  };

  const getStatusColor = () => {
    if (isFullyCompleted) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (started) return "bg-gold/20 text-gold border-gold/30";
    return "bg-white/10 text-white/70 border-white/20";
  };

  return (
    <Link
      to="/stories"
      search={{ collection: collection.id }}
      className="group relative block aspect-[16/9] w-full overflow-hidden rounded-2xl border border-gold/25 bg-black/60 shadow-2xl ring-1 ring-inset ring-white/5 transition-all duration-500 hover:border-gold/60 hover:-translate-y-1"
    >
      {/* Background Cover */}
      {cover ? (
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={cover}
            alt={collection.title_ar}
            className="h-full w-full object-cover transition duration-1000 group-hover:scale-110"
          />
          {/* Book-like Overlay (Darker Gradient) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-90" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900">
          <BookOpenText className="size-16 text-gold/10" />
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 p-5 flex flex-col justify-end">
        {/* Top Badges */}
        <div className="absolute top-4 end-4 flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-md ${getStatusColor()}`}>
            {getStatusLabel()}
          </span>
        </div>

        {/* Text Details */}
        <div className="relative space-y-1">
          <h3 className="font-display text-xl font-bold text-white drop-shadow-lg transition-colors group-hover:text-gold">
            {collection.title_ar}
          </h3>
          
          {collection.summary_ar && (
            <p className="line-clamp-2 text-xs leading-relaxed text-white/60">
              {collection.summary_ar}
            </p>
          )}
        </div>

        {/* Footer Stats & Progress */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-white/80">
            <span className="flex items-center gap-1.5">
              <BookOpenText className="size-3 text-gold" />
              {total} قصص
            </span>
            <span className="text-gold">{pct}%</span>
          </div>

          {/* Golden Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-gold/80 to-gold transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(212,175,55,0.4)]" 
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* Decorative Shine Effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
    </Link>
  );
}
