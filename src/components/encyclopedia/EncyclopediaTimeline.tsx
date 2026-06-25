// Timeline — a vertical museum rail. Pure presentation: each event is a
// dot on a gold gradient spine, with the year in a circular medallion,
// the title, and an optional description / related-entity link.
import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { TimelineEvent } from "@/types/encyclopediaArticle";

export function EncyclopediaTimeline({ timeline }: { timeline?: TimelineEvent[] }) {
  if (!timeline || timeline.length === 0) return null;
  return (
    <section className="mt-10">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/10 ring-1 ring-gold/30 text-gold">
          <Clock className="size-4.5" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[10px] tracking-[0.32em] text-gold/80">المحطات التاريخية</p>
          <h2 className="font-display text-lg font-bold">الخط الزمني</h2>
        </div>
        <span className="ms-auto rounded-full border border-gold/25 bg-black/30 px-2.5 py-0.5 text-[10px] text-gold/80">
          {timeline.length}
        </span>
      </header>

      <ol className="relative space-y-5 ps-12">
        <span className="pointer-events-none absolute inset-y-2 right-4 w-px bg-gradient-to-b from-gold/70 via-gold/30 to-transparent" />
        {timeline.map((ev, i) => (
          <li key={i} className="relative">
            <span className="absolute -right-[6px] top-1.5 grid size-7 place-items-center rounded-full bg-gradient-to-br from-gold/40 to-gold/10 ring-2 ring-background">
              <span className="size-2 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,90,0.7)]" />
            </span>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-4 transition hover:border-gold/30 hover:bg-surface-2/60">
              <div className="flex items-baseline gap-3">
                <span className="font-display rounded-md bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold tabular-nums">
                  {ev.year}
                </span>
                <span className="font-display text-[14px] font-bold text-foreground/95">
                  {ev.title}
                </span>
              </div>
              {ev.description && (
                <p className="mt-2 text-[12.5px] leading-7 text-muted-foreground">
                  {ev.description}
                </p>
              )}
              {ev.related && (
                <Link
                  to="/encyclopedia/entity/$id"
                  params={{ id: ev.related.slug }}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-gold/85 underline-offset-4 hover:underline hover:text-gold"
                >
                  ← {ev.related.label ?? ev.related.slug}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
