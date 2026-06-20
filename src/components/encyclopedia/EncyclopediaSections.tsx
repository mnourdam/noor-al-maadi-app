// Main content sections — multi-paragraph article body, one card per section.
import { BookOpen } from "lucide-react";
import type { ContentSection } from "@/types/encyclopediaArticle";

export function EncyclopediaSections({ sections }: { sections?: ContentSection[] }) {
  if (!sections || sections.length === 0) return null;
  return (
    <section className="mt-6 space-y-4">
      {sections.map((s, i) => {
        const paragraphs = s.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        return (
          <article key={i} className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <h3 className="font-display mb-2 flex items-center gap-2 text-sm font-bold">
              <span className="text-base leading-none">{s.icon ?? <BookOpen className="size-4 text-gold" />}</span>
              {s.heading}
            </h3>
            <div className="space-y-2">
              {paragraphs.length > 0 ? paragraphs.map((p, j) => (
                <p key={j} className="text-[13px] leading-7 text-foreground/90">{p}</p>
              )) : (
                <p className="text-[12px] text-muted-foreground italic">(لا يوجد محتوى بعد)</p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
