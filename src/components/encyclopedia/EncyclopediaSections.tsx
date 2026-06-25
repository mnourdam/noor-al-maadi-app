// Main narrative sections — each one rendered with elegant typography,
// generous reading width and a soft gold rule under the heading. Designed
// to feel like turning pages in a historical archive.
import { BookOpen } from "lucide-react";
import type { ContentSection } from "@/types/encyclopediaArticle";

export function EncyclopediaSections({ sections }: { sections?: ContentSection[] }) {
  if (!sections || sections.length === 0) return null;
  return (
    <section className="mt-10 space-y-7">
      {sections.map((s, i) => {
        const paragraphs = s.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        return (
          <article
            key={i}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-surface/70 via-surface/40 to-black/20 px-5 py-6"
          >
            <header className="mb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-gold/10 ring-1 ring-gold/25 text-gold">
                  <BookOpen className="size-3.5" strokeWidth={1.5} />
                </span>
                <h3 className="font-display text-[17px] font-bold text-foreground/95">
                  {s.heading}
                </h3>
              </div>
              <span className="mt-3 block h-px w-16 bg-gradient-to-l from-gold/60 to-transparent" />
            </header>

            <div className="space-y-4">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, j) => (
                  <p
                    key={j}
                    className="text-[14.5px] leading-[2] text-foreground/90"
                  >
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-[12px] italic text-muted-foreground">
                  (لا يوجد محتوى بعد)
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
