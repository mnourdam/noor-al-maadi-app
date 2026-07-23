// ============================================================
// WorldStoriesSection — per-World Stories section (P4.1)
// ------------------------------------------------------------
// Informational only. Rendered inside worlds/$slug. Does NOT
// affect world progress percentages (world progress remains
// campaigns/entities/investigations/museum — Phase 1d).
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ArrowLeft } from "lucide-react";
import { listStoriesSummary } from "@/lib/stories/summary";
import { StoryCard } from "@/components/stories/StoryCard";

export function WorldStoriesSection({ worldSlug }: { worldSlug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stories-summary", worldSlug],
    queryFn: () => listStoriesSummary(worldSlug),
    staleTime: 60_000,
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section className="mt-8" dir="rtl" aria-label="قصص هذا العالم">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpenText className="size-4 text-gold" />
          <h2 className="font-display text-base font-bold">قصص من هذا العالم</h2>
          <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
            {data.length}
          </span>
        </div>
        <Link
          to="/stories"
          search={{ world: worldSlug } as never}
          className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline"
        >
          كل القصص <ArrowLeft className="size-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        هذه القصص جزء من هذا العالم — قراءتها لا تؤثر على نسبة إتمام العالم.
      </p>
    </section>
  );
}
