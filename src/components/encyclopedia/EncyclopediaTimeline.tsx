// Timeline — year/title rail with optional description and related link.
import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { TimelineEvent } from "@/types/encyclopediaArticle";

export function EncyclopediaTimeline({ timeline }: { timeline?: TimelineEvent[] }) {
  if (!timeline || timeline.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">الخط الزمني</h2>
      </div>
      <ol className="relative space-y-3 rounded-2xl border border-white/10 bg-surface/60 p-4 ps-6">
        <span className="absolute inset-y-4 right-3 w-px bg-gradient-to-b from-gold/60 via-gold/20 to-transparent" />
        {timeline.map((ev, i) => (
          <li key={i} className="relative">
            <span className="absolute -right-[14px] top-1.5 grid size-2.5 place-items-center rounded-full bg-gold ring-2 ring-background" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[12px] font-bold text-gold tabular-nums">{ev.year}</span>
              <span className="font-display text-[13px] font-bold">{ev.title}</span>
            </div>
            {ev.description && (
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{ev.description}</p>
            )}
            {ev.related && (
              <Link
                to="/encyclopedia/entity/$id"
                params={{ id: ev.related.slug }}
                className="mt-1 inline-block text-[10px] text-gold/85 underline-offset-2 hover:underline"
              >
                {ev.related.label ?? ev.related.slug}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
