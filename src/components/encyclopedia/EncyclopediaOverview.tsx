// Overview — opens like a dossier intro card with an ornate gold rule
// and an oversized first letter (drop-cap), evoking the opening page of
// a historical archive. Renders nothing if empty.
import { ScrollText } from "lucide-react";

export function EncyclopediaOverview({ overview }: { overview?: string }) {
  if (!overview?.trim()) return null;
  const paragraphs = overview.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
        <ScrollText className="size-4 text-gold/90" strokeWidth={1.5} />
        <span className="font-display text-[11px] tracking-[0.4em] text-gold/85">
          مدخل الأرشيف
        </span>
        <ScrollText className="size-4 text-gold/90" strokeWidth={1.5} />
        <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
      </div>

      <article className="relative overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-br from-surface/80 via-surface/40 to-black/30 px-6 py-7 shadow-[0_20px_60px_-30px_rgba(212,175,90,0.35)]">
        <div className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 size-72 rounded-full bg-gold/5 blur-3xl" />
        <div className="relative space-y-4">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={`text-[15px] leading-[2] text-foreground/95 ${
                i === 0
                  ? "first-letter:font-display first-letter:text-[42px] first-letter:font-bold first-letter:text-gold first-letter:leading-[1] first-letter:me-2 first-letter:float-start"
                  : ""
              }`}
            >
              {p}
            </p>
          ))}
        </div>
      </article>
    </section>
  );
}
