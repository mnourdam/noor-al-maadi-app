// Sources — scholarly/external citations.
import { ExternalLink, Library } from "lucide-react";
import type { ArticleSource } from "@/types/encyclopediaArticle";

export function EncyclopediaSources({ sources }: { sources?: ArticleSource[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <Library className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">المراجع</h2>
      </div>
      <ul className="space-y-1.5 rounded-2xl border border-white/10 bg-surface/60 p-4">
        {sources.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-6 text-foreground/85">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-gold/70" />
            <div className="min-w-0 flex-1">
              <span className="font-display font-bold">{s.title}</span>
              {s.author && <span className="text-muted-foreground"> — {s.author}</span>}
              {s.note && <p className="text-[11px] text-muted-foreground">{s.note}</p>}
            </div>
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1 text-[10px] text-gold/85 hover:text-gold"
              >
                <ExternalLink className="size-3" /> رابط
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
